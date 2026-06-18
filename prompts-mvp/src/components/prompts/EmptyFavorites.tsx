"use client";

import { ArrowRight, Bookmark } from "lucide-react";

export function EmptyFavorites({ onDiscover }: { onDiscover(): void }) {
  return (
    <main className="flex min-h-[calc(100dvh-74px)] items-center justify-center px-5 py-16">
      <div className="max-w-[520px] text-center">
        <Bookmark className="mx-auto text-[#d0aa62]" size={31} strokeWidth={1.1} />
        <h1 className="display-type mt-7 text-[clamp(2.8rem,6vw,4.5rem)] font-medium leading-[0.95] text-[#eee7d9]">
          Keep the questions that stay with you.
        </h1>
        <p className="mx-auto mt-5 max-w-[430px] text-sm leading-7 text-[#918c84]">
          Save a prompt from discovery and it will appear here, ready to revisit or reshape.
        </p>
        <button
          type="button"
          onClick={onDiscover}
          className="mx-auto mt-8 flex h-12 cursor-pointer items-center gap-3 bg-[#d0aa62] px-6 text-sm font-medium text-[#080c0e] hover:bg-[#e8c77f]"
        >
          Return to discovery <ArrowRight size={17} strokeWidth={1.5} />
        </button>
      </div>
    </main>
  );
}

