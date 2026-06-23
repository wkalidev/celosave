"use client";

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWithdraw } from "@/hooks/useWithdraw";
import { useAccount } from "wagmi";
import { getPrincipal } from "@/lib/savings-store";
import { formatUnits, calcFee } from "@/lib/aave-utils";

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  aTokenBalance: bigint;
}

export function WithdrawModal({
  open,
  onClose,
  onSuccess,
  aTokenBalance,
}: WithdrawModalProps) {
  const { address, chainId } = useAccount();
  const { withdraw, step, error, reset } = useWithdraw();

  const principal = address
    ? getPrincipal(chainId ?? 42220, address, "USDT")
    : 0n;
  const yield_ = aTokenBalance > principal ? aTokenBalance - principal : 0n;
  const fee = calcFee(aTokenBalance, principal);
  const netReceive = aTokenBalance - fee;

  function handleClose() {
    reset();
    onClose();
  }

  async function handleConfirm() {
    await withdraw(aTokenBalance);
  }

  if (step === "success") {
    onSuccess();
  }

  const isProcessing = step === "withdrawing" || step === "sending_fee";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="mb-6">
          <SheetTitle>Withdraw Savings</SheetTitle>
        </SheetHeader>

        {step === "success" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <p className="text-lg font-semibold">Withdrawal successful</p>
            <p className="text-sm text-muted-foreground">
              USDT has been returned to your wallet
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
            {/* Breakdown */}
            <div className="bg-muted rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between text-base font-semibold">
                <span>Total balance</span>
                <span>${formatUnits(aTokenBalance)} USDT</span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Principal</span>
                  <span>${formatUnits(principal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Yield earned</span>
                  <span className="text-primary">+${formatUnits(yield_)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Protocol fee (0.30% of yield)
                  </span>
                  <span className="text-muted-foreground">
                    −${formatUnits(fee)}
                  </span>
                </div>
              </div>
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>You receive</span>
                <span>${formatUnits(netReceive)} USDT</span>
              </div>
            </div>

            {/* Step indicator */}
            {isProcessing && (
              <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <span className="text-sm font-medium">
                  {step === "withdrawing"
                    ? fee > 0n
                      ? "Step 1/2 — Withdrawing from Aave…"
                      : "Withdrawing from Aave…"
                    : "Step 2/2 — Sending protocol fee…"}
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={aTokenBalance === 0n || isProcessing}
              onClick={handleConfirm}
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isProcessing ? "Processing…" : "Withdraw All"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
