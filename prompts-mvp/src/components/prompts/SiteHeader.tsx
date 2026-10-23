"use client";

import { CreditCard, LogOut, Menu, Sparkles, UserRound, X } from "lucide-react";
import { useState } from "react";
import type { AtlasSurface, MemberSummary } from "@/lib/prompts/types";

interface SiteHeaderProps {
  surface: AtlasSurface;
  member: MemberSummary | null;
  onNavigate(surface: AtlasSurface): void;
  onViewPlan(): void;
  onManagePlan(): Promise<void> | void;
  billingPortalBusy: boolean;
  onSignIn(): void;
  onSignOut(): void;
}

const navigation: Array<{ label: string; surface: AtlasSurface }> = [
  { label: "Discover", surface: "discover" },
  { label: "Packs", surface: "packs" },
  { label: "Favorites", surface: "favorites" },
  { label: "Create", surface: "create" },
  { label: "Community", surface: "community" },
];

const billingDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatBillingDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? billingDateFormatter.format(date) : null;
}

function billingActionCopy(member: MemberSummary, busy: boolean) {
  if (busy) {
    return {
      label: "Opening...",
      ariaLabel: "Opening Prompt Atlas billing management",
      title: "Opening Stripe billing management",
    };
  }

  const periodEnd = formatBillingDate(member.currentPeriodEnd);
  if (member.billingState === "access_ends") {
    return {
      label: periodEnd ? `Pro through ${periodEnd}` : "Pro access ending",
      ariaLabel: periodEnd
        ? `Manage Prompt Atlas billing. Pro access ends ${periodEnd}.`
        : "Manage Prompt Atlas billing. Pro access is ending.",
      title: periodEnd
        ? `Pro access is scheduled to end ${periodEnd}. Manage it in Stripe.`
        : "Pro access is scheduled to end. Manage it in Stripe.",
    };
  }
  if (member.billingState === "trial_ends") {
    return {
      label: periodEnd ? `Trial ends ${periodEnd}` : "Manage trial",
      ariaLabel: periodEnd
        ? `Manage Prompt Atlas billing. Trial ends ${periodEnd}.`
        : "Manage Prompt Atlas trial billing.",
      title: periodEnd
        ? `Prompt Atlas Pro trial ends ${periodEnd}. Manage it in Stripe.`
        : "Manage the Prompt Atlas Pro trial in Stripe.",
    };
  }
  if (member.billingState === "renews") {
    return {
      label: periodEnd ? `Renews ${periodEnd}` : "Manage plan",
      ariaLabel: periodEnd
        ? `Manage Prompt Atlas billing. Pro renews ${periodEnd}.`
        : "Manage Prompt Atlas billing.",
      title: periodEnd
        ? `Prompt Atlas Pro renews ${periodEnd}. Manage it in Stripe.`
        : "Manage plan, payment method, or cancellation in Stripe.",
    };
  }
  if (member.billingState === "attention") {
    return {
      label: "Billing needs attention",
      ariaLabel: "Manage Prompt Atlas billing. Your plan needs attention.",
      title: "Your existing plan needs attention in Stripe.",
    };
  }

  return {
    label: member.tier === "explorer_pro" ? "Manage plan" : "Manage billing",
    ariaLabel: "Manage Prompt Atlas billing",
    title: "Manage plan, payment method, or cancellation in Stripe",
  };
}

export function SiteHeader({
  surface,
  member,
  onNavigate,
  onViewPlan,
  onManagePlan,
  billingPortalBusy,
  onSignIn,
  onSignOut,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canStartOrRestartPro =
    !member || (member.tier === "free" && member.canStartCheckout);
  const isRestartingPro = Boolean(
    member?.tier === "free" && member.canManageBilling && member.canStartCheckout,
  );
  const proActionLabel = isRestartingPro ? "Restart Pro" : "View Pro";
  const billingAction = member ? billingActionCopy(member, billingPortalBusy) : null;

  function navigate(surface: AtlasSurface) {
    onNavigate(surface);
    setMenuOpen(false);
  }

  return (
    <header className="relative z-30 flex h-[74px] items-center border-b border-[#d0aa6230] px-5 sm:px-8 lg:px-12">
      <button
        type="button"
        onClick={() => navigate("discover")}
        className="cursor-pointer text-left font-medium uppercase tracking-[0.28em] text-[#e8c77f]"
      >
        <span className="text-[0.58rem] tracking-[0.19em] sm:text-[0.76rem] sm:tracking-[0.28em]">
          Society of Explorers
        </span>
      </button>

      <nav aria-label="Prompt Atlas" className="absolute left-1/2 hidden h-full -translate-x-1/2 items-center gap-8 md:flex">
        {navigation.map((item) => {
          const active = surface === item.surface || (surface === "workspace" && item.surface === "discover");
          return (
            <button
              key={item.surface}
              type="button"
              onClick={() => navigate(item.surface)}
              className={`relative h-full cursor-pointer px-1 text-sm transition-colors ${
                active ? "text-[#e8c77f]" : "text-[#c3bdb2] hover:text-white"
              }`}
            >
              {item.label}
              {active ? <span className="absolute inset-x-0 bottom-0 h-px bg-[#d0aa62]" /> : null}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
          className="cursor-pointer text-[#9e988e] transition-colors hover:text-white md:hidden"
        >
          {menuOpen ? <X size={19} strokeWidth={1.4} /> : <Menu size={19} strokeWidth={1.4} />}
        </button>
        {canStartOrRestartPro ? (
          <button
            type="button"
            onClick={onViewPlan}
            aria-label={
              isRestartingPro
                ? "Restart Prompt Atlas Pro"
                : "View Prompt Atlas Pro plan"
            }
            title={
              isRestartingPro
                ? "Review current terms before restarting Prompt Atlas Pro"
                : "Review Prompt Atlas Pro pricing and terms"
            }
            className="flex h-9 cursor-pointer items-center gap-2 border border-[#d0aa6255] px-2.5 text-xs text-[#e8c77f] transition-colors hover:border-[#d0aa62] hover:bg-[#d0aa620d] hover:text-white sm:px-3"
          >
            <Sparkles size={15} strokeWidth={1.35} />
            <span className="hidden sm:inline">{proActionLabel}</span>
          </button>
        ) : null}
        {member ? (
          <>
            <button
              type="button"
              onClick={() => onNavigate("favorites")}
              className="hidden cursor-pointer text-xs text-[#bdb5a8] transition-colors hover:text-white sm:block"
              title={
                member.runsLimit === null
                  ? "Unlimited Pro runs this month"
                  : `${Math.max(member.runsLimit - member.runsUsed, 0)} runs remaining this month`
              }
            >
              {member.displayName}
            </button>
            {member.canManageBilling ? (
              <button
                type="button"
                onClick={onManagePlan}
                disabled={billingPortalBusy}
                aria-label={billingAction?.ariaLabel}
                title={billingAction?.title}
                className="flex cursor-pointer items-center gap-2 text-xs text-[#8fb8ce] transition-colors hover:text-white disabled:cursor-wait disabled:opacity-55"
              >
                <CreditCard size={17} strokeWidth={1.35} />
                <span className="hidden xl:inline">{billingAction?.label}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="cursor-pointer text-[#8c877e] transition-colors hover:text-[#eee7d9]"
            >
              <LogOut size={18} strokeWidth={1.4} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="flex cursor-pointer items-center gap-2 text-sm text-[#ddd5c8] transition-colors hover:text-white"
          >
            <UserRound size={18} strokeWidth={1.35} />
            <span>Sign in</span>
          </button>
        )}
      </div>

      {menuOpen ? (
        <nav
          aria-label="Mobile Prompt Atlas"
          className="hairline-frame absolute right-4 top-[62px] z-50 w-[210px] px-2 py-2 md:hidden"
        >
          {navigation.map((item) => (
            <button
              key={item.surface}
              type="button"
              onClick={() => navigate(item.surface)}
              className={`flex h-11 w-full cursor-pointer items-center border-b border-[#d0aa621c] px-3 text-left text-sm last:border-0 ${
                surface === item.surface ? "text-[#e8c77f]" : "text-[#aaa49a]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
