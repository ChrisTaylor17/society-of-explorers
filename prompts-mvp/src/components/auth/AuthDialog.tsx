"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Mail, Wallet, X } from "lucide-react";
import { useState } from "react";
import { SiweMessage } from "siwe";
import { createClient } from "@/lib/supabase/client";

interface EthereumProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

interface AuthDialogProps {
  open: boolean;
  onClose(): void;
  onAuthenticated(): Promise<void> | void;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && error.code === 4001) {
    return "The signature request was cancelled.";
  }
  return error instanceof Error ? error.message : "Sign-in could not be completed.";
}

export function AuthDialog({ open, onClose, onAuthenticated }: AuthDialogProps) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"email" | "google" | "wallet" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy("email");
    setError("");
    setNotice("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    });
    if (authError) setError(authError.message);
    else setNotice("Check your email for a private sign-in link.");
    setBusy(null);
  }

  async function signInWithGoogle() {
    setBusy("google");
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (authError) {
      setError(authError.message);
      setBusy(null);
    }
  }

  async function connectWallet() {
    setBusy("wallet");
    setError("");
    setNotice("");

    try {
      const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
      if (!ethereum) throw new Error("A browser wallet such as MetaMask is required.");

      const rawAccounts = await ethereum.request({ method: "eth_requestAccounts" });
      const accounts = Array.isArray(rawAccounts)
        ? rawAccounts.filter((value): value is string => typeof value === "string")
        : [];
      if (!accounts[0]) throw new Error("No wallet account was returned.");

      const { getAddress } = await import("ethers");
      const address = getAddress(accounts[0]);
      const nonceResponse = await fetch("/api/auth/nonce", { cache: "no-store" });
      const { nonce } = (await nonceResponse.json()) as { nonce?: string };
      if (!nonce) throw new Error("Could not start wallet sign-in.");

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to Society of Explorers Prompt Atlas.",
        uri: window.location.origin,
        version: "1",
        chainId: 1,
        nonce,
      });
      const prepared = message.prepareMessage();
      const signature = await ethereum.request({
        method: "personal_sign",
        params: [prepared, address],
      });
      if (typeof signature !== "string") throw new Error("The wallet returned no signature.");

      const response = await fetch("/api/auth/siwe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prepared, signature, address }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Wallet sign-in failed.");

      await onAuthenticated();
      onClose();
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
            className="hairline-frame relative w-full max-w-[440px] px-6 py-7 sm:px-9 sm:py-9"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.22 }}
          >
            <button
              type="button"
              aria-label="Close sign in"
              onClick={onClose}
              className="absolute right-5 top-5 cursor-pointer text-[#807b72] transition-colors hover:text-[#eee7d9]"
            >
              <X size={18} strokeWidth={1.5} />
            </button>

            <h2 id="auth-title" className="display-type pr-8 text-[2.25rem] leading-none text-[#eee7d9]">
              Keep your explorations yours.
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#8d8981]">
              Sign in to run, save, and create prompts. Your context is used for the current run and is not stored by default.
            </p>

            <form onSubmit={sendMagicLink} className="mt-7">
              <label htmlFor="auth-email" className="mb-2 block text-[0.66rem] uppercase tracking-[0.18em] text-[#d0aa62]">
                Email
              </label>
              <div className="flex border border-[#d0aa6245] bg-black/20 focus-within:border-[#d0aa62]">
                <Mail className="ml-3 self-center text-[#7f7a70]" size={16} strokeWidth={1.4} />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-[#eee7d9] outline-none placeholder:text-[#5f605e]"
                />
                <button
                  type="submit"
                  disabled={Boolean(busy)}
                  className="m-1 flex cursor-pointer items-center gap-2 bg-[#d0aa62] px-4 text-xs font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f] disabled:cursor-wait disabled:opacity-50"
                >
                  {busy === "email" ? "Sending" : "Continue"}
                  <ArrowRight size={15} strokeWidth={1.7} />
                </button>
              </div>
            </form>

            <div className="my-5 flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.2em] text-[#5d5c58]">
              <span className="h-px flex-1 bg-[#d0aa6226]" /> or <span className="h-px flex-1 bg-[#d0aa6226]" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={Boolean(busy)}
                className="h-11 cursor-pointer border border-[#d0aa6245] text-xs text-[#d5cec0] transition-colors hover:border-[#d0aa62] hover:text-white disabled:opacity-50"
              >
                {busy === "google" ? "Opening Google..." : "Continue with Google"}
              </button>
              <button
                type="button"
                onClick={connectWallet}
                disabled={Boolean(busy)}
                className="flex h-11 cursor-pointer items-center justify-center gap-2 border border-[#6b9bb566] text-xs text-[#8fb8ce] transition-colors hover:border-[#6b9bb5] hover:text-white disabled:opacity-50"
              >
                <Wallet size={15} strokeWidth={1.4} />
                {busy === "wallet" ? "Connecting..." : "Use wallet"}
              </button>
            </div>

            {notice ? <p className="mt-4 text-sm text-[#b9ab89]">{notice}</p> : null}
            {error ? <p className="mt-4 text-sm text-[#d78d7d]">{error}</p> : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

