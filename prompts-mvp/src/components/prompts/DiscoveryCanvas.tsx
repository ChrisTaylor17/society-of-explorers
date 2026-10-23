"use client";

import {
  Brain,
  BriefcaseBusiness,
  ChevronRight,
  DollarSign,
  Hand,
  Leaf,
  PencilLine,
  Shuffle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { DriftingPrompt, FocusedPrompt } from "./PromptCard";
import { PROMPT_ATLAS_FREE_MONTHLY_RUNS } from "@/lib/billing/plan";
import { launchSignalForPrompt } from "@/lib/prompts/launchSignals";
import type {
  DiscoveryCategory,
  DiscoverySort,
  MemberSummary,
  PromptRecord,
} from "@/lib/prompts/types";

export interface GuidedPathStep {
  label: string;
  prompt: PromptRecord;
}

interface DiscoveryCanvasProps {
  prompts: PromptRecord[];
  selected: PromptRecord;
  launchPath: GuidedPathStep[];
  category: DiscoveryCategory;
  sort: DiscoverySort;
  member: MemberSummary | null;
  onSelect(prompt: PromptRecord): void;
  onRun(): void;
  onCustomize(): void;
  onFavorite(): void;
  onSignal(): void;
  onShare(): void;
  shareCopied: boolean;
  onCategory(category: DiscoveryCategory): void;
  onOpenPacks(): void;
  onViewPlan(): void;
  onShuffle(): void;
  onSort(sort: DiscoverySort): void;
}

const positions = [
  { left: "35%", top: "10%", width: "220px", opacity: 0.28, delay: 0.5, distance: 8 },
  { left: "64%", top: "17%", width: "270px", opacity: 0.66, delay: 1.4, distance: 10 },
  { left: "88%", top: "31%", width: "230px", opacity: 0.24, delay: 2.1, distance: 12 },
  { left: "7%", top: "45%", width: "250px", opacity: 0.42, delay: 1.1, distance: 9 },
  { left: "72%", top: "48%", width: "210px", opacity: 0.48, delay: 2.8, distance: 7 },
  { left: "15%", top: "68%", width: "250px", opacity: 0.72, delay: 0.9, distance: 11 },
  { left: "73%", top: "73%", width: "260px", opacity: 0.34, delay: 2.4, distance: 8 },
  { left: "34%", top: "85%", width: "250px", opacity: 0.26, delay: 1.7, distance: 9 },
  { left: "-5%", top: "81%", width: "230px", opacity: 0.18, delay: 3.1, distance: 12 },
  { left: "91%", top: "83%", width: "240px", opacity: 0.21, delay: 1.2, distance: 10 },
];

const categories: Array<{
  id: DiscoveryCategory;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: "for-you", label: "For you", icon: Sparkles },
  { id: "create", label: "Create", icon: PencilLine },
  { id: "think", label: "Think", icon: Brain },
  { id: "work", label: "Work", icon: BriefcaseBusiness },
  { id: "reflect", label: "Reflect", icon: Leaf },
];

export function DiscoveryCanvas({
  prompts,
  selected,
  launchPath,
  category,
  sort,
  member,
  onSelect,
  onRun,
  onCustomize,
  onFavorite,
  onSignal,
  onShare,
  shareCopied,
  onCategory,
  onOpenPacks,
  onViewPlan,
  onShuffle,
  onSort,
}: DiscoveryCanvasProps) {
  const drifting = prompts.filter((prompt) => prompt.id !== selected.id).slice(0, positions.length);
  const unlimitedPro = member?.tier === "explorer_pro" && member.runsLimit === null;
  const runsRemaining = unlimitedPro
    ? null
    : Math.max(
        (member?.runsLimit ?? PROMPT_ATLAS_FREE_MONTHLY_RUNS) - (member?.runsUsed ?? 0),
        0,
      );
  const remaining = member?.tier === "explorer_pro"
    ? unlimitedPro
      ? "Unlimited Pro runs this month"
      : `${runsRemaining} Pro runs this month`
    : `${runsRemaining} free runs this month`;
  const pathSteps = launchPath.slice(0, 4);
  const launchSignal = launchSignalForPrompt(selected);
  const showProAction = member?.tier !== "explorer_pro";

  return (
    <main className="relative h-[calc(100dvh-74px)] min-h-[690px] overflow-hidden">
      <section className="relative h-[calc(100%-122px)] min-h-[568px] px-5 pb-5 pt-8 sm:px-10 lg:px-12 lg:pt-14">
        <div className="relative z-10 max-w-[520px]">
          <h1 className="display-type text-[clamp(3.1rem,5vw,4.5rem)] font-medium leading-[0.96] tracking-[-0.03em] text-[#eee7d9]">
            Find a question
            <br />
            worth following.
          </h1>
          <div className="mb-5 mt-6 h-px w-11 bg-[#d0aa62]" />
          <p className="max-w-[335px] text-[1.05rem] leading-7 text-[#d2cbbf]">
            Ideas drift past. Choose one, make it yours, and take the next step.
          </p>

          {pathSteps.length ? (
            <div
              className="mt-4 grid max-w-[355px] grid-cols-[78px_minmax(0,1fr)] items-stretch gap-2 lg:hidden"
              aria-label="Revenue path prompts"
            >
              <div className="flex min-h-11 flex-col justify-center border-l border-[#d0aa6257] bg-[#080c0ee8] pl-3 text-[0.54rem] uppercase leading-3 tracking-[0.16em] text-[#d0aa62] backdrop-blur-sm">
                <DollarSign size={13} strokeWidth={1.35} />
                Revenue path
              </div>
              <div className="grid min-w-0 grid-cols-4 gap-1.5">
                {pathSteps.map((step, index) => {
                  const active = step.prompt.id === selected.id;
                  return (
                    <button
                      key={step.prompt.id}
                      type="button"
                      aria-label={`Revenue path ${index + 1}: ${step.prompt.title}`}
                      onClick={() => onSelect(step.prompt)}
                      className={`flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center border px-1 text-center transition-colors ${
                        active
                          ? "border-[#d0aa6290] bg-[#d0aa6214] text-[#eee7d9]"
                          : "border-[#d0aa622e] bg-[#080c0ecc] text-[#aaa49a] hover:border-[#d0aa6270] hover:text-[#eee7d9]"
                      }`}
                    >
                      <span className="font-mono text-[0.58rem] leading-none text-[#d0aa62]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="mt-1 max-w-full whitespace-nowrap text-[0.48rem] uppercase leading-none tracking-[0.04em]">
                        {step.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {pathSteps.length ? (
            <div className="mt-8 hidden max-w-[430px] border-l border-[#d0aa6242] bg-[#080c0ee8] py-3 pl-5 pr-3 backdrop-blur-sm lg:block">
              <div className="mb-3 flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.2em] text-[#d0aa62]">
                <DollarSign size={14} strokeWidth={1.4} />
                Revenue path
              </div>
              <div className="grid gap-1.5">
                {pathSteps.map((step, index) => {
                  const active = step.prompt.id === selected.id;
                  return (
                    <button
                      key={step.prompt.id}
                      type="button"
                      onClick={() => onSelect(step.prompt)}
                      className={`group flex min-h-10 cursor-pointer items-center justify-between gap-3 border px-3 py-2 text-left text-xs transition-colors ${
                        active
                          ? "border-[#d0aa6290] bg-[#d0aa6212] text-[#eee7d9]"
                          : "border-[#d0aa6225] text-[#a9a298] hover:border-[#d0aa6270] hover:text-[#eee7d9]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="font-mono text-[0.66rem] text-[#d0aa62]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[0.62rem] uppercase tracking-[0.16em] text-[#d0aa62]">
                            {step.label}
                          </span>
                          <span className="block truncate text-sm leading-5">
                            {step.prompt.title}
                          </span>
                        </span>
                      </span>
                      <ChevronRight
                        size={15}
                        strokeWidth={1.35}
                        className={active ? "text-[#d0aa62]" : "text-[#625d55] group-hover:text-[#d0aa62]"}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          {drifting.map((prompt, index) => (
            <div key={prompt.id} className="pointer-events-auto">
              <DriftingPrompt prompt={prompt} position={positions[index]} onSelect={onSelect} />
            </div>
          ))}
        </div>

        <div className="relative z-20 mx-auto mt-5 flex max-w-[470px] items-center justify-center sm:mt-9 md:absolute md:left-[52%] md:top-[51%] md:mt-0 md:w-[min(42vw,470px)] md:-translate-x-1/2 md:-translate-y-1/2">
          <FocusedPrompt
            prompt={selected}
            onRun={onRun}
            onCustomize={onCustomize}
            onFavorite={onFavorite}
            onSignal={onSignal}
            onShare={onShare}
            shareCopied={shareCopied}
          />
        </div>

        <aside className="absolute right-12 top-[52%] z-10 hidden w-[282px] -translate-y-1/2 border border-[#d0aa6230] bg-[#080c0ee8] px-4 py-4 backdrop-blur-sm xl:block">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.6rem] uppercase tracking-[0.2em] text-[#d0aa62]">
              Profit loop
            </p>
            <span className="font-mono text-[0.62rem] text-[#6b9bb5]">
              {launchSignal.phase}
            </span>
          </div>
          <p className="mt-3 display-type text-[1.55rem] leading-[1.05] text-[#eee7d9]">
            {launchSignal.artifact}
          </p>
          <dl className="mt-4 grid gap-3 border-y border-[#d0aa6228] py-4">
            <div>
              <dt className="text-[0.58rem] uppercase tracking-[0.16em] text-[#77736d]">
                Proof to collect
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[#c6beb2]">
                {launchSignal.proof}
              </dd>
            </div>
            <div>
              <dt className="text-[0.58rem] uppercase tracking-[0.16em] text-[#77736d]">
                Next paid move
              </dt>
              <dd className="mt-1 text-xs leading-5 text-[#c6beb2]">
                {launchSignal.operatorMove}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onOpenPacks}
              className="flex h-9 flex-1 cursor-pointer items-center justify-center border border-[#6b9bb570] px-3 text-xs text-[#cde2ec] transition-colors hover:border-[#8fb8ce] hover:text-white"
            >
              Open packs
            </button>
            {showProAction ? (
              <button
                type="button"
                onClick={onViewPlan}
                className="flex h-9 flex-1 cursor-pointer items-center justify-center bg-[#d0aa62] px-3 text-xs font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f]"
              >
                View Pro
              </button>
            ) : null}
          </div>
          <p className="mt-3 text-[0.68rem] leading-4 text-[#77736d]">
            Human value first. Public signals stay aggregate.
          </p>
        </aside>

        <div className="hidden">
          {drifting.slice(0, 4).map((prompt) => (
            <button
              key={prompt.id}
              type="button"
              onClick={() => onSelect(prompt)}
              className="display-type min-w-[210px] cursor-pointer text-left text-lg leading-6 text-[#8f8b84]"
            >
              {prompt.title}
            </button>
          ))}
        </div>
      </section>

      <section className="atlas-bottom-safe absolute inset-x-4 bottom-4 z-30 flex min-h-[86px] items-center border border-[#d0aa6238] bg-[#080c0ef2] px-2 backdrop-blur sm:inset-x-5 sm:bottom-[33px] sm:min-h-[100px] sm:px-3 lg:px-8">
        <div className="hidden min-w-[215px] border-r border-[#d0aa6230] pr-7 text-xs text-[#d0aa62] lg:block">
          {remaining}
        </div>

        <div className="flex min-w-0 flex-1 items-center overflow-x-auto lg:justify-center">
          {categories.map((item) => {
            const Icon = item.icon;
            const active = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategory(item.id)}
                className={`relative flex h-[58px] min-w-[51px] cursor-pointer items-center justify-center gap-2 px-2 text-xs transition-colors sm:h-[62px] sm:min-w-[105px] sm:px-3 sm:text-sm ${
                  active ? "text-[#e8c77f]" : "text-[#aaa49a] hover:text-white"
                }`}
              >
                <Icon size={17} strokeWidth={1.35} />
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sr-only sm:hidden">{item.label}</span>
                {active ? <span className="absolute inset-x-3 bottom-0 h-px bg-[#d0aa62] sm:inset-x-5" /> : null}
              </button>
            );
          })}
        </div>

        <div className="ml-2 flex border-l border-[#d0aa6230] pl-2 sm:ml-4 sm:pl-4">
          <button
            type="button"
            onClick={onShuffle}
            aria-label="Shuffle prompts"
            className="flex h-[60px] cursor-pointer items-center gap-2 px-3 text-xs text-[#7fa8be] transition-colors hover:text-[#b7d8e8] sm:text-sm"
          >
            <Shuffle size={17} strokeWidth={1.35} />
            <span className="hidden sm:inline">Shuffle</span>
          </button>
          <button
            type="button"
            onClick={() => onSort(sort === "trending" ? "new" : "trending")}
            className={`hidden h-[60px] cursor-pointer items-center gap-2 px-3 text-xs transition-colors sm:flex sm:text-sm ${
              sort === "trending" ? "text-[#d0aa62]" : "text-[#8d8981] hover:text-white"
            }`}
            title={sort === "trending" ? "Showing trending prompts" : "Showing newest prompts"}
          >
            <TrendingUp size={17} strokeWidth={1.35} />
            <span className="hidden xl:inline">{sort === "new" ? "Newest" : "Trending"}</span>
          </button>
          <div className="hidden items-center gap-2 border-l border-[#d0aa6230] pl-5 text-sm text-[#8d8981] xl:flex">
            <Hand size={18} strokeWidth={1.2} /> Drag to explore
          </div>
        </div>
      </section>
    </main>
  );
}
