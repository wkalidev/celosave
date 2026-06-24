import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { WalletProvider } from "@/components/wallet-provider";
import { WalletRegistrar } from "@/components/wallet-registrar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CeloSave",
  description: "Yield-bearing savings and bill payment Mini App for MiniPay on Celo",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "CeloSave",
    description: "Save money. Earn yield. Pay bills. Built for MiniPay on Celo.",
    url: "https://celosave-two.vercel.app",
    siteName: "CeloSave",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CeloSave" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CeloSave",
    description: "Save money. Earn yield. Pay bills. Built for MiniPay on Celo.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Talent App (Proof of Ship) verification */}
        <meta
          name="talentapp:project_verification"
          content="c2e0313de62585f6e667d8440e1d46050aedef874692b8c275352a1285106208343c85330b8e656a9e36ba57a9c44d720c51f52c64efcd8000f8122c59b56170"
        />
        {/* Base app registry */}
        <meta name="base:app_id" content="6a3a5537d79487d5e6aac9f9" />
      </head>
      <body className={inter.className}>
        <div className="relative flex min-h-screen flex-col">
          <WalletProvider>
            <WalletRegistrar />
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </WalletProvider>
        </div>
      </body>
    </html>
  );
}
