"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/connect-button";
import { useIsMiniPay } from "@/hooks/useMiniPay";
import { useAutoDeposit, assertValidAddresses, nextDepositLabel } from "@/hooks/useAutoDeposit";
import { formatCusd, parseCusd } from "@/lib/cusd-format";
import { DEFAULT_APPROVAL_CYCLES } from "@/lib/router-abi";

const MONTHLY_PRESETS_CUSD_RAW = [
  { label: "$5", raw: 5n * 10n ** 18n },
  { label: "$10", raw: 10n * 10n ** 18n },
  { label: "$25", raw: 25n * 10n ** 18n },
  { label: "$50", raw: 50n * 10n ** 18n },
];

const APPROVAL_CYCLE_OPTIONS = [3, 6, 12];

const STEP_LABELS: Record<string, string> = {
  checking: "Checking your cUSD allowance…",
  approving: "Approving cUSD…",
  setting_plan: "Setting up your plan…",
  cancelling: "Cancelling…",
  depositing: "Sending this month's deposit…",
};

export function SubscriptionsDashboard() {
  const { isConnected } = useAccount();
  const isMiniPay = useIsMiniPay();
  const {
    step,
    error,
    plan,
    allowance,
    remainingCycles,
    lowAllowanceWarning,
    isEligibleNow,
    subscribe,
    cancel,
    depositNow,
    reset,
  } = useAutoDeposit();

  const [selectedRaw, setSelectedRaw] = useState<bigint>(10n * 10n ** 18n);
  const [customAmount, setCustomAmount] = useState("");
  const [approvalCycles, setApprovalCycles] = useState<number>(DEFAULT_APPROVAL_CYCLES);

  const effectiveRaw = customAmount ? parseCusd(customAmount) : selectedRaw;
  const totalApprovalRaw = effectiveRaw * BigInt(approvalCycles);

  const configError = assertValidAddresses();

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-4xl">🔄</div>
        <h2 className="text-xl font-semibold">Auto-Save</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Connect your wallet to set up a monthly auto-deposit into your own Aave savings.
        </p>
        {!isMiniPay && (
          <div className="mt-2">
            <ConnectButton />
          </div>
        )}
      </div>
    );
  }

  if (configError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-4xl">🚧</div>
        <h2 className="text-xl font-semibold">Auto-Save is not live yet</h2>
        <p className="text-sm text-gray-500 max-w-xs">{configError}</p>
      </div>
    );
  }

  // In-progress spinner
  if (step === "checking" || step === "approving" || step === "setting_plan" || step === "cancelling" || step === "depositing") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="w-10 h-10 border-4 border-[#07955F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-gray-700">{STEP_LABELS[step]}</p>
      </div>
    );
  }

  // Active plan card
  if (plan?.active) {
    return (
      <div className="flex flex-col gap-5 px-4 py-6 max-w-sm mx-auto">
        <div className="bg-gradient-to-br from-[#07955F] to-emerald-400 rounded-2xl p-5 text-white">
          <div className="text-xs font-medium opacity-80 mb-1">Auto-Save active</div>
          <div className="text-3xl font-bold">{formatCusd(plan.monthlyAmount)}</div>
          <div className="text-sm opacity-80">per month, straight into your own Aave position</div>
          <div className="mt-4 border-t border-white/20 pt-3">
            <div className="text-xs opacity-70">Next deposit</div>
            <div className="text-xl font-semibold">{nextDepositLabel(plan.nextExecutionTime)}</div>
          </div>
        </div>

        {lowAllowanceWarning && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⚠ Only {remainingCycles} deposit{remainingCycles === 1 ? "" : "s"} left on your current
            allowance ({formatCusd(allowance)} remaining). Re-approve below to keep Auto-Save going —
            deposits simply pause, they never fail partway or touch funds you haven&apos;t approved.
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Remaining allowance</span>
            <span className="font-medium">
              {formatCusd(allowance)} ({remainingCycles} deposit{remainingCycles === 1 ? "" : "s"})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Deposits go to</span>
            <span>Your own Aave position</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">CeloSave holds</span>
            <span>Nothing, ever</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Non-custodial: this contract never holds your cUSD between deposits. Each cycle pulls
          only the amount you approved and supplies it to Aave in your name — aTokens land in
          your wallet, not CeloSave&apos;s. Cancel any time; it stops future deposits immediately
          and does not touch funds already in Aave, which you can withdraw whenever you like.
        </p>

        {isEligibleNow && (
          <button
            onClick={depositNow}
            className="w-full border border-[#07955F] text-primary-dark font-semibold rounded-xl py-3 hover:bg-emerald-50 transition-colors"
          >
            Deposit now
          </button>
        )}

        {!isMiniPay && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            This wallet needs CELO for gas. CIP-64 gasless transactions only work in MiniPay.
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          onClick={cancel}
          className="w-full border border-red-300 text-red-600 font-semibold rounded-xl py-3 hover:bg-red-50 transition-colors"
        >
          Cancel Auto-Save
        </button>
      </div>
    );
  }

  // Transient success/cancel states
  if (step === "subscribed" || step === "cancelled" || step === "deposited") {
    const copy = {
      subscribed: { icon: "✅", title: "Auto-Save active!", body: "Your monthly plan is set — deposits will supply straight into your own Aave position." },
      deposited: { icon: "💰", title: "Deposit sent", body: "This cycle's deposit has been supplied to your own Aave position." },
      cancelled: { icon: "⏹️", title: "Auto-Save cancelled", body: "Future deposits are stopped and your allowance has been revoked. Anything already in Aave is still yours — withdraw it any time from the cUSD tab on the Save page." },
    }[step];

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-5xl">{copy.icon}</div>
        <h2 className="text-xl font-semibold">{copy.title}</h2>
        <p className="text-sm text-gray-500 max-w-xs">{copy.body}</p>
        <button onClick={reset} className="mt-2 px-6 py-2 border border-gray-300 rounded-xl text-sm font-medium">
          {step === "cancelled" ? "Set Up New Plan" : "View Dashboard"}
        </button>
      </div>
    );
  }

  // Setup form (idle / error, no active plan)
  return (
    <div className="flex flex-col gap-5 px-4 py-6 max-w-sm mx-auto">
      <div>
        <h2 className="text-lg font-semibold">Auto-Save</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Set once — a fixed amount deposits into your own Aave position every month.
        </p>
      </div>

      {!isMiniPay && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          This wallet needs CELO for gas. CIP-64 gasless transactions only work in MiniPay.
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Monthly amount</label>
        <div className="grid grid-cols-4 gap-2">
          {MONTHLY_PRESETS_CUSD_RAW.map(({ label, raw }) => (
            <button
              key={label}
              onClick={() => {
                setSelectedRaw(raw);
                setCustomAmount("");
              }}
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
          onChange={(e) => {
            setCustomAmount(e.target.value);
            setSelectedRaw(0n);
          }}
          min="1"
          step="1"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Pre-approve for</label>
        <div className="grid grid-cols-3 gap-2">
          {APPROVAL_CYCLE_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setApprovalCycles(n)}
              className={`border rounded-xl py-2.5 text-sm font-medium transition-colors ${
                approvalCycles === n ? "bg-[#07955F] text-white border-[#07955F]" : "border-gray-300 text-gray-700"
              }`}
            >
              {n} months
            </button>
          ))}
        </div>
      </div>

      {effectiveRaw > 0n && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Monthly deposit</span>
            <span className="font-medium">{formatCusd(effectiveRaw)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total approval</span>
            <span>
              {formatCusd(totalApprovalRaw)} ({approvalCycles} months)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">CeloSave can ever move</span>
            <span>Exactly this, never more</span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
      )}

      <button
        onClick={() => subscribe(effectiveRaw, approvalCycles)}
        disabled={effectiveRaw <= 0n}
        className="w-full bg-[#07955F] text-white font-semibold rounded-xl py-3 disabled:opacity-50"
      >
        Start Auto-Save
      </button>

      <p className="text-xs text-center text-gray-500">
        Non-custodial · deposits go straight to your own Aave position · cancel anytime
      </p>
    </div>
  );
}
