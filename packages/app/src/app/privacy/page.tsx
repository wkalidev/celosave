import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – CeloSave",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6 text-sm text-foreground">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: June 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">1. What We Collect</h2>
        <p>
          CeloSave is a non-custodial app. We do not collect names, email addresses, or
          identity documents. The only data associated with your use of the App is your
          public wallet address and on-chain transaction history, which is inherently public
          on the Celo blockchain.
        </p>
        <p>
          The App stores minimal data in your browser&apos;s local storage (e.g. a flag
          indicating you have completed onboarding) to improve user experience. This data
          never leaves your device.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">2. Airtime Top-Ups</h2>
        <p>
          When you use the Pay Bills feature, you provide a phone number and country code.
          This information is sent to our backend and passed to Africa&apos;s Talking solely to
          fulfil the airtime request. We do not store or sell this information.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">3. Third-Party Services</h2>
        <p>The App interacts with the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Aave V3 (Celo) — on-chain lending protocol</li>
          <li>Superfluid (Celo) — on-chain streaming payments</li>
          <li>Africa&apos;s Talking — airtime delivery</li>
          <li>Alchemy — Celo RPC provider</li>
          <li>Vercel — frontend hosting</li>
          <li>Railway — backend hosting</li>
        </ul>
        <p>Each of these services has its own privacy policy.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">4. Analytics</h2>
        <p>
          We do not use advertising trackers or third-party analytics scripts. On-chain
          activity (e.g. the CeloSaveRegistry contract) is publicly visible on the Celo
          blockchain by design.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">5. Contact</h2>
        <p>
          Questions about privacy? Open an issue at{" "}
          <a
            href="https://github.com/wkalidev"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/wkalidev
          </a>
          .
        </p>
      </section>
    </div>
  );
}
