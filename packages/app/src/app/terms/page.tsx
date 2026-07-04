import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service – CeloSave",
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6 text-sm text-foreground">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: June 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">1. Acceptance</h2>
        <p>
          By accessing or using CeloSave (&quot;the App&quot;), you agree to these Terms of Service. If
          you do not agree, do not use the App.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">2. Nature of the Service</h2>
        <p>
          CeloSave is a non-custodial application that facilitates deposits into the Aave V3
          lending protocol on the Celo blockchain, recurring savings streams via Superfluid,
          and mobile airtime purchases via Africa&apos;s Talking. The App does not custody your
          funds. All transactions are executed on-chain by your own wallet.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">3. Risks</h2>
        <p>
          DeFi protocols carry smart contract risk, oracle risk, and liquidity risk. Yields
          are variable and not guaranteed. You are solely responsible for understanding the
          risks before depositing funds. The App is provided as-is without warranty of any
          kind.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">4. Fees</h2>
        <p>
          The App charges a 1.5% service markup on airtime top-ups. Yield earned via Aave V3
          is passed through in full. Blockchain gas fees are paid by your wallet on each
          transaction.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">5. Eligibility</h2>
        <p>
          You must be of legal age in your jurisdiction to use the App. The App is not
          available to residents of jurisdictions where DeFi or cryptocurrency services are
          prohibited.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">6. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by applicable law, CeloSave and its developers
          shall not be liable for any indirect, incidental, special, or consequential damages
          arising from your use of the App or the underlying protocols.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">7. Changes</h2>
        <p>
          These Terms may be updated at any time. Continued use of the App after changes
          constitutes acceptance of the revised Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-base">8. Contact</h2>
        <p>
          Questions? Open an issue at{" "}
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
