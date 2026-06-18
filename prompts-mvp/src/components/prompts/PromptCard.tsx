"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Bookmark, SlidersHorizontal, Sparkles } from "lucide-react";
import type { PromptRecord } from "@/lib/prompts/types";

interface DriftPosition {
  left: string;
  top: string;
  width: string;
  opacity: number;
  delay: number;
  distance: number;
}

interface DriftingPromptProps {
  prompt: PromptRecord;
  position: DriftPosition;
  onSelect(prompt: PromptRecord): void;
}

export function DriftingPrompt({ prompt, position, onSelect }: DriftingPromptProps) {
  const reduceMotion = useReducedMotion();
  const isBlue = prompt.category === "create";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(prompt)}
      className="absolute cursor-pointer text-left"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
        color: isBlue ? "#6b9bb5" : "#c7bfb1",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={
        reduceMotion
          ? { opacity: position.opacity, y: 0 }
          : {
              opacity: [position.opacity * 0.45, position.opacity, position.opacity * 0.58],
              x: [0, position.distance, 0],
              y: [0, -position.distance * 0.42, 0],
            }
      }
      transition={
        reduceMotion
          ? { duration: 0.2 }
          : {
              opacity: { duration: 8 + position.delay, repeat: Infinity, ease: "easeInOut" },
              x: { duration: 12 + position.delay, repeat: Infinity, ease: "easeInOut" },
              y: { duration: 10 + position.delay, repeat: Infinity, ease: "easeInOut" },
            }
      }
      whileHover={{ opacity: 1, scale: 1.018 }}
    >
      <span className="display-type text-[clamp(1.05rem,1.55vw,1.42rem)] leading-[1.28] transition-colors">
        {prompt.title}
      </span>
      <span className="mt-2 block h-px w-0 bg-current transition-all duration-300 group-hover:w-full" />
    </motion.button>
  );
}

interface FocusedPromptProps {
  prompt: PromptRecord;
  onRun(): void;
  onCustomize(): void;
  onFavorite(): void;
}

export function FocusedPrompt({ prompt, onRun, onCustomize, onFavorite }: FocusedPromptProps) {
  return (
    <motion.article
      key={prompt.id}
      className="hairline-frame relative min-h-[365px] w-full max-w-[470px] border-[#d0aa62d0] px-7 py-7 sm:min-h-[378px] sm:px-11 sm:pb-8 sm:pt-[52px]"
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
    >
      <Sparkles
        className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#080c0e] px-1 text-[#d0aa62]"
        size={28}
        strokeWidth={1.15}
      />
      <button
        type="button"
        aria-label={prompt.favorited ? "Remove from favorites" : "Save to favorites"}
        onClick={onFavorite}
        className={`absolute right-4 top-4 cursor-pointer transition-colors ${
          prompt.favorited ? "text-[#e8c77f]" : "text-[#6f6a61] hover:text-[#d0aa62]"
        }`}
      >
        <Bookmark size={18} strokeWidth={1.35} fill={prompt.favorited ? "currentColor" : "none"} />
      </button>

      <h2 className="display-type max-w-[370px] text-[clamp(2.15rem,4.2vw,3.2rem)] font-medium leading-[1.18] text-[#eee7d9]">
        {prompt.title}
      </h2>
      <div className="my-5 h-px w-10 bg-[#d0aa62]" />
      <p className="max-w-[370px] text-[0.95rem] leading-6 text-[#d5cec2] sm:text-[1.05rem]">
        {prompt.description}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRun}
          className="flex h-13 flex-1 cursor-pointer items-center justify-center gap-3 bg-[#d0aa62] px-5 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f]"
        >
          Run this prompt <ArrowRight size={18} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          onClick={onCustomize}
          className="flex h-13 cursor-pointer items-center justify-center gap-3 border border-[#d0aa62b0] px-5 text-sm text-[#eee7d9] transition-colors hover:bg-[#d0aa6212]"
        >
          Customize <SlidersHorizontal size={17} strokeWidth={1.45} />
        </button>
      </div>
    </motion.article>
  );
}
