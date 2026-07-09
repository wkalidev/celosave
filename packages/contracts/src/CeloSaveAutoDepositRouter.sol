// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal ERC20 interface — only the methods this router calls. No
///      SafeERC20/OZ dependency, matching this repo's existing dependency-free
///      contract style (see CeloSaveRegistry.sol). Safe here because CUSD is
///      a fixed, known-good, standard-compliant ERC20 (real Celo Dollar
///      contract) — not an arbitrary user-supplied token.
interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Minimal Aave V3 Pool interface — only the one method this router calls.
interface IAavePoolMinimal {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
}

/// @dev Minimal Aave V3 PoolAddressesProvider interface — queried once, at
///      construction, to resolve the canonical Pool address the same way
///      Aave's own integrations do, instead of hardcoding a Pool address.
interface IPoolAddressesProviderMinimal {
    function getPool() external view returns (address);
}

/// @title CeloSaveAutoDepositRouter
/// @notice Non-custodial recurring-deposit router for CeloSave's Auto-Save
///         feature. A user grants this contract a capped, revocable cUSD
///         allowance and registers a monthly plan (amount + interval).
///         Anyone — CeloSave's backend keeper, the user themselves, or any
///         third party — can then call `depositFor` to execute one cycle: it
///         atomically pulls exactly the plan's fixed amount from the user via
///         transferFrom, skims an optional protocol fee (immutable, hard-capped
///         at 1%, sent to an immutable recipient), and supplies the remainder
///         to Aave V3 `onBehalfOf` the user, so aTokens are minted directly
///         into the user's own wallet.
///
/// @dev    Immutable. No owner, no admin function, no pause switch, no
///         upgrade path — this contract cannot be changed after deployment,
///         by CeloSave or anyone else. It never holds cUSD at rest: every
///         deposit cycle pulls in and pushes back out (as fee + Aave supply)
///         the same amount within one atomic transaction. The only funds it
///         can ever move are bounded by two independent, user-controlled
///         limits that must BOTH hold:
///           1. the live ERC20 allowance the user has granted this contract
///              (caps the total amount ever pullable, revocable any time via
///              a direct `IERC20(CUSD).approve(router, 0)` call the user's
///              own wallet signs — no action from CeloSave required), and
///           2. the on-chain plan this contract stores per user (caps the
///              per-cycle amount and enforces a minimum time between
///              cycles), settable and cancellable only by the user for
///              their own address.
///         A permissionless caller cannot move funds faster or in larger
///         amounts than the user's own plan allows, because the schedule and
///         amount are enforced by the contract's own state, not by who calls it.
contract CeloSaveAutoDepositRouter {
    /// @notice A user's recurring auto-deposit plan.
    struct Plan {
        uint128 monthlyAmount;     // exact gross cUSD (18 decimals) pulled per cycle, fee-inclusive
        uint64 interval;           // minimum seconds between cycles
        uint64 nextExecutionTime;  // earliest timestamp the next cycle may run
        bool active;               // false = no plan configured / cancelled
    }

    /// @notice Floor on `interval` so a plan can never be configured to allow
    ///         effectively-continuous draining (e.g. interval = 0). This is a
    ///         compile-time constant — there is no admin key that could ever
    ///         lower it.
    uint256 public constant MIN_INTERVAL = 1 days;

    /// @notice Hard ceiling on the protocol fee, enforced once in the
    ///         constructor. Even the deployer cannot set a higher fee — a
    ///         constructor call with feeBps > 100 simply reverts, and there
    ///         is no function anywhere in this contract that could raise the
    ///         fee after deployment.
    uint256 public constant MAX_FEE_BPS = 100; // 1%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @notice cUSD — the only asset this router ever touches. Fixed forever
    ///         at deployment; there is no function to change it.
    address public immutable CUSD;

    /// @notice The Aave V3 Pool this router supplies into, resolved once at
    ///         deployment via the official PoolAddressesProvider (the same
    ///         indirection Aave's own SDKs use) rather than a hardcoded
    ///         address. Fixed forever after construction.
    address public immutable AAVE_POOL;

    /// @notice Protocol fee in basis points, taken out of the gross deposit
    ///         amount (not added on top of it) — i.e. a user with a 50 cUSD/
    ///         month plan always sees exactly 50 cUSD leave their wallet per
    ///         cycle; the fee is a slice of that 50, not an extra charge.
    ///         Immutable — fixed at deployment, never changeable after.
    uint16 public immutable FEE_BPS;

    /// @notice Where the fee (if any) is sent. Immutable. If FEE_BPS is 0 this
    ///         is never used and may be the zero address.
    address public immutable FEE_RECIPIENT;

    mapping(address => Plan) public plans;

    event PlanSet(address indexed user, uint256 monthlyAmount, uint256 interval, uint256 nextExecutionTime);
    event PlanCancelled(address indexed user);
    event Deposited(
        address indexed user,
        uint256 grossAmount,
        uint256 fee,
        uint256 netSupplied,
        uint256 timestamp,
        uint256 nextExecutionTime
    );

    uint256 private _locked = 1;

    /// @dev Minimal hand-rolled reentrancy guard (no OZ dependency, matching
    ///      this repo's style). Defense-in-depth: CUSD is a standard ERC20
    ///      with no transfer hooks, so there is no known reentrancy vector
    ///      today, but this costs almost nothing and removes the question.
    modifier nonReentrant() {
        require(_locked == 1, "reentrant");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address cusd, address poolAddressesProvider, uint16 feeBps, address feeRecipient) {
        require(cusd != address(0), "cusd=0");
        require(poolAddressesProvider != address(0), "provider=0");
        require(feeBps <= MAX_FEE_BPS, "fee too high");
        require(feeRecipient != address(0) || feeBps == 0, "recipient=0");

        CUSD = cusd;
        FEE_BPS = feeBps;
        FEE_RECIPIENT = feeRecipient;

        address pool = IPoolAddressesProviderMinimal(poolAddressesProvider).getPool();
        require(pool != address(0), "pool=0");
        AAVE_POOL = pool;

        // One-time, immutable approval so this router can push cUSD into
        // Aave on a user's behalf during `depositFor`. Safe as an unlimited
        // approval specifically because this router never holds a resting
        // cUSD balance between transactions: every cUSD unit it ever
        // receives via transferFrom is either forwarded to FEE_RECIPIENT or
        // supplied onward to Aave within that same atomic call, so there is
        // nothing sitting here for this approval to expose outside a single
        // transaction's lifetime.
        require(IERC20Minimal(cusd).approve(pool, type(uint256).max), "approve failed");
    }

    /// @notice Create or update the caller's own auto-deposit plan. Callable
    ///         only by the user themselves for their own address — there is
    ///         no function anywhere in this contract that lets anyone set or
    ///         change another user's plan.
    /// @dev    Resets `nextExecutionTime` to now, so updating an existing
    ///         plan's amount/interval makes it immediately chargeable again
    ///         rather than preserving the old schedule. This is deliberate
    ///         (an update should re-baseline, not silently inherit a stale
    ///         clock) but the UI should warn the user before calling this on
    ///         an already-active plan, since it can shorten the gap since
    ///         their last deposit.
    /// @param monthlyAmount Exact gross cUSD amount (18 decimals) to pull each
    ///        cycle, fee inclusive.
    /// @param interval Minimum seconds between cycles; must be >= MIN_INTERVAL.
    function setPlan(uint128 monthlyAmount, uint64 interval) external {
        require(monthlyAmount > 0, "amount=0");
        require(interval >= MIN_INTERVAL, "interval too short");

        uint64 nextExecutionTime = uint64(block.timestamp);
        plans[msg.sender] = Plan({
            monthlyAmount: monthlyAmount,
            interval: interval,
            nextExecutionTime: nextExecutionTime,
            active: true
        });

        emit PlanSet(msg.sender, monthlyAmount, interval, nextExecutionTime);
    }

    /// @notice Cancel the caller's own plan. Does NOT touch the caller's cUSD
    ///         allowance to this router — this contract has no permission to
    ///         change a user's ERC20 allowance on their behalf. Revoking the
    ///         allowance is a separate, direct `IERC20(CUSD).approve(router, 0)`
    ///         call the user's own wallet signs independently. The UI's
    ///         "cancel" action performs both calls back-to-back, still fully
    ///         self-service with no backend step.
    function cancelPlan() external {
        delete plans[msg.sender];
        emit PlanCancelled(msg.sender);
    }

    /// @notice Execute one deposit cycle for `user`. Callable by anyone — a
    ///         CeloSave backend keeper, the user, or any third party — with
    ///         no special privilege required, because the schedule and
    ///         amount are enforced by this contract's own state, not by
    ///         caller identity:
    ///           - `amount` must equal exactly the amount the user configured
    ///             in their own plan (this makes a caller state its
    ///             expectation explicitly; a stale or buggy caller reverts
    ///             instead of silently using the wrong number),
    ///           - the plan must be active,
    ///           - and `nextExecutionTime` must have passed.
    /// @dev    Schedule update happens before any external call
    ///         (checks-effects-interactions). The next slot is anchored to
    ///         the *previous* schedule (`plan.nextExecutionTime + interval`),
    ///         not to `block.timestamp`, so a keeper that's consistently a
    ///         little late doesn't cause the effective cadence to drift
    ///         later over time. If one or more whole cycles were missed
    ///         (i.e. that anchored slot is still in the past or now), it is
    ///         clamped forward to `block.timestamp + interval` — a gap of any
    ///         length still only ever permits a single catch-up deposit, and
    ///         the following call is never eligible until a full interval
    ///         after THIS execution. Combined with the reentrancy guard, this
    ///         also makes two calls in the same block impossible: the second
    ///         would see a `nextExecutionTime` already pushed into the future
    ///         by the first.
    function depositFor(address user, uint256 amount) external nonReentrant {
        Plan storage plan = plans[user];
        require(plan.active, "no active plan");
        require(amount == plan.monthlyAmount, "amount mismatch");
        require(block.timestamp >= plan.nextExecutionTime, "too early");

        uint256 next = uint256(plan.nextExecutionTime) + plan.interval;
        if (next <= block.timestamp) {
            next = block.timestamp + plan.interval;
        }
        plan.nextExecutionTime = uint64(next);

        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 netAmount = amount - fee;

        require(IERC20Minimal(CUSD).transferFrom(user, address(this), amount), "transferFrom failed");
        if (fee > 0) {
            require(IERC20Minimal(CUSD).transfer(FEE_RECIPIENT, fee), "fee transfer failed");
        }
        IAavePoolMinimal(AAVE_POOL).supply(CUSD, netAmount, user, 0);

        emit Deposited(user, amount, fee, netAmount, block.timestamp, next);
    }
}
