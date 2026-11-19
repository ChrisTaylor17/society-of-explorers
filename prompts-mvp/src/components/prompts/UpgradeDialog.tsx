"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import { useState } from "react";
import {
  PROMPT_ATLAS_HOURLY_RUNS,
  PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL,
  PROMPT_ATLAS_PRO_MONTHLY_USD,
} from "@/lib/billing/plan";

interface UpgradeDialogProps {
  open: boolean;
  canCheckout: boolean;
  isRestarting: boolean;
  mustManageExistingPlan: boolean;
  onClose(): void;
  onManagePlan(): void;
  onRequireAuth(): void;
}

export function UpgradeDialog({
  open,
  canCheckout,
  isRestarting,
  mustManageExistingPlan,
  onClose,
  onManagePlan,
  onRequireAuth,
}: UpgradeDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    if (!canCheckout) {
      onRequireAuth();
      return;
    }
    if (mustManageExistingPlan) {
      onManagePlan();
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Checkout is unavailable right now.");
      }
      const destination = new URL(payload.url);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com") {
        throw new Error("Checkout is unavailable right now.");
      }
      window.location.assign(destination.toString());
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Checkout is unavailable right now.",
      );
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            className="hairline-frame relative w-full max-w-[470px] border-[#d0aa6280] px-7 py-8 sm:px-10 sm:py-10"
            initial={{ opacity: 0, y: 15, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close upgrade"
              className="absolute right-5 top-5 cursor-pointer text-[#777269] hover:text-white"
            >
              <X size={18} strokeWidth={1.4} />
            </button>
            <Sparkles className="text-[#d0aa62]" size={24} strokeWidth={1.15} />
            <h2 id="upgrade-title" className="display-type mt-5 text-[2.7rem] font-medium leading-none text-[#eee7d9]">
              Make room to explore.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#969087]">
              {mustManageExistingPlan
                ? "Your existing subscription needs attention in Stripe before it can restore your Pro allowance."
                : isRestarting
                  ? "Your previous plan is no longer active. Review the current terms before starting a new subscription."
                : `Prompt Atlas Pro includes ${PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL.toLowerCase()} explorations each month while keeping private context out of the usage ledger.`}
            </p>

            <div className="mt-7 flex items-end gap-2 border-y border-[#d0aa622b] py-6">
              <span className="display-type text-5xl text-[#e8c77f]">
                {`$${PROMPT_ATLAS_PRO_MONTHLY_USD}`}
              </span>
              <span className="pb-1 text-sm text-[#8d887f]">per month · cancel anytime</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-[#d3cabd]">
              {[
                `${PROMPT_ATLAS_PRO_MONTHLY_RUNS_LABEL} prompt runs each month`,
                `Up to ${PROMPT_ATLAS_HOURLY_RUNS} starts per hour for reliable shared access`,
                "No raw personal context added to the usage ledger",
                "Cancel anytime through Stripe",
                "Supports a shared, human-centered prompt commons",
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <Check className="text-[#6b9bb5]" size={16} strokeWidth={1.5} /> {feature}
                </li>
              ))}
            </ul>

            {error ? <p className="mt-5 text-sm text-[#d78d7d]">{error}</p> : null}
            <button
              type="button"
              onClick={checkout}
              disabled={busy}
              className="mt-7 h-13 w-full cursor-pointer bg-[#d0aa62] text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f] disabled:cursor-wait disabled:opacity-55"
            >
              {busy
                ? "Opening secure checkout..."
                : mustManageExistingPlan
                  ? "Manage existing plan"
                  : isRestarting
                    ? "Restart Pro with secure checkout"
                  : canCheckout
                  ? "Continue to secure checkout"
                  : "Sign in to upgrade"}
            </button>
            <p className="mt-3 text-center text-[0.68rem] leading-5 text-[#6f6c66]">
              Stripe handles payment details. Society of Explorers never receives your card number.
            </p>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
