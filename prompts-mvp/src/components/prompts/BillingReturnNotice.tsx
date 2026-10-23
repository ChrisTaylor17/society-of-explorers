"use client";

import { ArrowRight, CheckCircle2, RefreshCw, X } from "lucide-react";

export type BillingReturnStatus = "success" | "cancelled";

interface BillingReturnNoticeProps {
  status: BillingReturnStatus;
  confirmed: boolean;
  checking: boolean;
  checkFailed: boolean;
  onCheck(): Promise<void> | void;
  onDismiss(): void;
  onViewPlan(): void;
}

export function BillingReturnNotice({
  status,
  confirmed,
  checking,
  checkFailed,
  onCheck,
  onDismiss,
  onViewPlan,
}: BillingReturnNoticeProps) {
  const success = status === "success";
  const title = confirmed
    ? "Prompt Atlas Pro is active."
    : checkFailed
      ? "Access check unavailable."
      : success
        ? "Confirming your Pro access."
        : "Checkout closed.";
  const description = confirmed
    ? "Your unlimited Pro exploration access is ready."
    : checkFailed
      ? "We could not verify access right now. Try again in a moment; this check does not change your billing."
      : success
        ? "You returned from checkout. We will show Pro only after your server-side entitlement is confirmed."
        : "Nothing changed. Your free explorations and private prompts are still here.";

  return (
    <aside
      role="status"
      aria-live="polite"
      className="billing-return-notice hairline-frame fixed inset-x-4 top-[86px] z-[60] ml-auto max-w-[430px] border-[#d0aa6270] px-5 py-4 sm:right-6 sm:left-auto sm:top-[92px] sm:w-[430px]"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss billing notice"
        className="absolute right-4 top-4 cursor-pointer text-[#777269] transition-colors hover:text-white"
      >
        <X size={17} strokeWidth={1.4} />
      </button>

      <div className="flex gap-3 pr-7">
        <CheckCircle2
          className={confirmed ? "mt-0.5 shrink-0 text-[#8fb89a]" : "mt-0.5 shrink-0 text-[#d0aa62]"}
          size={19}
          strokeWidth={1.4}
        />
        <div>
          <h2 className="display-type text-xl text-[#eee7d9]">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#969087]">{description}</p>
        </div>
      </div>

      {!confirmed ? (
        <div className="mt-4 flex justify-end">
          {success ? (
            <button
              type="button"
              onClick={onCheck}
              disabled={checking}
              className="flex cursor-pointer items-center gap-2 text-xs text-[#8fb8ce] transition-colors hover:text-white disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCw
                size={14}
                strokeWidth={1.4}
                className={checking ? "animate-spin motion-reduce:animate-none" : ""}
              />
              {checking ? "Checking access..." : "Check access"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onViewPlan}
              className="flex cursor-pointer items-center gap-2 text-xs text-[#8fb8ce] transition-colors hover:text-white"
            >
              View Pro plan <ArrowRight size={14} strokeWidth={1.4} />
            </button>
          )}
        </div>
      ) : null}
    </aside>
  );
}
