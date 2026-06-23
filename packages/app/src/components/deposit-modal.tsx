"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDeposit } from "@/hooks/useDeposit";
import { useTokenBalance } from "@/hooks/useAaveData";
import { formatUnits, parseTokenAmount } from "@/lib/aave-utils";
import type { SupportedToken } from "@/lib/contracts";

interface DepositModalProps {
  open: boolean;
  token: SupportedToken;
  onClose: () => void;
  onSuccess: () => void;
  apy: number | null;
}

export function DepositModal({ open, token, onClose, onSuccess, apy }: DepositModalProps) {
  const [inputValue, setInputValue] = useState("");
  const { balance } = useTokenBalance(token);
  const { deposit, step, error, reset } = useDeposit(token);

  const amount = inputValue ? parseTokenAmount(inputValue) : 0n;
  const hasBalance = amount > 0n && amount <= balance;

  function handleClose() {
    reset();
    setInputValue("");
    onClose();
  }

  if (step === "success") {
    onSuccess();
  }

  const isProcessing = step === "approving" || step === "supplying";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="mb-6">
          <SheetTitle>Deposit {token}</SheetTitle>
        </SheetHeader>

        {step === "success" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <p className="text-lg font-semibold">Deposit successful</p>
            <p className="text-sm text-muted-foreground">
              Your {token} is now earning yield on Aave V3
            </p>
            <Button className="w-full mt-4" onClick={handleClose}>
              Done
            </Button>
          </div>
        ) : step === "error" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-16 w-16 text-destructive" />
            <p className="text-lg font-semibold">Transaction failed</p>
            <p className="text-sm text-muted-foreground text-center break-words px-2">
              {error}
            </p>
            <Button variant="outline" className="w-full mt-4" onClick={reset}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {balance === 0n && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                Your wallet has no {token}. Add {token} on Celo to start saving.
              </div>
            )}

            {/* Amount input */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount ({token})</span>
                <button
                  className="text-primary font-medium disabled:opacity-40"
                  onClick={() => setInputValue(formatUnits(balance))}
                  disabled={balance === 0n}
                >
                  Max: {formatUnits(balance)}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                disabled={isProcessing}
                className="w-full text-2xl font-semibold bg-muted rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Summary */}
            <div className="bg-muted rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Protocol</span>
                <span className="font-medium">Aave V3 on Celo</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current APY</span>
                <span className="font-medium text-primary">
                  {apy !== null ? `${apy.toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gas</span>
                <span className="font-medium">Paid in {token}</span>
              </div>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <span className="text-sm font-medium">
                  {step === "approving"
                    ? `Step 1/2 — Approving ${token} spend…`
                    : "Step 2/2 — Supplying to Aave…"}
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!hasBalance || isProcessing}
              onClick={() => deposit(amount)}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isProcessing
                ? step === "approving" ? "Approving…" : "Depositing…"
                : "Deposit"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
