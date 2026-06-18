"use client";

import { ArrowUpRight, Bookmark, UsersRound } from "lucide-react";
import type { PromptRecord } from "@/lib/prompts/types";

interface CommunityViewProps {
  prompts: PromptRecord[];
  onOpen(prompt: PromptRecord): void;
}

export function CommunityView({ prompts, onOpen }: CommunityViewProps) {
  const ranked = [...prompts].sort((left, right) => right.usage_count - left.usage_count).slice(0, 12);

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
            Ranked by real use and saves, without exposing anyone&apos;s private inputs or responses.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-[#8baec1]">
          <UsersRound size={19} strokeWidth={1.3} /> Community momentum
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-[1180px]">
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
              <Bookmark size={14} strokeWidth={1.3} /> {prompt.usage_count.toLocaleString()} uses
            </span>
            <ArrowUpRight className="text-[#7b7469] transition-colors group-hover:text-[#d0aa62]" size={19} strokeWidth={1.35} />
          </button>
        ))}
      </div>
    </main>
  );
}

