"use client";

import {
  Brain,
  BriefcaseBusiness,
  Hand,
  Leaf,
  PencilLine,
  Shuffle,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { DriftingPrompt, FocusedPrompt } from "./PromptCard";
import type {
  DiscoveryCategory,
  DiscoverySort,
  MemberSummary,
  PromptRecord,
} from "@/lib/prompts/types";

interface DiscoveryCanvasProps {
  prompts: PromptRecord[];
  selected: PromptRecord;
  category: DiscoveryCategory;
  sort: DiscoverySort;
  member: MemberSummary | null;
  onSelect(prompt: PromptRecord): void;
  onRun(): void;
  onCustomize(): void;
  onFavorite(): void;
  onCategory(category: DiscoveryCategory): void;
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
  category,
  sort,
  member,
  onSelect,
  onRun,
  onCustomize,
  onFavorite,
  onCategory,
  onShuffle,
  onSort,
}: DiscoveryCanvasProps) {
  const drifting = prompts.filter((prompt) => prompt.id !== selected.id).slice(0, positions.length);
  const remaining = member?.runsLimit === null
    ? "Unlimited explorations"
    : `${Math.max((member?.runsLimit ?? 5) - (member?.runsUsed ?? 0), 0)} free runs this month`;

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
        </div>

        <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden="true">
          {drifting.map((prompt, index) => (
            <div key={prompt.id} className="pointer-events-auto">
              <DriftingPrompt prompt={prompt} position={positions[index]} onSelect={onSelect} />
            </div>
          ))}
        </div>

        <div className="relative z-20 mx-auto mt-9 flex max-w-[470px] items-center justify-center md:absolute md:left-[52%] md:top-[51%] md:mt-0 md:w-[min(42vw,470px)] md:-translate-x-1/2 md:-translate-y-1/2">
          <FocusedPrompt
            prompt={selected}
            onRun={onRun}
            onCustomize={onCustomize}
            onFavorite={onFavorite}
          />
        </div>

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
