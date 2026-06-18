"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Bookmark,
  Check,
  Copy,
  CornerUpLeft,
  LockKeyhole,
  Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MemberSummary, PromptRecord, StreamMeta } from "@/lib/prompts/types";

interface PromptWorkspaceProps {
  prompt: PromptRecord;
  member: MemberSummary | null;
  customize: boolean;
  onBack(): void;
  onAuth(): void;
  onUpgrade(): void;
  onFavorite(): Promise<void> | void;
  onUsage(meta: StreamMeta): void;
}

interface StreamEvent {
  name: string;
  payload: Record<string, unknown>;
}

function parseEvent(block: string): StreamEvent | null {
  let name = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return null;
  try {
    return { name, payload: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}

export function PromptWorkspace({
  prompt,
  member,
  customize,
  onBack,
  onAuth,
  onUpgrade,
  onFavorite,
  onUsage,
}: PromptWorkspaceProps) {
  const [promptText, setPromptText] = useState(prompt.prompt_text);
  const [context, setContext] = useState("");
  const [response, setResponse] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (customize) promptRef.current?.focus();
  }, [customize]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function beginExploration() {
    if (!member) {
      onAuth();
      return;
    }
    if (!promptText.trim() || running) return;

    setRunning(true);
    setResponse("");
    setError("");
    abortRef.current = new AbortController();

    try {
      const result = await fetch("/api/prompts/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: prompt.created_by || prompt.id.startsWith("10000000") ? prompt.id : null,
          promptText,
          context,
        }),
        signal: abortRef.current.signal,
      });

      if (!result.ok || !result.body) {
        const payload = (await result.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        if (result.status === 401) onAuth();
        if (payload?.code === "quota_exceeded") onUpgrade();
        throw new Error(payload?.error || "The exploration could not begin.");
      }

      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const streamEvent = parseEvent(block);
          if (!streamEvent) continue;
          if (streamEvent.name === "delta" && typeof streamEvent.payload.text === "string") {
            setResponse((current) => current + streamEvent.payload.text);
          }
          if (streamEvent.name === "meta") onUsage(streamEvent.payload as unknown as StreamMeta);
          if (streamEvent.name === "error") {
            throw new Error(
              typeof streamEvent.payload.error === "string"
                ? streamEvent.payload.error
                : "The exploration was interrupted.",
            );
          }
        }
        if (done) break;
      }
    } catch (runError) {
      if (runError instanceof Error && runError.name !== "AbortError") {
        setError(runError.message);
      }
    } finally {
      setRunning(false);
    }
  }

  async function copyResponse() {
    if (!response) return;
    await navigator.clipboard.writeText(response);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  const remaining = member?.runsLimit === null
    ? "Unlimited explorations"
    : `${Math.max((member?.runsLimit ?? 5) - (member?.runsUsed ?? 0), 0)} free runs remaining`;

  return (
    <main className="relative min-h-[calc(100dvh-74px)] pb-[99px]">
      <div className="grid min-h-[calc(100dvh-173px)] lg:grid-cols-[47.5%_52.5%]">
        <motion.section
          className="border-b border-[#d0aa6230] px-5 py-8 sm:px-10 lg:border-b-0 lg:border-r lg:px-12 lg:py-16"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <button
            type="button"
            onClick={onBack}
            className="flex cursor-pointer items-center gap-2 text-sm text-[#d0aa62] transition-colors hover:text-[#e8c77f]"
          >
            <ArrowLeft size={17} strokeWidth={1.4} /> Back to discovery
          </button>

          <div className="mt-8 flex items-start gap-4">
            <h1 className="display-type max-w-[640px] text-[clamp(2.35rem,3vw,2.9rem)] font-medium leading-[0.96] text-[#eee7d9]">
              {prompt.title}
            </h1>
            <button
              type="button"
              onClick={onFavorite}
              aria-label="Save prompt"
              className={`mt-2 cursor-pointer ${prompt.favorited ? "text-[#e8c77f]" : "text-[#766f63] hover:text-[#d0aa62]"}`}
            >
              <Bookmark size={21} strokeWidth={1.3} fill={prompt.favorited ? "currentColor" : "none"} />
            </button>
          </div>

          <label htmlFor="prompt-text" className="mb-4 mt-8 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
            Prompt
          </label>
          <textarea
            ref={promptRef}
            id="prompt-text"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            rows={8}
            className="prompt-field display-type min-h-[245px] w-full resize-y p-5 text-xl leading-7 sm:min-h-[312px] sm:text-[1.35rem] sm:leading-8"
          />

          <label htmlFor="prompt-context" className="mb-4 mt-7 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
            Make it yours
          </label>
          <textarea
            id="prompt-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            rows={1}
            placeholder="What are you deciding?"
            className="prompt-field h-14 min-h-14 w-full resize-none px-4 py-4 text-sm leading-6"
          />
          <p className="mt-3 flex items-center gap-2 text-xs text-[#858078]">
            <LockKeyhole size={14} strokeWidth={1.35} /> Your context is used for this run only.
          </p>

          {error ? <p className="mt-4 text-sm text-[#d78d7d]">{error}</p> : null}

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={beginExploration}
              disabled={running || !promptText.trim()}
              className="flex h-13 cursor-pointer items-center justify-center gap-3 bg-[#d0aa62] px-7 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f] disabled:cursor-wait disabled:opacity-55"
            >
              <Play size={17} strokeWidth={1.45} />
              {running ? "Exploring..." : "Begin exploration"}
            </button>
            <button
              type="button"
              onClick={onFavorite}
              className="flex h-13 cursor-pointer items-center justify-center gap-3 border border-[#d0aa6270] px-7 text-sm text-[#e2d9ca] transition-colors hover:bg-[#d0aa6210]"
            >
              <Bookmark size={17} strokeWidth={1.4} /> Save prompt
            </button>
          </div>
        </motion.section>

        <motion.section
          className="flex min-h-[520px] flex-col px-5 py-8 sm:px-10 lg:px-12 lg:py-16"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h2 className="text-[0.67rem] uppercase tracking-[0.2em] text-[#d0aa62]">A clearer path</h2>
          <div className="mb-7 mt-4 h-px w-12 bg-[#d0aa62]" />

          <div className="display-type flex-1 text-[1.18rem] leading-[1.58] text-[#e8dfd0] sm:text-[1.35rem]">
            {response ? (
              <div className={`whitespace-pre-wrap ${running ? "stream-caret" : ""}`}>{response}</div>
            ) : running ? (
              <p className="stream-caret text-[#928d84]">Considering the shape of your question</p>
            ) : (
              <div className="max-w-[560px] pt-8 text-[#77736d]">
                <p>Your exploration will unfold here, sentence by sentence.</p>
                <p className="mt-5 text-base leading-7">
                  Add only the context you choose. Prompt Atlas records aggregate usage for your plan, not the private text you bring to the conversation.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-5 text-sm text-[#d0aa62]">
            <button
              type="button"
              onClick={copyResponse}
              disabled={!response}
              className="flex cursor-pointer items-center gap-2 disabled:cursor-default disabled:opacity-35"
            >
              {copied ? <Check size={17} strokeWidth={1.4} /> : <Copy size={17} strokeWidth={1.4} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <span className="h-5 w-px bg-[#d0aa6240]" />
            <button
              type="button"
              disabled={!response || running}
              onClick={() => document.getElementById("prompt-context")?.focus()}
              className="flex cursor-pointer items-center gap-2 disabled:cursor-default disabled:opacity-35"
            >
              <CornerUpLeft size={17} strokeWidth={1.4} /> Continue
            </button>
            <span className="h-5 w-px bg-[#d0aa6240]" />
            <button
              type="button"
              onClick={onFavorite}
              disabled={!response}
              className="flex cursor-pointer items-center gap-2 disabled:cursor-default disabled:opacity-35"
              title="Save the prompt; private result storage will remain opt-in."
            >
              <Bookmark size={17} strokeWidth={1.4} /> Save insight
            </button>
          </div>
        </motion.section>
      </div>

      <section className="atlas-bottom-safe fixed inset-x-0 bottom-0 z-30 flex min-h-[99px] items-center border-t border-[#d0aa6230] bg-[#080c0ef5] px-5 backdrop-blur sm:px-10 lg:px-12">
        <div className="text-sm text-[#d7cec0]">{remaining}</div>
        <div className="mx-8 hidden h-7 w-px bg-[#d0aa6238] sm:block" />
        <p className="hidden text-sm text-[#8e8981] md:block">
          Free access includes five explorations each month. Upgrade for unlimited use.
        </p>
        {member?.runsLimit !== null ? (
          <button
            type="button"
            onClick={onUpgrade}
            className="ml-auto flex h-11 cursor-pointer items-center gap-2 bg-[#173143] px-5 text-sm text-[#dbe9ef] transition-colors hover:bg-[#22445a]"
          >
            <LockKeyhole size={16} strokeWidth={1.35} /> Unlock unlimited
          </button>
        ) : null}
      </section>
    </main>
  );
}
