// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {CeloSaveAutoDepositRouter} from "../src/CeloSaveAutoDepositRouter.sol";

interface IERC20Test {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function allowance(address, address) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/// @dev Real Aave V3 IPoolDataProvider surface, used only to read reserve
///      state for the feasibility check below — not used by the router itself.
interface IPoolDataProviderTest {
    function getReserveConfigurationData(address asset)
        external
        view
        returns (
            uint256 decimals,
            uint256 ltv,
            uint256 liquidationThreshold,
            uint256 liquidationBonus,
            uint256 reserveFactor,
            bool usageAsCollateralEnabled,
            bool borrowingEnabled,
            bool stableBorrowRateEnabled,
            bool isActive,
            bool isFrozen
        );

    function getReserveCaps(address asset) external view returns (uint256 borrowCap, uint256 supplyCap);
}

/// @notice Fork tests for CeloSaveAutoDepositRouter. Requires a live Celo
///         mainnet RPC — run with:
///           forge test --match-contract CeloSaveAutoDepositRouterForkTest \
///             --fork-url "$CELO_RPC_URL" -vvv
///         CELO_RPC_URL can be set in packages/contracts/.env (already has an
///         empty placeholder) — e.g. https://forno.celo.org, or any other
///         Celo mainnet (chainId 42220) RPC endpoint. This sandbox cannot
///         reach any RPC endpoint (confirmed: direct connection attempts to
///         forno.celo.org and other public endpoints were blocked by the
///         sandbox's outbound network allowlist), so these tests are written
///         and ready to run but have NOT been executed here — run them
///         wherever real RPC access exists before deploying.
contract CeloSaveAutoDepositRouterForkTest is Test {
    // Real Celo mainnet addresses (chainId 42220) — see packages/app/src/lib/contracts.ts
    address constant AAVE_POOL_ADDRESSES_PROVIDER = 0x9F7Cf9417D5251C59fE94fB9147feEe1aAd9Cea5;
    address constant AAVE_POOL = 0x3E59A31363E2ad014dcbc521c4a0d5757d9f3402;
    address constant AAVE_DATA_PROVIDER = 0x2e0f8D3B1631296cC7c56538D6Eb6032601E15ED;
    address constant CUSD = 0x765DE816845861e75A25fCA122bb6898B8B1282a;
    address constant A_CUSD = 0xBba98352628B0B0c4b40583F593fFCb630935a45; // aCelcUSD

    address constant FEE_RECIPIENT = address(0xFEE5);
    uint16 constant FEE_BPS = 25; // 0.25%, well under the 100 bps ceiling

    CeloSaveAutoDepositRouter router;
    address user = address(0xBEEF);

    function setUp() public {
        string memory rpcUrl = vm.envOr("CELO_RPC_URL", string(""));
        require(bytes(rpcUrl).length > 0, "Set CELO_RPC_URL to a Celo mainnet RPC before running fork tests");
        vm.createSelectFork(rpcUrl);

        router = new CeloSaveAutoDepositRouter(CUSD, AAVE_POOL_ADDRESSES_PROVIDER, FEE_BPS, FEE_RECIPIENT);

        // Fund the test user with real cUSD via forge-std's `deal` cheatcode
        // (overwrites the balance storage slot directly on the forked state).
        // If cUSD's storage layout ever changes in a way `deal` can't infer
        // automatically, replace this with vm.prank(<known cUSD holder>) +
        // a real transfer instead.
        deal(CUSD, user, 10_000 ether);
    }

    /// @notice THE feasibility check this whole design depends on, run
    ///         against real deployed Aave V3 bytecode and real reserve state
    ///         on a Celo mainnet fork — not metadata packages, not a block
    ///         explorer API, an actual eth_call against the real
    ///         IPoolDataProvider. Reports the answer explicitly via the
    ///         assertions below; if any of these fail, the router's core
    ///         premise (supply(cUSD, ..., onBehalfOf) works today) is false
    ///         and this design needs to change before anything is deployed.
    function test_cUSDIsActiveNonFrozenAaveReserveWithSupplyCapHeadroom() public view {
        (,,,,,, , , bool isActive, bool isFrozen) =
            IPoolDataProviderTest(AAVE_DATA_PROVIDER).getReserveConfigurationData(CUSD);

        assertTrue(isActive, "cUSD reserve is not active on Aave V3 Celo");
        assertFalse(isFrozen, "cUSD reserve is frozen on Aave V3 Celo");

        (, uint256 supplyCap) = IPoolDataProviderTest(AAVE_DATA_PROVIDER).getReserveCaps(CUSD);
        if (supplyCap > 0) {
            // supplyCap of 0 means "no cap" in Aave V3's convention; a nonzero
            // cap is expressed in whole tokens (not wei), so scale by decimals
            // before comparing against the aToken's actual total supply.
            uint256 capWei = supplyCap * 1e18;
            uint256 currentSupplyWei = IERC20Test(A_CUSD).totalSupply();
            assertLt(currentSupplyWei, capWei, "cUSD Aave reserve supply cap already reached, no deposit headroom");
        }
    }

    function test_depositForSuppliesToAaveOnBehalfOfUser() public {
        uint256 monthlyAmount = 50 ether; // 50 cUSD, 18 decimals

        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 6);
        router.setPlan(uint128(monthlyAmount), 30 days);
        vm.stopPrank();

        uint256 expectedFee = (monthlyAmount * FEE_BPS) / 10_000;
        uint256 expectedNet = monthlyAmount - expectedFee;

        uint256 userCusdBefore = IERC20Test(CUSD).balanceOf(user);
        uint256 feeRecipientBefore = IERC20Test(CUSD).balanceOf(FEE_RECIPIENT);
        uint256 userATokenBefore = IERC20Test(A_CUSD).balanceOf(user);

        // Permissionless: called by a random third party, not the user and
        // not any privileged "keeper" address.
        address randomCaller = address(0xC0FFEE);
        vm.prank(randomCaller);
        router.depositFor(user, monthlyAmount);

        assertEq(IERC20Test(CUSD).balanceOf(user), userCusdBefore - monthlyAmount, "user cUSD not debited correctly");
        assertEq(
            IERC20Test(CUSD).balanceOf(FEE_RECIPIENT),
            feeRecipientBefore + expectedFee,
            "fee recipient did not receive exact fee"
        );
        // aTokens are minted 1:1 with supplied principal at supply time.
        assertApproxEqAbs(
            IERC20Test(A_CUSD).balanceOf(user),
            userATokenBefore + expectedNet,
            1, // 1 wei tolerance for any rounding in Aave's internal index math
            "user aToken balance did not increase by net supplied amount"
        );

        // Router must never hold a resting balance between transactions.
        assertEq(IERC20Test(CUSD).balanceOf(address(router)), 0, "router retained cUSD after depositFor");
    }

    function test_depositForRevertsBeforeScheduledTime() public {
        uint256 monthlyAmount = 20 ether;
        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 6);
        router.setPlan(uint128(monthlyAmount), 30 days);
        vm.stopPrank();

        router.depositFor(user, monthlyAmount);

        vm.expectRevert(bytes("too early"));
        router.depositFor(user, monthlyAmount);
    }

    function test_depositForRevertsOnAmountMismatch() public {
        uint256 monthlyAmount = 20 ether;
        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 6);
        router.setPlan(uint128(monthlyAmount), 30 days);
        vm.stopPrank();

        vm.expectRevert(bytes("amount mismatch"));
        router.depositFor(user, monthlyAmount + 1);
    }

    /// @notice The specific scenario raised in review: if nobody calls
    ///         depositFor for 6 months, exactly ONE deposit should be
    ///         possible when someone finally does — not six back-to-back
    ///         deposits catching up on the missed cycles.
    function test_sixMonthGapAllowsExactlyOneDeposit() public {
        uint256 monthlyAmount = 10 ether;
        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 12);
        router.setPlan(uint128(monthlyAmount), 30 days);
        vm.stopPrank();

        vm.warp(block.timestamp + 180 days); // 6 months pass, nobody calls it

        // First call after the gap succeeds.
        router.depositFor(user, monthlyAmount);

        // Immediately trying again — even though 6 monthly "slots" were
        // technically missed — must NOT be allowed to catch up in a burst.
        vm.expectRevert(bytes("too early"));
        router.depositFor(user, monthlyAmount);

        // And it isn't eligible again until a full interval after THIS
        // execution, not from the original missed schedule.
        vm.warp(block.timestamp + 29 days);
        vm.expectRevert(bytes("too early"));
        router.depositFor(user, monthlyAmount);

        vm.warp(block.timestamp + 2 days); // now 31 days after the catch-up deposit
        router.depositFor(user, monthlyAmount); // succeeds — proves only one extra deposit total
    }

    function test_cancelPlanThenRevokeAllowanceFullyStopsDeposits() public {
        uint256 monthlyAmount = 15 ether;
        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 6);
        router.setPlan(uint128(monthlyAmount), 30 days);
        router.cancelPlan();
        vm.stopPrank();

        vm.expectRevert(bytes("no active plan"));
        router.depositFor(user, monthlyAmount);

        // Separately: even without cancelPlan, a direct allowance revoke on
        // its own is sufficient to stop future deposits (transferFrom fails).
        vm.startPrank(user);
        router.setPlan(uint128(monthlyAmount), 30 days); // re-subscribe
        IERC20Test(CUSD).approve(address(router), 0); // revoke allowance only
        vm.stopPrank();

        vm.expectRevert(); // ERC20 transferFrom reverts on insufficient allowance
        router.depositFor(user, monthlyAmount);
    }

    function test_setPlanUpdateResetsScheduleToNow() public {
        uint256 monthlyAmount = 5 ether;
        vm.startPrank(user);
        IERC20Test(CUSD).approve(address(router), monthlyAmount * 12);
        router.setPlan(uint128(monthlyAmount), 30 days);
        vm.stopPrank();

        router.depositFor(user, monthlyAmount); // first cycle, nextExecutionTime now ~30 days out

        vm.warp(block.timestamp + 5 days); // well before the next scheduled deposit

        // User updates their plan mid-cycle (e.g. changes the amount).
        vm.prank(user);
        router.setPlan(uint128(monthlyAmount), 30 days);

        // Documented, deliberate behavior: the update re-baselines the
        // schedule to now, so a deposit is immediately possible again even
        // though the original 30-day cycle hadn't elapsed yet.
        router.depositFor(user, monthlyAmount);
    }
}
