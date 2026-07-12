"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@/components/connect-button";
import { useIsMiniPay } from "@/hooks/useMiniPay";
import { useAirtimePayment } from "@/hooks/useAirtimePayment";
import { COUNTRIES } from "@/lib/countries-fe";

const PRESET_AMOUNTS = [1, 2, 5, 10];

export function BillsDashboard() {
  const { isConnected } = useAccount();
  const isMiniPay = useIsMiniPay();
  const { step, quote, result, error, getQuote, pay, reset } = useAirtimePayment();

  const [countryCode, setCountryCode] = useState("NG");
  const [phone, setPhone] = useState("");
  const [usdAmount, setUsdAmount] = useState<number>(2);
  const [customAmount, setCustomAmount] = useState("");

  const country = COUNTRIES[countryCode];
  const effectiveAmount = usdAmount > 0 ? usdAmount : Number(customAmount) || 0;

  function handlePreset(amt: number) {
    setUsdAmount(amt);
    setCustomAmount("");
  }

  function handleCustomChange(val: string) {
    setCustomAmount(val);
    setUsdAmount(0);
  }

  async function handleGetQuote() {
    const amt = effectiveAmount;
    if (!amt || !phone) return;
    const fullPhone = phone.startsWith("+")
      ? phone
      : `${country.dialCode}${phone}`;
    await getQuote(fullPhone, countryCode, amt);
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-4xl">📱</div>
        <h2 className="text-xl font-semibold">Pay Bills with USDT</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Connect your wallet to buy airtime and pay bills across Africa — no CELO needed for gas.
        </p>
        {!isMiniPay && (
          <div className="mt-2">
            <ConnectButton />
          </div>
        )}
      </div>
    );
  }

  // Success state
  if (step === "success" && result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-semibold text-green-700">Airtime Sent!</h2>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 w-full max-w-sm text-left text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Phone</span>
            <span className="font-medium">{result.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Amount</span>
            <span className="font-medium">{result.amount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ref</span>
            <span className="font-mono text-xs truncate max-w-[140px]">{result.requestId}</span>
          </div>
        </div>
        <button
          onClick={reset}
          className="mt-2 w-full max-w-sm bg-[#07955F] text-white font-semibold rounded-xl py-3"
        >
          Pay Another Bill
        </button>
      </div>
    );
  }

  // Quoted state — show confirmation sheet
  if (step === "quoted" && quote) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 max-w-sm mx-auto">
        <h2 className="text-lg font-semibold">Confirm Payment</h2>

        {!isMiniPay && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            This wallet needs CELO for gas. CIP-64 gasless transactions only work in MiniPay.
          </div>
        )}

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Phone</span>
            <span className="font-medium">{quote.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Airtime</span>
            <span className="font-medium">
              {quote.localCurrency} {quote.localAmount.toFixed(0)}
            </span>
          </div>
          <div className="border-t border-gray-200 pt-2 flex justify-between">
            <span className="text-gray-500">You pay</span>
            <span className="font-semibold">${quote.totalUsdAmount.toFixed(2)} USDT</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Includes 1.5% service fee</span>
            <span>${quote.markupUsdAmount.toFixed(4)}</span>
          </div>
        </div>

        <div className="text-xs text-center text-gray-400">
          Quote expires {new Date(quote.expiresAt).toLocaleTimeString()}
        </div>

        <button
          onClick={pay}
          disabled={step !== "quoted"}
          className="w-full bg-[#07955F] text-white font-semibold rounded-xl py-3 disabled:opacity-50"
        >
          Confirm &amp; Pay
        </button>
        <button
          onClick={reset}
          className="w-full text-gray-500 text-sm py-2"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Paying / confirming states
  if (step === "paying" || step === "confirming" || step === "quoting") {
    const msg =
      step === "quoting"
        ? "Getting quote…"
        : step === "paying"
        ? "Sending USDT…"
        : "Confirming with provider…";

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center">
        <div className="w-8 h-8 border-4 border-[#07955F] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">{msg}</p>
      </div>
    );
  }

  // Idle / error — main form
  return (
    <div className="flex flex-col gap-5 px-4 py-6 max-w-sm mx-auto">
      {!isMiniPay && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          This wallet needs CELO for gas. CIP-64 gasless transactions only work in MiniPay.
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-gray-100 rounded-xl p-1 text-sm">
        <button className="flex-1 bg-white rounded-lg py-1.5 font-medium shadow-sm">
          Airtime
        </button>
        <button className="flex-1 text-gray-400 py-1.5 cursor-not-allowed" disabled>
          Electricity
        </button>
        <button className="flex-1 text-gray-400 py-1.5 cursor-not-allowed" disabled>
          Data
        </button>
      </div>

      {/* Country + Phone */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Country &amp; Phone</label>
        <div className="flex gap-2">
          <select
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
          >
            {Object.values(COUNTRIES).map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.name}
              </option>
            ))}
          </select>
          <input
            type="tel"
            placeholder={`${country.dialCode} 080...`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      {/* Amount presets */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">Amount (USD)</label>
        <div className="grid grid-cols-4 gap-2">
          {PRESET_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => handlePreset(amt)}
              className={`border rounded-xl py-2.5 text-sm font-medium transition-colors ${
                usdAmount === amt
                  ? "bg-[#07955F] text-white border-[#07955F]"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              ${amt}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="Custom amount"
          value={customAmount}
          onChange={(e) => handleCustomChange(e.target.value)}
          min="0.5"
          max="50"
          step="0.5"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      {/* Approx local equivalent */}
      {effectiveAmount > 0 && (
        <p className="text-xs text-gray-400 text-center">
          ≈ {country.currency}{" "}
          {(effectiveAmount * country.usdRate).toFixed(0)} airtime •{" "}
          <span className="text-gray-500">
            Total ${(effectiveAmount * 1.015).toFixed(2)} USDT
          </span>
        </p>
      )}

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <button
        onClick={handleGetQuote}
        disabled={!effectiveAmount || !phone}
        className="w-full bg-[#07955F] text-white font-semibold rounded-xl py-3 disabled:opacity-50"
      >
        Get Quote
      </button>
    </div>
  );
}
