"use client";

import { AlertCircle, RefreshCw, X } from "lucide-react";

interface BillingPortalErrorNoticeProps {
  busy: boolean;
  onDismiss(): void;
  onRetry(): Promise<void> | void;
}

export function BillingPortalErrorNotice({
  busy,
  onDismiss,
  onRetry,
}: BillingPortalErrorNoticeProps) {
  return (
    <aside
      role="alert"
      className="billing-return-notice hairline-frame fixed inset-x-4 top-[86px] z-[60] ml-auto max-w-[430px] border-[#d78d7d70] px-5 py-4 sm:right-6 sm:left-auto sm:top-[92px] sm:w-[430px]"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss billing portal error"
        className="absolute right-4 top-4 cursor-pointer text-[#777269] transition-colors hover:text-white"
      >
        <X size={17} strokeWidth={1.4} />
      </button>

      <div className="flex gap-3 pr-7">
        <AlertCircle className="mt-0.5 shrink-0 text-[#d78d7d]" size={19} strokeWidth={1.4} />
        <div>
          <h2 className="display-type text-xl text-[#eee7d9]">Billing portal unavailable.</h2>
          <p className="mt-1 text-xs leading-5 text-[#969087]">
            We could not open Stripe&apos;s secure portal. Your plan was not changed.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className="flex cursor-pointer items-center gap-2 text-xs text-[#8fb8ce] transition-colors hover:text-white disabled:cursor-wait disabled:opacity-55"
        >
          <RefreshCw
            size={14}
            strokeWidth={1.4}
            className={busy ? "animate-spin motion-reduce:animate-none" : ""}
          />
          {busy ? "Opening portal..." : "Try again"}
        </button>
      </div>
    </aside>
  );
}
