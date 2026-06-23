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
import { formatUnits } from "@/lib/aave-utils";
import type { SupportedToken } from "@/lib/contracts";

interface WithdrawModalProps {
  open: boolean;
  token: SupportedToken;
  onClose: () => void;
  onSuccess: () => void;
  aTokenBalance: bigint;
}

export function WithdrawModal({ open, token, onClose, onSuccess, aTokenBalance }: WithdrawModalProps) {
  const { address, chainId } = useAccount();
  const { withdraw, step, error, reset } = useWithdraw(token);

  const principal = address ? getPrincipal(chainId ?? 42220, address, token) : 0n;
  const yield_ = aTokenBalance > principal ? aTokenBalance - principal : 0n;

  function handleClose() {
    reset();
    onClose();
  }

  if (step === "success") {
    onSuccess();
  }

  const isProcessing = step === "withdrawing";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-8">
        <SheetHeader className="mb-6">
          <SheetTitle>Withdraw {token}</SheetTitle>
        </SheetHeader>

        {step === "success" ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <p className="text-lg font-semibold">Withdrawal successful</p>
            <p className="text-sm text-muted-foreground">
              {token} has been returned to your wallet
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
            <div className="bg-muted rounded-xl p-4 space-y-3 text-sm">
              <div className="flex justify-between text-base font-semibold">
                <span>Total balance</span>
                <span>${formatUnits(aTokenBalance)} {token}</span>
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
              </div>
              <div className="border-t pt-3 flex justify-between font-semibold">
                <span>You receive</span>
                <span>${formatUnits(aTokenBalance)} {token}</span>
              </div>
            </div>

            {isProcessing && (
              <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                <span className="text-sm font-medium">Withdrawing from Aave…</span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={aTokenBalance === 0n || isProcessing}
              onClick={withdraw}
            >
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isProcessing ? "Processing…" : "Withdraw All"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
