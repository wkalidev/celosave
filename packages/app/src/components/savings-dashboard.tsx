"use client";

import { useState } from "react";
import { TrendingUp, Wallet, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, Zap, Globe } from "lucide-react";
import { useAccount, useChainId } from "wagmi";
import { celo } from "wagmi/chains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/connect-button";
import { DepositModal } from "@/components/deposit-modal";
import { WithdrawModal } from "@/components/withdraw-modal";
import { useAaveAPY, useATokenBalance, useTokenBalance } from "@/hooks/useAaveData";
import { useIsMiniPay } from "@/hooks/useMiniPay";
import { getPrincipal } from "@/lib/savings-store";
import { formatUnits } from "@/lib/aave-utils";
import { truncateAddress } from "@/lib/app-utils";
import type { SupportedToken } from "@/lib/contracts";

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-primary/8 border border-primary/20 text-primary rounded-full px-3 py-1 text-xs font-medium">
      {icon}
      {label}
    </div>
  );
}

function WrongNetworkBanner() {
  return (
    <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
      <Globe className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-amber-800">Switch to Celo Mainnet</p>
        <p className="text-xs text-amber-600 mt-0.5">
          Your wallet is on a different network. Balances and transactions require Celo.
        </p>
      </div>
    </div>
  );
}

const TOKENS: SupportedToken[] = ["USDT", "USDC"];

export function SavingsDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isMiniPay = useIsMiniPay();
  const isWrongNetwork = isConnected && chainId !== celo.id;

  const [selectedToken, setSelectedToken] = useState<SupportedToken>("USDT");
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { apy, isLoading: apyLoading } = useAaveAPY(selectedToken);
  const { balance: aTokenBalance, refetch: refetchAToken } = useATokenBalance(selectedToken);
  const { balance: walletBalance, refetch: refetchWallet } = useTokenBalance(selectedToken);

  const storedPrincipal = address ? getPrincipal(chainId ?? celo.id, address, selectedToken) : 0n;
  // Fall back to treating the full balance as principal when localStorage has no record.
  // This avoids showing the entire balance as "yield" for users whose deposit predates tracking.
  const principal = storedPrincipal > 0n ? storedPrincipal : aTokenBalance;
  const yield_ = aTokenBalance > principal ? aTokenBalance - principal : 0n;

  function handleSuccess() {
    refetchAToken();
    refetchWallet();
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-0 px-4 pb-8">
        <div className="text-center space-y-4 mb-8 mt-4">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <TrendingUp className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Save money. Earn yield.</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
              Deposit USDT or USDC and earn up to{" "}
              <span className="font-semibold text-primary">
                {apyLoading ? "…" : apy !== null ? `${apy.toFixed(2)}%` : "—"} APY
              </span>{" "}
              on Aave V3 — no CELO needed for gas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-8">
          <TrustBadge icon={<ShieldCheck className="h-3 w-3" />} label="Aave V3 · Audited" />
          <TrustBadge icon={<Zap className="h-3 w-3" />} label="Gasless in USDT/USDC" />
          <TrustBadge icon={<Globe className="h-3 w-3" />} label="Celo Mainnet" />
        </div>

        <Card className="w-full max-w-sm mb-8 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">USDT APY</span>
              <span className="font-bold text-primary text-base">
                <ApyLabel token="USDT" />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">USDC APY</span>
              <span className="font-bold text-primary text-base">
                <ApyLabel token="USDC" />
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Protocol</span>
              <span className="font-medium">Aave V3 on Celo</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Gas</span>
              <span className="font-medium">Paid in USDT or USDC</span>
            </div>
          </CardContent>
        </Card>

        {!isMiniPay && (
          <div className="w-full max-w-sm">
            <ConnectButton />
          </div>
        )}
        {isMiniPay && (
          <p className="text-sm text-muted-foreground">Connecting your MiniPay wallet…</p>
        )}
      </div>
    );
  }

  return (
    <>
      {isWrongNetwork && <WrongNetworkBanner />}

      <div className="flex flex-col gap-4 px-4 py-5 max-w-md mx-auto">
        {/* Wallet chip */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="font-mono">{truncateAddress(address!)}</span>
          {isMiniPay ? (
            <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
              MiniPay
            </span>
          ) : (
            <span className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              Celo
            </span>
          )}
        </div>

        {/* Token selector */}
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {TOKENS.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedToken(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                selectedToken === t
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Savings hero card */}
        <Card className="border-primary/25 bg-gradient-to-br from-primary/8 via-primary/5 to-transparent shadow-sm">
          <CardHeader className="pb-1 pt-5">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-primary" />
              {selectedToken} Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <div className="space-y-2">
              <p className="text-4xl font-bold tracking-tight tabular-nums">
                ${formatUnits(aTokenBalance)}
                <span className="text-lg font-normal text-muted-foreground ml-1.5">{selectedToken}</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1 rounded-full">
                  <TrendingUp className="h-3 w-3" />
                  {apyLoading ? "Loading…" : apy !== null ? `${apy.toFixed(2)}% APY` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">· Aave V3 · Celo</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-0.5">Deposited</p>
              <p className="text-lg font-semibold tabular-nums">${formatUnits(principal)}</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground mb-0.5">Yield Earned</p>
              <p className="text-lg font-semibold text-primary tabular-nums">
                +${formatUnits(yield_)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Wallet balance */}
        <div className="flex items-center justify-between bg-muted/60 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Wallet</span>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            ${formatUnits(walletBalance)} {selectedToken}
          </span>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="w-full font-semibold"
            onClick={() => setDepositOpen(true)}
            disabled={isWrongNetwork}
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Deposit
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full font-semibold border-primary/30 hover:bg-primary/5"
            onClick={() => setWithdrawOpen(true)}
            disabled={aTokenBalance === 0n || isWrongNetwork}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Withdraw
          </Button>
        </div>

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-3 pt-1 pb-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span>Non-custodial</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span>Gas in {selectedToken}</span>
          </div>
        </div>
      </div>

      <DepositModal
        open={depositOpen}
        token={selectedToken}
        onClose={() => setDepositOpen(false)}
        onSuccess={() => { setDepositOpen(false); handleSuccess(); }}
        apy={apy}
      />
      <WithdrawModal
        open={withdrawOpen}
        token={selectedToken}
        onClose={() => setWithdrawOpen(false)}
        onSuccess={() => { setWithdrawOpen(false); handleSuccess(); }}
        aTokenBalance={aTokenBalance}
      />
    </>
  );
}

function ApyLabel({ token }: { token: SupportedToken }) {
  const { apy, isLoading } = useAaveAPY(token);
  if (isLoading) return <>…</>;
  if (apy === null) return <>—</>;
  return <>{apy.toFixed(2)}%</>;
}
