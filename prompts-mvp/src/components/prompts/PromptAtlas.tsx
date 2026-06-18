"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { CommunityView } from "./CommunityView";
import { CreatePrompt } from "./CreatePrompt";
import { DiscoveryCanvas } from "./DiscoveryCanvas";
import { EmptyFavorites } from "./EmptyFavorites";
import { PromptWorkspace } from "./PromptWorkspace";
import { SiteHeader } from "./SiteHeader";
import { UpgradeDialog } from "./UpgradeDialog";
import { shuffledPrompts } from "@/lib/prompts/catalog";
import type {
  AtlasSurface,
  DiscoveryCategory,
  DiscoverySort,
  MemberSummary,
  PromptRecord,
  StreamMeta,
} from "@/lib/prompts/types";

interface PromptAtlasProps {
  initialPrompts: PromptRecord[];
}

interface SessionPayload {
  member: { id: string; displayName: string; email: string | null } | null;
  entitlement: {
    plan: "free" | "explorer_pro";
    runsUsed: number;
    runsLimit: number | null;
  };
}

export function PromptAtlas({ initialPrompts }: PromptAtlasProps) {
  const [surface, setSurface] = useState<AtlasSurface>("discover");
  const [prompts, setPrompts] = useState(initialPrompts);
  const [selectedId, setSelectedId] = useState(initialPrompts[0].id);
  const [category, setCategory] = useState<DiscoveryCategory>("for-you");
  const [sort, setSort] = useState<DiscoverySort>("random");
  const [shuffleSeed, setShuffleSeed] = useState(17);
  const [customize, setCustomize] = useState(false);
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return;
    const payload = (await response.json()) as SessionPayload;
    setMember(
      payload.member
        ? {
            ...payload.member,
            tier: payload.entitlement.plan,
            runsUsed: payload.entitlement.runsUsed,
            runsLimit: payload.entitlement.runsLimit,
          }
        : null,
    );
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: SessionPayload | null) => {
        if (!active || !payload) return;
        setMember(
          payload.member
            ? {
                ...payload.member,
                tier: payload.entitlement.plan,
                runsUsed: payload.entitlement.runsUsed,
                runsLimit: payload.entitlement.runsLimit,
              }
            : null,
        );
      })
      .catch(() => undefined);
    fetch("/api/prompts?sort=trending")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { prompts?: PromptRecord[] } | null) => {
        if (!payload?.prompts?.length) return;
        setPrompts(payload.prompts);
        setSelectedId((current) =>
          payload.prompts?.some((prompt) => prompt.id === current)
            ? current
            : payload.prompts![0].id,
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const visiblePrompts = useMemo(() => {
    let result = category === "for-you"
      ? prompts
      : prompts.filter((prompt) => prompt.category === category);

    if (surface === "favorites") result = result.filter((prompt) => prompt.favorited);

    if (sort === "trending") {
      return [...result].sort((left, right) => right.usage_count - left.usage_count);
    }
    if (sort === "new") {
      return [...result].sort((left, right) =>
        (right.created_at || "").localeCompare(left.created_at || ""),
      );
    }
    return shuffledPrompts(result, shuffleSeed);
  }, [category, prompts, shuffleSeed, sort, surface]);

  const selected =
    visiblePrompts.find((prompt) => prompt.id === selectedId) ||
    prompts.find((prompt) => prompt.id === selectedId) ||
    visiblePrompts[0] ||
    prompts[0];

  function navigate(nextSurface: AtlasSurface) {
    if (nextSurface === "favorites" && !member) setAuthOpen(true);
    setSurface(nextSurface);
    setCustomize(false);
  }

  function selectPrompt(prompt: PromptRecord) {
    setSelectedId(prompt.id);
  }

  function changeCategory(nextCategory: DiscoveryCategory) {
    setCategory(nextCategory);
    setSort("random");
    setShuffleSeed((current) => current + 1);
    const next = prompts.find(
      (prompt) => nextCategory === "for-you" || prompt.category === nextCategory,
    );
    if (next) setSelectedId(next.id);
  }

  async function toggleFavorite() {
    if (!member) {
      setAuthOpen(true);
      return;
    }
    const nextValue = !selected.favorited;
    setPrompts((current) =>
      current.map((prompt) =>
        prompt.id === selected.id ? { ...prompt, favorited: nextValue } : prompt,
      ),
    );

    const response = await fetch(`/api/prompts/${selected.id}/favorite`, {
      method: nextValue ? "POST" : "DELETE",
    });
    if (!response.ok) {
      setPrompts((current) =>
        current.map((prompt) =>
          prompt.id === selected.id ? { ...prompt, favorited: !nextValue } : prompt,
        ),
      );
      if (response.status === 401) setAuthOpen(true);
    }
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    setMember(null);
    setSurface("discover");
  }

  function upgrade() {
    if (!member) {
      setAuthOpen(true);
      return;
    }
    setUpgradeOpen(true);
  }

  function updateUsage(meta: StreamMeta) {
    setMember((current) =>
      current
        ? {
            ...current,
            tier: meta.plan,
            runsUsed: meta.runsUsed,
            runsLimit: meta.runsLimit,
          }
        : current,
    );
  }

  function created(prompt: PromptRecord) {
    setPrompts((current) => [{ ...prompt, favorited: true }, ...current]);
    setSelectedId(prompt.id);
    setSurface("workspace");
    setCustomize(true);
  }

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#080c0e] text-[#eee7d9]">
      <SiteHeader
        surface={surface}
        member={member}
        onNavigate={navigate}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={signOut}
      />

      {surface === "discover" && selected ? (
        <DiscoveryCanvas
          prompts={visiblePrompts.length ? visiblePrompts : prompts}
          selected={selected}
          category={category}
          sort={sort}
          member={member}
          onSelect={selectPrompt}
          onRun={() => {
            setCustomize(false);
            setSurface("workspace");
          }}
          onCustomize={() => {
            setCustomize(true);
            setSurface("workspace");
          }}
          onFavorite={toggleFavorite}
          onCategory={changeCategory}
          onShuffle={() => {
            setSort("random");
            setShuffleSeed((current) => current + 1);
            const candidates = visiblePrompts.filter((prompt) => prompt.id !== selected.id);
            if (candidates[0]) setSelectedId(candidates[0].id);
          }}
          onSort={setSort}
        />
      ) : null}

      {surface === "workspace" && selected ? (
        <PromptWorkspace
          key={selected.id}
          prompt={selected}
          member={member}
          customize={customize}
          onBack={() => setSurface("discover")}
          onAuth={() => setAuthOpen(true)}
          onUpgrade={upgrade}
          onFavorite={toggleFavorite}
          onUsage={updateUsage}
        />
      ) : null}

      {surface === "favorites" ? (
        visiblePrompts.length && selected ? (
          <DiscoveryCanvas
            prompts={visiblePrompts}
            selected={selected}
            category={category}
            sort={sort}
            member={member}
            onSelect={selectPrompt}
            onRun={() => setSurface("workspace")}
            onCustomize={() => {
              setCustomize(true);
              setSurface("workspace");
            }}
            onFavorite={toggleFavorite}
            onCategory={changeCategory}
            onShuffle={() => setShuffleSeed((current) => current + 1)}
            onSort={setSort}
          />
        ) : (
          <EmptyFavorites onDiscover={() => setSurface("discover")} />
        )
      ) : null}

      {surface === "create" ? (
        <CreatePrompt member={member} onAuth={() => setAuthOpen(true)} onCreated={created} />
      ) : null}

      {surface === "community" ? (
        <CommunityView
          prompts={prompts}
          onOpen={(prompt) => {
            setSelectedId(prompt.id);
            setSurface("workspace");
          }}
        />
      ) : null}

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={refreshSession}
      />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
