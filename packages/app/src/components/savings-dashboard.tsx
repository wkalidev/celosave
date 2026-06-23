"use client";

import { useState } from "react";
import { TrendingUp, Wallet, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/connect-button";
import { DepositModal } from "@/components/deposit-modal";
import { WithdrawModal } from "@/components/withdraw-modal";
import { useAaveAPY, useATokenBalance, useUsdtBalance } from "@/hooks/useAaveData";
import { useIsMiniPay } from "@/hooks/useMiniPay";
import { getPrincipal } from "@/lib/savings-store";
import { formatUnits } from "@/lib/aave-utils";
import { truncateAddress } from "@/lib/app-utils";

export function SavingsDashboard() {
  const { address, isConnected, chainId } = useAccount();
  const isMiniPay = useIsMiniPay();

  const { apy, isLoading: apyLoading } = useAaveAPY();
  const { balance: aTokenBalance, refetch: refetchAToken } = useATokenBalance();
  const { balance: usdtBalance, refetch: refetchUsdt } = useUsdtBalance();

  const principal = address
    ? getPrincipal(chainId ?? 42220, address, "USDT")
    : 0n;
  const yield_ = aTokenBalance > principal ? aTokenBalance - principal : 0n;

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  function handleSuccess() {
    refetchAToken();
    refetchUsdt();
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Start saving with CeloSave</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Deposit USDT to earn yield on Aave V3. No CELO needed for gas.
          </p>
        </div>
        {!isMiniPay && (
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        )}
        {isMiniPay && (
          <p className="text-sm text-muted-foreground">
            Connecting your MiniPay wallet…
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-4 py-6 max-w-md mx-auto">
        {/* Wallet chip */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Wallet className="h-4 w-4" />
          <span className="font-mono">{truncateAddress(address!)}</span>
          {isMiniPay && (
            <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              MiniPay
            </span>
          )}
        </div>

        {/* Savings card */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Total Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="text-4xl font-bold tracking-tight">
                ${formatUnits(aTokenBalance)}
                <span className="text-lg font-normal text-muted-foreground ml-1">
                  USDT
                </span>
              </p>
              <p className="text-sm text-primary font-medium">
                APY:{" "}
                {apyLoading
                  ? "Loading…"
                  : apy !== null
                  ? `${apy.toFixed(2)}%`
                  : "—"}{" "}
                · Aave V3
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Deposited</p>
              <p className="text-lg font-semibold">${formatUnits(principal)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-1">Yield Earned</p>
              <p className="text-lg font-semibold text-primary">
                +${formatUnits(yield_)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Wallet USDT balance */}
        <div className="text-sm text-center text-muted-foreground">
          Wallet balance: ${formatUnits(usdtBalance)} USDT available
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => setDepositOpen(true)}
            disabled={usdtBalance === 0n}
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Deposit
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="flex-1"
            onClick={() => setWithdrawOpen(true)}
            disabled={aTokenBalance === 0n}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Withdraw
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          0.30% protocol fee on yield only · Gas paid in USDT
        </p>
      </div>

      <DepositModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        onSuccess={() => {
          setDepositOpen(false);
          handleSuccess();
        }}
        apy={apy}
      />

      <WithdrawModal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        onSuccess={() => {
          setWithdrawOpen(false);
          handleSuccess();
        }}
        aTokenBalance={aTokenBalance}
      />
    </>
  );
}
