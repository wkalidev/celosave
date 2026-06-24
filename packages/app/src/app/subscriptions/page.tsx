import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auto-Save – CeloSave",
  description: "Recurring USDC savings powered by Superfluid — coming soon",
};

export default function SubscriptionsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
      <div className="text-5xl">🔄</div>
      <h2 className="text-xl font-semibold">Auto-Save — Coming Soon</h2>
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        Recurring USDC savings streams powered by Superfluid are under maintenance on Celo
        mainnet. Check back soon.
      </p>
    </div>
  );
}
