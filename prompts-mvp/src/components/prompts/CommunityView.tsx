"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  PencilLine,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PROMPT_CATEGORIES, type MemberSummary, type PromptRecord } from "@/lib/prompts/types";

type LeaderboardMode = "momentum" | "runs" | "saves" | "signals";

interface CommunityViewProps {
  prompts: PromptRecord[];
  member: MemberSummary | null;
  onOpen(prompt: PromptRecord): void;
  onCreate(): void;
  onDiscover(): void;
  onViewPlan(): void;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

const leaderboardModes: Array<{
  id: LeaderboardMode;
  label: string;
  description: string;
}> = [
  {
    id: "momentum",
    label: "Momentum",
    description: "Signal-weighted prompts moving fastest right now.",
  },
  {
    id: "runs",
    label: "Runs",
    description: "Prompts people are choosing to execute most often.",
  },
  {
    id: "saves",
    label: "Saves",
    description: "Prompts members are keeping for later.",
  },
  {
    id: "signals",
    label: "Signals",
    description: "Prompts members explicitly marked as useful.",
  },
];

const categoryLabels = {
  create: "Create",
  think: "Think",
  work: "Work",
  reflect: "Reflect",
} as const;

function scorePrompt(prompt: PromptRecord, mode: LeaderboardMode): number {
  if (mode === "runs") return prompt.usage_count;
  if (mode === "saves") return prompt.favorite_count ?? 0;
  if (mode === "signals") return prompt.vote_count ?? 0;
  return prompt.momentum ?? prompt.usage_count;
}

function metricSummary(prompt: PromptRecord, mode: LeaderboardMode): string {
  if (mode === "runs") return `${formatCompactNumber(prompt.usage_count)} uses`;
  if (mode === "saves") return `${formatCompactNumber(prompt.favorite_count ?? 0)} saves`;
  if (mode === "signals") return `${formatCompactNumber(prompt.vote_count ?? 0)} signals`;
  return `${formatCompactNumber(prompt.momentum ?? prompt.usage_count)} momentum`;
}

export function CommunityView({
  prompts,
  member,
  onOpen,
  onCreate,
  onDiscover,
  onViewPlan,
}: CommunityViewProps) {
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>("momentum");
  const ranked = useMemo(
    () =>
      [...prompts]
        .sort((left, right) => {
          const scoreDelta = scorePrompt(right, leaderboardMode) - scorePrompt(left, leaderboardMode);
          if (scoreDelta !== 0) return scoreDelta;
          return (right.momentum ?? right.usage_count) - (left.momentum ?? left.usage_count);
        })
        .slice(0, 12),
    [leaderboardMode, prompts],
  );
  const momentumRanked = useMemo(
    () =>
      [...prompts].sort(
        (left, right) =>
          (right.momentum ?? right.usage_count) - (left.momentum ?? left.usage_count),
      ),
    [prompts],
  );
  const categorySignals = useMemo(
    () =>
      PROMPT_CATEGORIES.map((category) => {
        const categoryPrompts = prompts.filter((prompt) => prompt.category === category);
        const runs = categoryPrompts.reduce((total, prompt) => total + prompt.usage_count, 0);
        const saves = categoryPrompts.reduce((total, prompt) => total + (prompt.favorite_count ?? 0), 0);
        const signals = categoryPrompts.reduce((total, prompt) => total + (prompt.vote_count ?? 0), 0);
        const topPrompt =
          [...categoryPrompts].sort(
            (left, right) =>
              (right.momentum ?? right.usage_count) - (left.momentum ?? left.usage_count),
          )[0] ?? null;
        return {
          category,
          label: categoryLabels[category],
          runs,
          saves,
          signals,
          topPrompt,
        };
      }).sort((left, right) => {
        const leftScore = left.runs + left.saves + left.signals;
        const rightScore = right.runs + right.saves + right.signals;
        return rightScore - leftScore;
      }),
    [prompts],
  );
  const totalRuns = prompts.reduce((total, prompt) => total + prompt.usage_count, 0);
  const totalSaves = prompts.reduce((total, prompt) => total + (prompt.favorite_count ?? 0), 0);
  const totalSignals = prompts.reduce((total, prompt) => total + (prompt.vote_count ?? 0), 0);
  const fastestMover = momentumRanked[0];
  const mostSaved =
    [...prompts]
      .sort((left, right) => (right.favorite_count ?? 0) - (left.favorite_count ?? 0))
      .find((prompt) => (prompt.favorite_count ?? 0) > 0) ?? null;
  const mostSignaled =
    [...prompts]
      .sort((left, right) => (right.vote_count ?? 0) - (left.vote_count ?? 0))
      .find((prompt) => (prompt.vote_count ?? 0) > 0) ?? null;
  const activeMode = leaderboardModes.find((mode) => mode.id === leaderboardMode) ?? leaderboardModes[0];
  const showProAction = member?.tier !== "explorer_pro";

  return (
    <main className="min-h-[calc(100dvh-74px)] px-5 py-10 sm:px-10 lg:px-14 lg:py-14">
      <div className="flex flex-col justify-between gap-8 border-b border-[#d0aa6230] pb-10 lg:flex-row lg:items-end">
        <div>
          <h1 className="display-type text-[clamp(3rem,6vw,5.2rem)] font-medium leading-[0.9] text-[#eee7d9]">
            Prompts that move
            <br />
            through the community.
          </h1>
          <p className="mt-5 max-w-[620px] text-base leading-7 text-[#969087]">
            Ranked by aggregate runs, saves, and signals, without exposing anyone&apos;s private inputs or responses.
          </p>
        </div>
        <div className="w-full border-t border-[#d0aa6230] pt-6 lg:w-[390px] lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center gap-3 text-sm text-[#8baec1]">
            <UsersRound size={19} strokeWidth={1.3} /> Community momentum
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-[#d0aa6224] py-5">
            <div>
              <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">Runs</dt>
              <dd className="display-type mt-1 text-2xl leading-none text-[#eee7d9]">
                {formatCompactNumber(totalRuns)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">Saves</dt>
              <dd className="display-type mt-1 text-2xl leading-none text-[#eee7d9]">
                {formatCompactNumber(totalSaves)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">Signals</dt>
              <dd className="display-type mt-1 text-2xl leading-none text-[#eee7d9]">
                {formatCompactNumber(totalSignals)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onCreate}
              className="flex h-10 cursor-pointer items-center gap-2 bg-[#d0aa62] px-4 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f]"
            >
              <PencilLine size={16} strokeWidth={1.45} /> Create prompt
            </button>
            {showProAction ? (
              <button
                type="button"
                onClick={onViewPlan}
                className="flex h-10 cursor-pointer items-center gap-2 border border-[#6b9bb570] px-4 text-sm text-[#cde2ec] transition-colors hover:border-[#8fb8ce] hover:text-white"
              >
                <Sparkles size={16} strokeWidth={1.35} /> View Pro
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDiscover}
              className="flex h-10 cursor-pointer items-center gap-2 text-sm text-[#aaa49a] transition-colors hover:text-white"
            >
              Discover prompts <ArrowRight size={15} strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </div>

      <section className="grid gap-5 border-b border-[#d0aa6220] py-7 lg:grid-cols-3">
        <button
          type="button"
          onClick={() => fastestMover && onOpen(fastestMover)}
          className="group flex min-h-[96px] cursor-pointer items-center justify-between border border-[#d0aa6228] px-5 py-4 text-left transition-colors hover:border-[#d0aa625c] hover:bg-[#d0aa6208] disabled:cursor-default disabled:opacity-75 disabled:hover:border-[#d0aa6228] disabled:hover:bg-transparent"
        >
          <span>
            <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#6b9bb5]">
              Fastest mover
            </span>
            <span className="display-type mt-2 block text-[1.75rem] leading-7 text-[#e7dfd1]">
              {fastestMover?.title ?? "No prompt signal yet"}
            </span>
          </span>
          <ArrowUpRight
            className="ml-5 shrink-0 text-[#7b7469] transition-colors group-hover:text-[#d0aa62]"
            size={19}
            strokeWidth={1.35}
          />
        </button>
        <button
          type="button"
          onClick={() => mostSaved && onOpen(mostSaved)}
          disabled={!mostSaved}
          className="group flex min-h-[96px] cursor-pointer items-center justify-between border border-[#d0aa6228] px-5 py-4 text-left transition-colors hover:border-[#d0aa625c] hover:bg-[#d0aa6208]"
        >
          <span>
            <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#6b9bb5]">
              Most saved
            </span>
            <span className="display-type mt-2 block text-[1.75rem] leading-7 text-[#e7dfd1]">
              {mostSaved?.title ?? "Saving signal is warming up"}
            </span>
          </span>
          <ArrowUpRight
            className="ml-5 shrink-0 text-[#7b7469] transition-colors group-hover:text-[#d0aa62]"
            size={19}
            strokeWidth={1.35}
          />
        </button>
        <button
          type="button"
          onClick={() => mostSignaled && onOpen(mostSignaled)}
          disabled={!mostSignaled}
          className="group flex min-h-[96px] cursor-pointer items-center justify-between border border-[#d0aa6228] px-5 py-4 text-left transition-colors hover:border-[#d0aa625c] hover:bg-[#d0aa6208] disabled:cursor-default disabled:opacity-75 disabled:hover:border-[#d0aa6228] disabled:hover:bg-transparent"
        >
          <span>
            <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#6b9bb5]">
              Most signaled
            </span>
            <span className="display-type mt-2 block text-[1.75rem] leading-7 text-[#e7dfd1]">
              {mostSignaled?.title ?? "Signals are still gathering"}
            </span>
          </span>
          <ArrowUpRight
            className="ml-5 shrink-0 text-[#7b7469] transition-colors group-hover:text-[#d0aa62]"
            size={19}
            strokeWidth={1.35}
          />
        </button>
      </section>

      <section className="grid gap-5 border-b border-[#d0aa6220] py-7 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <h2 className="text-[0.68rem] uppercase tracking-[0.2em] text-[#d0aa62]">
            Market signals
          </h2>
          <p className="mt-3 max-w-[430px] text-sm leading-6 text-[#8d867c]">
            Category demand from public prompt activity only. Strong signals can become bundles,
            workshops, or paid prompt packs without harvesting private context.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {categorySignals.map((category) => (
            <button
              key={category.category}
              type="button"
              onClick={() => category.topPrompt && onOpen(category.topPrompt)}
              className="group min-h-[94px] cursor-pointer border border-[#d0aa6228] px-4 py-3 text-left transition-colors hover:border-[#d0aa625c] hover:bg-[#d0aa6208]"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[0.62rem] uppercase tracking-[0.16em] text-[#6b9bb5]">
                  {category.label}
                </span>
                <ArrowUpRight
                  className="text-[#6f685e] transition-colors group-hover:text-[#d0aa62]"
                  size={16}
                  strokeWidth={1.35}
                />
              </span>
              <span className="mt-3 grid grid-cols-3 gap-2 text-xs text-[#8a8379]">
                <span>{formatCompactNumber(category.runs)} runs</span>
                <span>{formatCompactNumber(category.saves)} saves</span>
                <span>{formatCompactNumber(category.signals)} signals</span>
              </span>
              <span className="mt-2 block truncate text-sm text-[#d8cfbf]">
                {category.topPrompt?.title ?? "No public prompt yet"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="mx-auto mt-4 max-w-[1180px]">
        <div className="flex flex-col gap-4 border-b border-[#d0aa621f] py-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-[0.68rem] uppercase tracking-[0.2em] text-[#d0aa62]">
              Leaderboard
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#8d867c]">{activeMode.description}</p>
          </div>
          <div className="flex min-w-0 overflow-x-auto border border-[#d0aa6228]">
            {leaderboardModes.map((mode) => {
              const active = leaderboardMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  aria-label={`Sort community leaderboard by ${mode.id}`}
                  aria-pressed={active}
                  onClick={() => setLeaderboardMode(mode.id)}
                  className={`h-11 min-w-[78px] cursor-pointer border-r border-[#d0aa6228] px-2 text-xs transition-colors last:border-r-0 sm:min-w-[104px] sm:px-4 sm:text-sm ${
                    active
                      ? "bg-[#d0aa6214] text-[#e8c77f]"
                      : "text-[#aaa49a] hover:bg-[#d0aa6208] hover:text-white"
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>
        </div>
        {ranked.map((prompt, index) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onOpen(prompt)}
            className="group grid w-full cursor-pointer grid-cols-[46px_1fr_auto] items-center gap-4 border-b border-[#d0aa621f] py-6 text-left transition-colors hover:bg-[#d0aa6208] sm:grid-cols-[70px_1fr_150px_auto] sm:px-4"
          >
            <span className="font-mono text-xs text-[#6b9bb5]">{String(index + 1).padStart(2, "0")}</span>
            <span>
              <span className="display-type block text-[1.55rem] leading-7 text-[#e7dfd1] transition-colors group-hover:text-white sm:text-[1.85rem]">
                {prompt.title}
              </span>
              <span className="mt-1 hidden text-sm text-[#7f7b74] sm:block">{prompt.description}</span>
            </span>
            <span className="hidden items-center gap-2 text-xs text-[#817b72] sm:flex">
              <Bookmark size={14} strokeWidth={1.3} /> {metricSummary(prompt, leaderboardMode)}
            </span>
            <ArrowUpRight className="text-[#7b7469] transition-colors group-hover:text-[#d0aa62]" size={19} strokeWidth={1.35} />
          </button>
        ))}
      </div>
    </main>
  );
}
