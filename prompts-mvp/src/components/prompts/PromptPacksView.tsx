"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { resolvePromptPacks } from "@/lib/prompts/packs";
import type { MemberSummary, PromptRecord } from "@/lib/prompts/types";

interface PromptPacksViewProps {
  prompts: PromptRecord[];
  member: MemberSummary | null;
  onOpen(prompt: PromptRecord): void;
  onDiscover(): void;
  onViewPlan(): void;
}

export function PromptPacksView({
  prompts,
  member,
  onOpen,
  onDiscover,
  onViewPlan,
}: PromptPacksViewProps) {
  const packs = resolvePromptPacks(prompts);
  const [selectedPackId, setSelectedPackId] = useState(() => packs[0]?.id ?? "");
  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) ?? packs[0] ?? null,
    [packs, selectedPackId],
  );
  const showProAction = member?.tier !== "explorer_pro";
  const totalSteps = packs.reduce((total, pack) => total + pack.prompts.length, 0);
  const selectedSteps = selectedPack?.prompts.length ?? 0;

  return (
    <main className="min-h-[calc(100dvh-74px)] px-5 py-10 sm:px-10 lg:px-14 lg:py-14">
      <div className="grid gap-9 border-b border-[#d0aa6230] pb-10 lg:grid-cols-[1fr_390px] lg:items-end">
        <div>
          <h1 className="display-type text-[clamp(3rem,6vw,5.2rem)] font-medium leading-[0.9] text-[#eee7d9]">
            Prompt packs
            <br />
            for real moves.
          </h1>
          <p className="mt-5 max-w-[650px] text-base leading-7 text-[#969087]">
            Curated journeys through the atlas: launch an offer, shape a paid
            community ritual, or audit trust without handing over private context.
          </p>
        </div>
        <aside className="border-t border-[#d0aa6230] pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div className="flex items-center gap-3 text-sm text-[#8baec1]">
            <Boxes size={19} strokeWidth={1.3} /> Pack economics
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[#d0aa6224] py-5">
            <div>
              <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">Packs</dt>
              <dd className="display-type mt-1 text-2xl leading-none text-[#eee7d9]">
                {packs.length}
              </dd>
            </div>
            <div>
              <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">Prompts</dt>
              <dd className="display-type mt-1 text-2xl leading-none text-[#eee7d9]">
                {totalSteps}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-[#8d867c]">
            Free members can inspect every pack. Pro is for the run allowance to
            work through a serious journey end to end.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {showProAction ? (
              <button
                type="button"
                onClick={onViewPlan}
                className="flex h-10 cursor-pointer items-center gap-2 bg-[#d0aa62] px-4 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f]"
              >
                <Sparkles size={16} strokeWidth={1.45} /> View Pro
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
        </aside>
      </div>

      {selectedPack ? (
        <section
          aria-label="Prompt pack revenue loop"
          className="grid gap-6 border-b border-[#d0aa6230] py-8 lg:grid-cols-[310px_1fr] xl:grid-cols-[330px_1fr_270px]"
        >
          <div>
            <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#d0aa62]">
              Revenue loop
            </p>
            <h2 className="display-type mt-3 text-[2.45rem] font-medium leading-[0.96] text-[#eee7d9]">
              Pick the move that can become paid.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#928a80]">
              These packs turn public prompts into a work session with a concrete
              artifact. Free members can inspect the path; Pro gives enough runs
              to finish it.
            </p>
          </div>

          <div className="min-w-0">
            <div className="grid gap-2 sm:grid-cols-3">
              {packs.map((pack) => {
                const selected = selectedPack.id === pack.id;
                return (
                  <button
                    key={pack.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPackId(pack.id)}
                    className={`min-h-[96px] cursor-pointer border px-4 py-3 text-left transition-colors ${
                      selected
                        ? "border-[#d0aa6290] bg-[#d0aa6212]"
                        : "border-[#d0aa6226] hover:border-[#d0aa6264] hover:bg-[#d0aa6208]"
                    }`}
                  >
                    <span className="block truncate text-sm font-medium text-[#eee7d9]">
                      {pack.title}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#8f887e]">
                      {pack.artifact}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 border border-[#d0aa6228] px-4 py-4 sm:px-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-start">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#6b9bb5]">
                    {selectedPack.title}
                  </p>
                  <p className="mt-2 text-base leading-7 text-[#ddd5c8]">
                    {selectedPack.revenueLever}
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-1">
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">
                      Artifact
                    </dt>
                    <dd className="mt-1 text-sm text-[#eee7d9]">{selectedPack.artifact}</dd>
                  </div>
                  <div>
                    <dt className="text-[0.62rem] uppercase tracking-[0.16em] text-[#77736c]">
                      Runs
                    </dt>
                    <dd className="mt-1 text-sm text-[#eee7d9]">{selectedSteps} prompts</dd>
                  </div>
                </dl>
              </div>

              <ol className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {selectedPack.loop.map((step, index) => (
                  <li
                    key={step.label}
                    className="min-h-[118px] border border-[#d0aa6224] px-3 py-3"
                  >
                    <span className="font-mono text-[0.62rem] text-[#d0aa62]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-2 block text-sm font-medium text-[#eee7d9]">
                      {step.label}
                    </span>
                    <span className="mt-2 block text-xs leading-5 text-[#918a82]">
                      {step.detail}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="border-t border-[#d0aa6228] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
            <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#d0aa62]">
              Upgrade moment
            </p>
            <p className="mt-3 text-sm leading-6 text-[#d8cfbf]">
              {selectedPack.upgradeMoment}
            </p>
            <p className="mt-5 text-xs leading-5 text-[#858078]">
              No private prompt context, member identity, or Stripe data is used
              to rank packs. The value is in focused runs, not extraction.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              {showProAction ? (
                <button
                  type="button"
                  onClick={onViewPlan}
                  className="flex h-10 cursor-pointer items-center justify-center gap-2 bg-[#d0aa62] px-4 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f]"
                >
                  <Sparkles size={16} strokeWidth={1.45} /> View Pro
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => selectedPack.prompts[0] && onOpen(selectedPack.prompts[0])}
                className="flex h-10 cursor-pointer items-center justify-center gap-2 border border-[#d0aa6242] px-4 text-sm text-[#ddd5c8] transition-colors hover:border-[#d0aa6280] hover:text-white"
              >
                Start {selectedPack.title} <ArrowRight size={15} strokeWidth={1.4} />
              </button>
            </div>
          </aside>
        </section>
      ) : null}

      <section className="grid gap-5 py-8 xl:grid-cols-3">
        {packs.map((pack) => {
          const firstPrompt = pack.prompts[0];
          return (
            <article
              key={pack.id}
              className="flex min-h-[520px] flex-col border border-[#d0aa6228] bg-[#080c0e8c] px-5 py-5 backdrop-blur-sm transition-colors hover:border-[#d0aa625c] sm:px-6 sm:py-6"
            >
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#6b9bb5]">
                    {pack.subtitle}
                  </p>
                  <h2 className="display-type mt-3 text-[2.4rem] font-medium leading-[0.98] text-[#eee7d9]">
                    {pack.title}
                  </h2>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#d0aa6238] text-[#d0aa62]">
                  <Boxes size={18} strokeWidth={1.35} />
                </span>
              </div>

              <p className="mt-5 text-sm leading-6 text-[#a79f94]">{pack.description}</p>

              <button
                type="button"
                onClick={() => setSelectedPackId(pack.id)}
                className="mt-5 flex min-h-[44px] cursor-pointer items-center justify-between gap-4 border border-[#6b9bb540] px-3 text-left text-sm text-[#cde2ec] transition-colors hover:border-[#8fb8ce] hover:text-white"
              >
                Inspect revenue loop
                <ArrowRight size={15} strokeWidth={1.4} className="shrink-0" />
              </button>

              <div className="mt-6 border-y border-[#d0aa6224] py-5">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#d0aa62]">
                  Outcome
                </p>
                <p className="mt-2 text-sm leading-6 text-[#d8cfbf]">{pack.outcome}</p>
              </div>

              <div className="mt-5 grid gap-2">
                {pack.prompts.map((prompt, index) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => onOpen(prompt)}
                    aria-label={`Open ${pack.title} step ${index + 1}: ${prompt.title}`}
                    className="group flex min-h-[58px] cursor-pointer items-center justify-between gap-4 border border-[#d0aa6224] px-3 py-2 text-left transition-colors hover:border-[#d0aa6264] hover:bg-[#d0aa6208]"
                  >
                    <span className="min-w-0">
                      <span className="font-mono text-[0.62rem] text-[#d0aa62]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="mt-1 block truncate text-sm text-[#ddd5c8]">
                        {prompt.title}
                      </span>
                    </span>
                    <ArrowRight
                      size={15}
                      strokeWidth={1.4}
                      className="shrink-0 text-[#6e675e] transition-colors group-hover:text-[#d0aa62]"
                    />
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6">
                <p className="mb-4 flex items-start gap-2 text-xs leading-5 text-[#8c867d]">
                  <LockKeyhole className="mt-0.5 shrink-0 text-[#6b9bb5]" size={14} strokeWidth={1.35} />
                  {pack.proValue}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row xl:flex-col 2xl:flex-row">
                  <button
                    type="button"
                    onClick={() => firstPrompt && onOpen(firstPrompt)}
                    disabled={!firstPrompt}
                    className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 bg-[#d0aa62] px-4 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f] disabled:cursor-default disabled:opacity-50"
                  >
                    <Check size={16} strokeWidth={1.45} /> Start pack
                  </button>
                  {showProAction ? (
                    <button
                      type="button"
                      onClick={onViewPlan}
                      className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 border border-[#6b9bb570] px-4 text-sm text-[#cde2ec] transition-colors hover:border-[#8fb8ce] hover:text-white"
                    >
                      <Sparkles size={16} strokeWidth={1.35} /> View Pro
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
