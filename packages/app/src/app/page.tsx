import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserBalance } from "@/components/user-balance";
import { Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1">
      <section className="relative py-20 lg:py-32">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-8 text-sm font-medium bg-primary/10 text-primary rounded-full border border-primary/20">
              <Zap className="h-4 w-4" />
              Built on Celo
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Save smarter with{" "}
              <span className="text-primary">CeloSave</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              Earn yield on your stablecoins and pay bills — all from MiniPay.
            </p>

            <UserBalance />

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Button size="lg" className="px-8 py-3 text-base font-medium">
                Start Saving
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 py-3 text-base font-medium"
              >
                Pay Bills
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
