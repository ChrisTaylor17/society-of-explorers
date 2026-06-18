"use client";

import { ArrowRight, Eye, LockKeyhole, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { MemberSummary, PromptCategory, PromptRecord } from "@/lib/prompts/types";

interface CreatePromptProps {
  member: MemberSummary | null;
  onAuth(): void;
  onCreated(prompt: PromptRecord): void;
}

export function CreatePrompt({ member, onAuth, onCreated }: CreatePromptProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [promptText, setPromptText] = useState("");
  const [category, setCategory] = useState<PromptCategory>("create");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previewTitle = useMemo(() => title.trim() || "Give this prompt a clear name", [title]);

  async function savePrompt(event: React.FormEvent) {
    event.preventDefault();
    if (!member) {
      onAuth();
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          promptText,
          category,
          visibility,
          tags: [],
        }),
      });
      const payload = (await response.json()) as { prompt?: PromptRecord; error?: string };
      if (!response.ok || !payload.prompt) {
        if (response.status === 401) onAuth();
        throw new Error(payload.error || "The prompt could not be saved.");
      }
      onCreated(payload.prompt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The prompt could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-[calc(100dvh-74px)] lg:grid-cols-[52%_48%]">
      <section className="px-5 py-10 sm:px-10 lg:px-14 lg:py-14">
        <h1 className="display-type text-[clamp(3rem,6vw,5rem)] font-medium leading-[0.9] text-[#eee7d9]">
          Make a prompt
          <br />
          worth sharing.
        </h1>
        <p className="mt-5 max-w-[520px] text-base leading-7 text-[#969087]">
          Begin with the human outcome. You can keep it private, or publish it to the community when it is ready.
        </p>

        <form onSubmit={savePrompt} className="mt-10 max-w-[680px] space-y-6">
          <div>
            <label htmlFor="create-title" className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
              Title
            </label>
            <input
              id="create-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder="What will this help someone do?"
              className="prompt-field h-12 w-full px-4 text-sm"
            />
          </div>

          <div>
            <label htmlFor="create-description" className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
              Description
            </label>
            <input
              id="create-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              minLength={10}
              maxLength={320}
              placeholder="A short, honest promise"
              className="prompt-field h-12 w-full px-4 text-sm"
            />
          </div>

          <div>
            <label htmlFor="create-prompt" className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
              Prompt
            </label>
            <textarea
              id="create-prompt"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              required
              minLength={10}
              maxLength={8000}
              rows={8}
              placeholder="Write the guidance, context, and desired outcome..."
              className="prompt-field display-type min-h-[220px] w-full resize-y p-5 text-xl leading-8"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="create-category" className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
                Category
              </label>
              <select
                id="create-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as PromptCategory)}
                className="prompt-field h-12 w-full px-3 text-sm"
              >
                <option value="create">Create</option>
                <option value="think">Think</option>
                <option value="work">Work</option>
                <option value="reflect">Reflect</option>
              </select>
            </div>
            <div>
              <span className="mb-2 block text-[0.65rem] uppercase tracking-[0.18em] text-[#d0aa62]">
                Visibility
              </span>
              <div className="grid h-12 grid-cols-2 border border-[#d0aa6245] p-1">
                {(["private", "public"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    className={`flex cursor-pointer items-center justify-center gap-2 text-xs capitalize ${
                      visibility === value
                        ? "bg-[#d0aa621a] text-[#e8c77f]"
                        : "text-[#858078] hover:text-white"
                    }`}
                  >
                    {value === "private" ? <LockKeyhole size={14} /> : <Eye size={14} />}
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-[#d78d7d]">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="flex h-13 cursor-pointer items-center gap-3 bg-[#d0aa62] px-7 text-sm font-medium text-[#080c0e] transition-colors hover:bg-[#e8c77f] disabled:cursor-wait disabled:opacity-55"
          >
            {busy ? "Saving..." : member ? "Save prompt" : "Sign in to save"}
            <ArrowRight size={17} strokeWidth={1.5} />
          </button>
        </form>
      </section>

      <aside className="hidden items-center justify-center border-l border-[#d0aa6230] px-12 lg:flex">
        <div className="hairline-frame relative w-full max-w-[470px] border-[#d0aa6280] px-10 py-10">
          <Sparkles className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#080c0e] px-1 text-[#d0aa62]" size={27} strokeWidth={1.1} />
          <p className="text-[0.62rem] uppercase tracking-[0.2em] text-[#6b9bb5]">Live preview</p>
          <h2 className="display-type mt-6 text-[2.8rem] font-medium leading-[0.98] text-[#eee7d9]">
            {previewTitle}
          </h2>
          <div className="my-5 h-px w-10 bg-[#d0aa62]" />
          <p className="text-sm leading-6 text-[#aaa49a]">
            {description || "Describe the useful change this prompt is designed to create."}
          </p>
          <div className="mt-9 border-t border-[#d0aa6228] pt-5 text-xs capitalize text-[#817b72]">
            {category} · {visibility}
          </div>
        </div>
      </aside>
    </main>
  );
}

