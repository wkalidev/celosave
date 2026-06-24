"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-background mt-auto">
      <div className="max-w-md mx-auto px-4 py-5 flex flex-col items-center gap-2 text-xs text-muted-foreground">
        <p>
          Built with ❤️ by{" "}
          <a
            href="https://github.com/wkalidev"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            wkalidev (zcodebase)
          </a>
        </p>
        <div className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          <span>·</span>
          <a
            href="https://github.com/wkalidev/celosave/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
