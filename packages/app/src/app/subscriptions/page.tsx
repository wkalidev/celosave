import type { Metadata } from "next";
import { SubscriptionsDashboard } from "@/components/subscriptions-dashboard";

export const metadata: Metadata = {
  title: "Auto-Save – CeloSave",
  description: "Automatic monthly cUSD deposits straight into your own Aave position — non-custodial, cancel anytime",
};

export default function SubscriptionsPage() {
  return <SubscriptionsDashboard />;
}
