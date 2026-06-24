"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useIsMiniPay } from "@/hooks/useMiniPay";
import { useSuperfluidStream } from "@/hooks/useSuperfluidStream";
import { monthlyToFlowRate, flowRateToMonthly } from "@/lib/sf-abis";
import { TREASURY } from "@/lib/contracts";

const MONTHLY_PRESETS_USDC_RAW = [
  { label: "$5", raw: 5_000_000n },
  { label: "$10", raw: 10_000_000n },
  { label: "$25", raw: 25_000_000n },
  { label: "$50", raw: 50_000_000n },
];

const STEP_LABELS: Record<string, string> = {
  deploying_wrapper: "Deploying USDCx wrapper (one-time)…",
  approving_usdc: "Approving USDC…",
  wrapping: "Wrapping USDC → USDCx…",
  creating_flow: "Creating stream…",
  cancelling: "Cancelling subscription…",
};

export function SubscriptionsDashboard() {
  const { isConnected } = useAccount();
  const isMiniPay = useIsMiniPay();
  const {
    step,
    error,
    usdcx,
    streamInfo,
    liveBalance,
    subscribe,
    cancelSubscription,
    reset,
  } = useSuperfluidStream();

  const [selectedRaw, setSelectedRaw] = useState<bigint>(10_000_000n);
  const [customAmount, setCustomAmount] = useState("");

  const effectiveRaw = customAmount
    ? BigInt(Math.round(Number(customAmount) * 1_000_000))
    : selectedRaw;

  const flowRate = monthlyToFlowRate(effectiveRaw);
  const tooSmall = flowRate <= 0n;
  // Actual monthly amount that will stream (may differ from preset due to integer arithmetic)
  const actualMonthlyRaw = tooSmall ? 0n : flowRateToMonthly(flowRate);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-4xl">🔄</div>
        <h2 className="text-xl font-semibold">Auto-Save</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Connect your wallet to set up a recurring savings stream powered by Superfluid.
        </p>
        {!isMiniPay && (
          <div className="mt-2">
            <ConnectButton />
          </div>
        )}
      </div>
    );
  }

  // In-progress spinner
  if (
    step === "deploying_wrapper" ||
    step === "approving_usdc" ||
    step === "wrapping" ||
    step === "creating_flow" ||
    step === "cancelling"
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-10 h-10 border-4 border-[#07955F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-700">{STEP_LABELS[step]}</p>
        {step === "deploying_wrapper" && (
          <p className="text-xs text-gray-400 max-w-xs">
            USDCx doesn&apos;t exist on Celo yet — this one-time transaction deploys it for everyone.
          </p>
        )}
      </div>
    );
  }

  // Active subscription card
  if (streamInfo?.isActive) {
    return (
      <div className="flex flex-col gap-5 px-4 py-6 max-w-sm mx-auto">
        <div className="bg-gradient-to-br from-[#07955F] to-emerald-400 rounded-2xl p-5 text-white">
          <div className="text-xs font-medium opacity-80 mb-1">Streaming to savings</div>
          <div className="text-3xl font-bold">{streamInfo.monthlyDisplay}</div>
          <div className="text-sm opacity-80">per month</div>
          <div className="mt-4 border-t border-white/20 pt-3">
            <div className="text-xs opacity-70">Your USDCx balance (live)</div>
            <div className="text-xl font-semibold tabular-nums">{liveBalance}</div>
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Flow rate</span>
            <span className="font-mono">{streamInfo.flowRate.toString()} units/s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Protocol</span>
            <span>Superfluid CFA v1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Streaming to</span>
            <span className="font-mono text-xs">
              {TREASURY.slice(0, 6)}…{TREASURY.slice(-4)}
            </span>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center">
          Stream continues until you cancel or your USDCx runs out.
          Top up by wrapping more USDC at any time.
        </p>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={cancelSubscription}
          className="w-full border border-red-300 text-red-600 font-semibold rounded-xl py-3 hover:bg-red-50 transition-colors"
        >
          Cancel Subscription
        </button>
      </div>
    );
  }

  // Success / cancelled states
  if (step === "success" || step === "cancelled") {
    const isSuccess = step === "success";
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-5xl">{isSuccess ? "✅" : "⏹️"}</div>
        <h2 className="text-xl font-semibold">
          {isSuccess ? "Subscription active!" : "Subscription cancelled"}
        </h2>
        <p className="text-sm text-gray-500 max-w-xs">
          {isSuccess
            ? "Your USDC is now streaming to CeloSave every second. It will be deposited into Aave to earn yield."
            : "Your stream has been stopped. Any remaining USDCx can be unwrapped back to USDC."}
        </p>
        <button
          onClick={reset}
          className="mt-2 px-6 py-2 border border-gray-300 rounded-xl text-sm font-medium"
        >
          {isSuccess ? "View Dashboard" : "Set Up New Subscription"}
        </button>
      </div>
    );
  }

  // Setup form (idle / error)
  return (
    <div className="flex flex-col gap-5 px-4 py-6 max-w-sm mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Auto-Save with Superfluid</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Set once — stream USDC every second to earn yield.
        </p>
      </div>

      {/* Amount selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Monthly amount</label>
        <div className="grid grid-cols-4 gap-2">
          {MONTHLY_PRESETS_USDC_RAW.map(({ label, raw }) => (
            <button
              key={label}
              onClick={() => { setSelectedRaw(raw); setCustomAmount(""); }}
              className={`border rounded-xl py-2.5 text-sm font-medium transition-colors ${
                !customAmount && selectedRaw === raw
                  ? "bg-[#07955F] text-white border-[#07955F]"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="Custom USD amount"
          value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); setSelectedRaw(0n); }}
          min="3"
          step="1"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      {/* Flow rate preview */}
      {effectiveRaw > 0n && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">You will stream</span>
            <span className="font-medium">
              {tooSmall ? "—" : `$${(Number(actualMonthlyRaw) / 1e6).toFixed(2)} USDC/mo`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Per second</span>
            <span className="font-mono text-xs">
              {tooSmall ? "—" : `${flowRate.toString()} raw/s`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Upfront wrap</span>
            <span>
              {tooSmall ? "—" : `$${(Number(actualMonthlyRaw) * 2 / 1e6).toFixed(2)} USDC (2 months)`}
            </span>
          </div>
          {!usdcx.isDeployed && (
            <div className="border-t border-gray-200 pt-2 text-xs text-amber-600">
              ⚠ USDCx wrapper not yet deployed — one extra transaction required (permissionless, one-time for all users)
            </div>
          )}
          {tooSmall && (
            <div className="text-xs text-red-500">
              Minimum ~$2.60/month (1 unit/sec for 6-decimal tokens)
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={() => subscribe(effectiveRaw)}
        disabled={tooSmall || effectiveRaw <= 0n}
        className="w-full bg-[#07955F] text-white font-semibold rounded-xl py-3 disabled:opacity-50"
      >
        Start Auto-Save
      </button>

      <p className="text-xs text-center text-gray-400">
        Powered by{" "}
        <span className="text-gray-600 font-medium">Superfluid</span> · Cancel anytime · No lock-up
      </p>
    </div>
  );
}

