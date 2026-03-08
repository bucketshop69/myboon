"use client";

import { WalletButton } from "@/components/wallet/WalletButton";
import { AnimatedInput } from "@/components/AnimatedInput";

/**
 * Home page with MYBOON logo, animated input field, and wallet button.
 * Wallet button opens custom modal for connection.
 */
export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-primary gap-8 px-4">
      <h1 className="text-6xl md:text-8xl font-mono font-bold tracking-tighter text-text-primary">
        <span className="text-pnl-green">P</span>N<span className="text-pnl-red">L</span>DOTFUN
      </h1>
      <AnimatedInput
        className="
          w-full max-w-lg h-16
          px-6
          text-xl font-mono
          bg-surface
          border border-white/10
          rounded-2xl
          text-text-primary
          placeholder:text-text-muted
          focus:outline-none focus:ring-2 focus:ring-accent
          transition-all
        "
      />
      <WalletButton />
    </div>
  );
}

