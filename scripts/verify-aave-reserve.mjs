// Direct on-chain verification that cUSD is a live, usable Aave V3 Celo
// reserve for CeloSaveAutoDepositRouter's supply(cUSD, ..., onBehalfOf) call
// — WITHOUT requiring a Foundry fork.
//
// This exists specifically because `forge test --fork-url` currently panics
// on Celo: Foundry v1.7.x treats Celo as an OP-stack chain and expects an
// "Isthmus" L1 operator fee scalar that Celo doesn't expose the same way
// (op-revm/src/l1block.rs), so the fork crashes before any test logic runs.
// That's an upstream Foundry bug, not a bug in this repo or this contract —
// but it means the fork suite (packages/contracts/test/*.fork.t.sol) can't
// currently run end-to-end. Until upstream fixes it, THIS script is the
// pre-deployment gate for the Aave-reserve assumption the router depends on.
// Re-run it before every deployment, not just once.
//
// Checks, all via real eth_call against CELO_RPC_URL (no simulation, no
// cached/indexed data):
//   1. The configured aToken's UNDERLYING_ASSET_ADDRESS() actually equals
//      CUSD — catches a wrong/stale aToken constant before it misleads
//      anything downstream.
//   2. The aToken's own POOL() matches the Pool address resolved fresh from
//      AAVE_POOL_ADDRESSES_PROVIDER.getPool() — the exact same resolution
//      path the router itself uses at construction — and both match the
//      hardcoded AAVE_POOL constant. A mismatch here means the router would
//      deploy pointing at the wrong Pool.
//   3. cUSD's reserve is active, not frozen, not paused. Uses Aave's own
//      IPoolDataProvider getters (getReserveConfigurationData, getPaused)
//      rather than hand-decoding the raw Pool.getConfiguration() bitmap —
//      fewer places for a bit-offset mistake on our side to silently
//      produce a wrong PASS.
//   4. cUSD's supply cap (if any) has headroom versus the aToken's current
//      totalSupply().
//
// Run:
//   CELO_RPC_URL=https://forno.celo.org node scripts/verify-aave-reserve.mjs
//
// Exits non-zero with a clear STOP on any failure or any reverted call —
// this is meant to gate deployment, not just inform it.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createPublicClient, http, getAddress } from 'viem';
import { celo } from 'viem/chains';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONTRACTS_FILE = join(__dir, '..', 'packages', 'app', 'src', 'lib', 'contracts.ts');

const rpcUrl = process.env.CELO_RPC_URL;
if (!rpcUrl) {
  console.error(
    'STOP: set CELO_RPC_URL to a Celo mainnet (chainId 42220) RPC endpoint, e.g.:\n' +
      '  CELO_RPC_URL=https://forno.celo.org node scripts/verify-aave-reserve.mjs'
  );
  process.exit(1);
}

const source = readFileSync(CONTRACTS_FILE, 'utf8');
function extractConst(name) {
  const m = source.match(new RegExp(`export const ${name} = "(0x[a-fA-F0-9]{40})" as const;`));
  if (!m) {
    console.error(`STOP: could not find "${name}" in ${CONTRACTS_FILE} — has it been renamed or removed?`);
    process.exit(1);
  }
  return getAddress(m[1]);
}

const CUSD = extractConst('CUSD');
const AAVE_POOL = extractConst('AAVE_POOL');
const AAVE_DATA_PROVIDER = extractConst('AAVE_DATA_PROVIDER');
const AAVE_POOL_ADDRESSES_PROVIDER = extractConst('AAVE_POOL_ADDRESSES_PROVIDER');
const CUSD_A_TOKEN = extractConst('CUSD_A_TOKEN');

const aTokenAbi = [
  { name: 'UNDERLYING_ASSET_ADDRESS', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'POOL', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const poolAddressesProviderAbi = [
  { name: 'getPool', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
];

const dataProviderAbi = [
  {
    name: 'getReserveConfigurationData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'decimals', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'liquidationThreshold', type: 'uint256' },
      { name: 'liquidationBonus', type: 'uint256' },
      { name: 'reserveFactor', type: 'uint256' },
      { name: 'usageAsCollateralEnabled', type: 'bool' },
      { name: 'borrowingEnabled', type: 'bool' },
      { name: 'stableBorrowRateEnabled', type: 'bool' },
      { name: 'isActive', type: 'bool' },
      { name: 'isFrozen', type: 'bool' },
    ],
  },
  {
    name: 'getReserveCaps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'borrowCap', type: 'uint256' },
      { name: 'supplyCap', type: 'uint256' },
    ],
  },
  {
    name: 'getPaused',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: 'isPaused', type: 'bool' }],
  },
];

const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });

let failed = false;
function report(ok, label, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed = true;
}

async function callOrFail(label, fn) {
  try {
    return await fn();
  } catch (err) {
    report(false, label, `call reverted or failed — ${err.shortMessage ?? err.message}`);
    return null;
  }
}

async function main() {
  console.log(`Verifying against CELO_RPC_URL=${rpcUrl}\n`);

  const resolvedPool = await callOrFail('AAVE_POOL_ADDRESSES_PROVIDER.getPool()', () =>
    client.readContract({
      address: AAVE_POOL_ADDRESSES_PROVIDER,
      abi: poolAddressesProviderAbi,
      functionName: 'getPool',
    })
  );
  if (resolvedPool) {
    report(
      getAddress(resolvedPool) === AAVE_POOL,
      'PoolAddressesProvider.getPool() matches hardcoded AAVE_POOL constant',
      `resolved=${resolvedPool} hardcoded=${AAVE_POOL}`
    );
  }

  const underlying = await callOrFail('aToken.UNDERLYING_ASSET_ADDRESS()', () =>
    client.readContract({ address: CUSD_A_TOKEN, abi: aTokenAbi, functionName: 'UNDERLYING_ASSET_ADDRESS' })
  );
  if (underlying) {
    report(
      getAddress(underlying) === CUSD,
      'aToken.UNDERLYING_ASSET_ADDRESS() equals CUSD',
      `aToken says its underlying is ${underlying}`
    );
  }

  const aTokenPool = await callOrFail('aToken.POOL()', () =>
    client.readContract({ address: CUSD_A_TOKEN, abi: aTokenAbi, functionName: 'POOL' })
  );
  if (aTokenPool) {
    report(getAddress(aTokenPool) === AAVE_POOL, 'aToken.POOL() matches AAVE_POOL', `${aTokenPool}`);
  }

  const configData = await callOrFail('DataProvider.getReserveConfigurationData(CUSD)', () =>
    client.readContract({
      address: AAVE_DATA_PROVIDER,
      abi: dataProviderAbi,
      functionName: 'getReserveConfigurationData',
      args: [CUSD],
    })
  );
  if (configData) {
    const [, , , , , , , , isActive, isFrozen] = configData;
    report(isActive === true, 'cUSD reserve is active');
    report(isFrozen === false, 'cUSD reserve is NOT frozen');
  }

  const isPaused = await callOrFail('DataProvider.getPaused(CUSD)', () =>
    client.readContract({ address: AAVE_DATA_PROVIDER, abi: dataProviderAbi, functionName: 'getPaused', args: [CUSD] })
  );
  if (isPaused !== null) {
    report(isPaused === false, 'cUSD reserve is NOT paused');
  }

  const caps = await callOrFail('DataProvider.getReserveCaps(CUSD)', () =>
    client.readContract({ address: AAVE_DATA_PROVIDER, abi: dataProviderAbi, functionName: 'getReserveCaps', args: [CUSD] })
  );
  if (caps) {
    const [, supplyCap] = caps;
    if (supplyCap === 0n) {
      report(true, 'cUSD supply cap: none configured (unlimited)');
    } else {
      const totalSupply = await callOrFail('aToken.totalSupply()', () =>
        client.readContract({ address: CUSD_A_TOKEN, abi: aTokenAbi, functionName: 'totalSupply' })
      );
      if (totalSupply !== null) {
        const capWei = supplyCap * 10n ** 18n;
        const headroomWei = capWei > totalSupply ? capWei - totalSupply : 0n;
        report(
          totalSupply < capWei,
          'cUSD supply cap has headroom',
          `cap=${supplyCap} tokens, current supply=${(totalSupply / 10n ** 18n).toString()} tokens, headroom=${(headroomWei / 10n ** 18n).toString()} tokens`
        );
      }
    }
  }

  console.log('');
  if (failed) {
    console.error(
      'STOP: one or more Aave-reserve checks failed or could not be verified. ' +
        'Do not deploy CeloSaveAutoDepositRouter until this is resolved.'
    );
    process.exit(1);
  }
  console.log('All Aave V3 Celo cUSD reserve checks passed.');
}

main().catch((err) => {
  console.error('STOP: unexpected error while verifying:', err);
  process.exit(1);
});
