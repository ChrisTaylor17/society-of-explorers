"use client";

import { ArrowLeft, RefreshCw, ShieldCheck, Target, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PromptAtlasOperatorMetrics } from "@/lib/operator/metrics";

type LoadState = "loading" | "ready" | "denied" | "error";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const countFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function money(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

function count(value: number): string {
  return countFormatter.format(value);
}

function date(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function OperatorDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [metrics, setMetrics] = useState<PromptAtlasOperatorMetrics | null>(null);
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMetrics() {
      try {
        const response = await fetch("/api/operator/metrics", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          setState("denied");
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { metrics?: PromptAtlasOperatorMetrics }
          | null;
        if (!response.ok || !payload?.metrics) {
          setState("error");
          return;
        }
        setMetrics(payload.metrics);
        setState("ready");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setState("error");
      }
    }

    void loadMetrics();
    return () => controller.abort();
  }, [refreshRequest]);

  const overview = metrics
    ? [
        {
          label: "Subscription run rate",
          value: money(metrics.subscriptionRunRateCents),
          detail: "Active paid subscriptions x $12 monthly. Trials are excluded.",
        },
        {
          label: "Paid conversion",
          value: `${metrics.paidConversionPercent.toFixed(1)}%`,
          detail: "Active paid subscriptions divided by members with a run or checkout record.",
        },
        {
          label: "Tracked model cost",
          value: money(metrics.estimatedModelCostCents),
          detail: "Month-to-date completed-run tokens at current Sonnet list prices.",
        },
        {
          label: "MTD model contribution",
          value: money(metrics.estimatedModelContributionCents),
          detail: `Estimated MTD subscription revenue (${money(metrics.estimatedMtdSubscriptionRevenueCents)}) less tracked token cost. Not profit.`,
        },
      ]
    : [];

  const operatingSignals = metrics
    ? [
        ["Run or checkout records", metrics.activatedMembers],
        ["Active explorers this month", metrics.activeExplorers],
        ["Completed runs this month", metrics.completedRuns],
        ["Provider-started runs", metrics.providerStartedRuns],
        ["Active paid subscriptions", metrics.paidActiveSubscriptions],
        ["Trials", metrics.trialingSubscriptions],
        ["Scheduled cancellations", metrics.scheduledCancellations],
        ["Billing recovery needed", metrics.recoverySubscriptions],
        ["Eligible to restart", metrics.restartableSubscriptions],
        ["Free allowance reached", metrics.freeLimitMembers],
      ] as const
    : [];

  const launchBoard = metrics
    ? (() => {
        const completedRuns = Math.max(metrics.completedRuns, 0);
        const costPerCompletedRunCents = completedRuns > 0
          ? metrics.estimatedModelCostCents / completedRuns
          : 0;
        const paidSeatsToOneK = Math.max(
          Math.ceil((100_000 - metrics.subscriptionRunRateCents) / 1200),
          0,
        );
        const contributionPositive = metrics.estimatedModelContributionCents > 0;
        const conversionPressure =
          metrics.freeLimitMembers > 0 ||
          metrics.restartableSubscriptions > 0 ||
          metrics.recoverySubscriptions > 0;
        const demandSignal = metrics.activeExplorers > 0 || metrics.completedRuns > 0;

        return {
          costPerCompletedRunCents,
          paidSeatsToOneK,
          contributionPositive,
          conversionPressure,
          demandSignal,
          actions: [
            conversionPressure
              ? "Prioritize the Pro upgrade path for members who hit the free limit or can restart."
              : "Grow free-limit pressure before optimizing checkout copy.",
            contributionPositive
              ? "Scale traffic carefully while tracking token cost and subscription run rate."
              : "Do not scale paid traffic until contribution turns positive or activation improves.",
            metrics.recoverySubscriptions > 0
              ? "Fix billing recovery before buying more demand."
              : "Keep cancellation and portal flows easy; preserve trust as conversion rises.",
          ],
        };
      })()
    : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1180px] px-5 py-8 sm:px-10 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-[#d0aa6230] pb-7">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[#d0aa62] transition-colors hover:text-[#e8c77f]"
          >
            <ArrowLeft size={16} strokeWidth={1.4} /> Prompt Atlas
          </Link>
          <h1 className="display-type mt-4 text-4xl text-[#eee7d9] sm:text-5xl">
            Operator evidence
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#969087]">
            Aggregate activation, subscription, and model-cost signals for improving a
            sustainable member product without behavioral surveillance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState("loading");
            setRefreshRequest((current) => current + 1);
          }}
          disabled={state === "loading"}
          className="flex h-11 cursor-pointer items-center gap-2 border border-[#d0aa6255] px-4 text-sm text-[#e8c77f] transition-colors hover:border-[#d0aa62] hover:bg-[#d0aa620d] disabled:cursor-wait disabled:opacity-55"
        >
          <RefreshCw
            size={16}
            strokeWidth={1.4}
            className={state === "loading" ? "animate-spin" : undefined}
          />
          Refresh aggregates
        </button>
      </header>

      <div aria-live="polite">
        {state === "loading" ? (
          <p className="mt-12 text-sm text-[#969087]">Loading private aggregates...</p>
        ) : null}
        {state === "denied" ? (
          <section className="hairline-frame mt-12 max-w-2xl p-7" role="alert">
            <h2 className="display-type text-3xl text-[#eee7d9]">Operator access required</h2>
            <p className="mt-3 text-sm leading-6 text-[#969087]">
              Sign in through Prompt Atlas with an email listed in the server-only operator
              allowlist, then return to this page.
            </p>
          </section>
        ) : null}
        {state === "error" ? (
          <section className="hairline-frame mt-12 max-w-2xl p-7" role="alert">
            <h2 className="display-type text-3xl text-[#eee7d9]">Metrics unavailable</h2>
            <p className="mt-3 text-sm leading-6 text-[#969087]">
              The aggregate metrics function or operator environment is not ready. No billing
              or member state was changed.
            </p>
          </section>
        ) : null}
      </div>

      {state === "ready" && metrics ? (
        <>
          <section className="mt-10" aria-labelledby="revenue-evidence-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#d0aa62]">
                  Revenue evidence
                </p>
                <h2
                  id="revenue-evidence-title"
                  className="display-type mt-2 text-3xl text-[#eee7d9]"
                >
                  What is economically true now
                </h2>
              </div>
              <p className="font-mono text-xs text-[#77736d]">
                {date(metrics.monthStart)} to {date(metrics.nextMonthStart)} UTC
              </p>
            </div>
            <div className="mt-6 grid gap-px border border-[#d0aa6230] bg-[#d0aa6230] md:grid-cols-2 xl:grid-cols-4">
              {overview.map((metric) => (
                <article key={metric.label} className="bg-[#0b1013] p-6">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#817b72]">
                    {metric.label}
                  </p>
                  <p className="mt-4 font-mono text-3xl text-[#e8c77f]">{metric.value}</p>
                  <p className="mt-4 text-xs leading-5 text-[#858078]">{metric.detail}</p>
                </article>
              ))}
            </div>
          </section>

          {launchBoard ? (
            <section className="mt-10" aria-labelledby="launch-board-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#d0aa62]">
                    Launch board
                  </p>
                  <h2
                    id="launch-board-title"
                    className="display-type mt-2 text-3xl text-[#eee7d9]"
                  >
                    What to do before buying attention
                  </h2>
                </div>
                <p className="max-w-[410px] text-xs leading-5 text-[#817b72]">
                  These signals come from aggregate counts only. They are directional operating
                  evidence, not a member list or profit statement.
                </p>
              </div>

              <div className="mt-6 grid gap-px border border-[#d0aa6230] bg-[#d0aa6230] lg:grid-cols-[1fr_1fr_1.35fr]">
                <article className="bg-[#0b1013] p-6">
                  <div className="flex items-center gap-2 text-[#8fb8ce]">
                    <Target size={18} strokeWidth={1.35} />
                    <p className="text-xs uppercase tracking-[0.14em]">MRR target</p>
                  </div>
                  <p className="mt-4 font-mono text-3xl text-[#e8c77f]">
                    {count(launchBoard.paidSeatsToOneK)}
                  </p>
                  <p className="mt-4 text-xs leading-5 text-[#858078]">
                    More paid seats needed to reach a $1,000 monthly subscription run rate at
                    the current $12 plan.
                  </p>
                </article>

                <article className="bg-[#0b1013] p-6">
                  <div className="flex items-center gap-2 text-[#8fb8ce]">
                    <TrendingUp size={18} strokeWidth={1.35} />
                    <p className="text-xs uppercase tracking-[0.14em]">Run economics</p>
                  </div>
                  <p className="mt-4 font-mono text-3xl text-[#e8c77f]">
                    {money(Math.round(launchBoard.costPerCompletedRunCents))}
                  </p>
                  <p className="mt-4 text-xs leading-5 text-[#858078]">
                    Estimated model cost per completed run this month. Token ceilings and the
                    10/hour pace keep unlimited Pro bounded.
                  </p>
                </article>

                <article className="bg-[#0b1013] p-6">
                  <p className="text-xs uppercase tracking-[0.14em] text-[#817b72]">
                    Next operator moves
                  </p>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-[#d3cabd]">
                    {launchBoard.actions.map((action) => (
                      <li key={action} className="border-l border-[#d0aa6255] pl-3">
                        {action}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 grid gap-2 text-xs text-[#858078] sm:grid-cols-3">
                    <p>
                      Demand:{" "}
                      <span className={launchBoard.demandSignal ? "text-[#8fb89a]" : "text-[#d0aa62]"}>
                        {launchBoard.demandSignal ? "present" : "thin"}
                      </span>
                    </p>
                    <p>
                      Conversion:{" "}
                      <span className={launchBoard.conversionPressure ? "text-[#8fb89a]" : "text-[#d0aa62]"}>
                        {launchBoard.conversionPressure ? "pressure" : "early"}
                      </span>
                    </p>
                    <p>
                      Contribution:{" "}
                      <span className={launchBoard.contributionPositive ? "text-[#8fb89a]" : "text-[#d78d7d]"}>
                        {launchBoard.contributionPositive ? "positive" : "not yet"}
                      </span>
                    </p>
                  </div>
                </article>
              </div>
            </section>
          ) : null}

          <section className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="hairline-frame p-6 sm:p-8">
              <h2 className="display-type text-3xl text-[#eee7d9]">Operating signals</h2>
              <dl className="mt-6 divide-y divide-[#d0aa6224]">
                {operatingSignals.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-6 py-3.5">
                    <dt className="text-sm text-[#a9a195]">{label}</dt>
                    <dd className="font-mono text-sm text-[#eee7d9]">{count(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <aside className="hairline-frame p-6 sm:p-8" aria-labelledby="privacy-boundary-title">
              <ShieldCheck className="text-[#6b9bb5]" size={24} strokeWidth={1.35} />
              <h2
                id="privacy-boundary-title"
                className="display-type mt-5 text-3xl text-[#eee7d9]"
              >
                Aggregate by design
              </h2>
              <p className="mt-4 text-sm leading-6 text-[#969087]">
                Postgres computes these totals before the application receives them. The payload
                contains no member names, emails, wallets, prompt text, context, fingerprints,
                Stripe identifiers, or individual run rows.
              </p>
              <p className="mt-4 text-xs leading-5 text-[#77736d]">
                Input and output token totals: {count(metrics.inputTokens)} / {count(metrics.outputTokens)}.
                Generated {date(metrics.generatedAt)} UTC. Refresh is manual; this page sends no
                analytics event and performs no Stripe operation.
              </p>
              <p className="mt-4 text-xs leading-5 text-[#77736d]">
                Contribution uses prorated month-to-date subscription revenue and completed-run
                token cost only. It excludes Stripe fees, hosting, taxes, labor, refunds, credits,
                and every other operating cost.
              </p>
            </aside>
          </section>
        </>
      ) : null}
    </main>
  );
}
