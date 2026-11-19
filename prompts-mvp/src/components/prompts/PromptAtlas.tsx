"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import {
  BillingReturnNotice,
  type BillingReturnStatus,
} from "./BillingReturnNotice";
import { BillingPortalErrorNotice } from "./BillingPortalErrorNotice";
import { CommunityView } from "./CommunityView";
import { CreatePrompt } from "./CreatePrompt";
import { DiscoveryCanvas, type GuidedPathStep } from "./DiscoveryCanvas";
import { EmptyFavorites } from "./EmptyFavorites";
import { PromptPacksView } from "./PromptPacksView";
import { PromptWorkspace } from "./PromptWorkspace";
import { SiteHeader } from "./SiteHeader";
import { UpgradeDialog } from "./UpgradeDialog";
import { shuffledPrompts } from "@/lib/prompts/catalog";
import type {
  AtlasSurface,
  DiscoveryCategory,
  DiscoverySort,
  MemberSummary,
  PromptBillingState,
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
    billingState: PromptBillingState;
    canManageBilling: boolean;
    canStartCheckout: boolean;
    currentPeriodEnd: string | null;
    runsUsed: number;
    runsLimit: number | null;
  };
}

interface CommunityScore {
  id: string;
  usage_count: number;
  favorite_count?: number;
  vote_count?: number;
  momentum?: number;
}

const UPGRADE_INTENT = "upgrade";
const LAUNCH_PATH_STEPS: Array<{ label: string; slug: string }> = [
  { label: "Offer", slug: "find-the-smallest-honest-offer" },
  { label: "Price", slug: "price-this-offer-without-apology" },
  { label: "Customers", slug: "find-my-first-ten-customers" },
  { label: "Trust page", slug: "write-a-landing-page-that-earns-trust" },
];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function promptKeyFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const queryKey = url.searchParams.get("prompt")?.trim();
  if (queryKey) return queryKey;

  const pathKey = url.pathname.match(/^\/p\/([^/]+)$/)?.[1];
  return pathKey ? safeDecode(pathKey).trim() || null : null;
}

function findPromptByKey(prompts: PromptRecord[], key: string | null): PromptRecord | null {
  if (!key) return null;
  const normalized = safeDecode(key).toLowerCase();
  return prompts.find((prompt) =>
    [prompt.slug, prompt.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase() === normalized),
  ) ?? null;
}

function shareUrlForPrompt(prompt: PromptRecord): string {
  const key = prompt.slug || prompt.id;
  return new URL(`/p/${encodeURIComponent(key)}`, window.location.origin).toString();
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const node = document.createElement("textarea");
    node.value = value;
    node.setAttribute("readonly", "");
    node.style.position = "fixed";
    node.style.left = "-9999px";
    document.body.appendChild(node);
    node.select();
    document.execCommand("copy");
    node.remove();
  }
}

export function PromptAtlas({ initialPrompts }: PromptAtlasProps) {
  const [surface, setSurface] = useState<AtlasSurface>("discover");
  const [prompts, setPrompts] = useState(initialPrompts);
  const [communityPrompts, setCommunityPrompts] = useState<PromptRecord[] | null>(null);
  const [selectedId, setSelectedId] = useState(initialPrompts[0].id);
  const [category, setCategory] = useState<DiscoveryCategory>("for-you");
  const [sort, setSort] = useState<DiscoverySort>("random");
  const [shuffleSeed, setShuffleSeed] = useState(17);
  const [customize, setCustomize] = useState(false);
  const [member, setMember] = useState<MemberSummary | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeIntentPending, setUpgradeIntentPending] = useState(
    () =>
      typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.get("intent") === UPGRADE_INTENT,
  );
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingReturn, setBillingReturn] = useState<BillingReturnStatus | null>(null);
  const [checkingBilling, setCheckingBilling] = useState(false);
  const [billingCheckFailed, setBillingCheckFailed] = useState(false);
  const [billingPortalBusy, setBillingPortalBusy] = useState(false);
  const [billingPortalError, setBillingPortalError] = useState(false);
  const [sharedPromptId, setSharedPromptId] = useState<string | null>(null);

  useEffect(() => {
    const requestedPrompt = findPromptByKey(prompts, promptKeyFromLocation());
    if (!requestedPrompt) return;

    let active = true;
    window.queueMicrotask(() => {
      if (active) setSelectedId(requestedPrompt.id);
    });
    return () => {
      active = false;
    };
  }, [prompts]);

  const consumeUpgradeIntent = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("intent") !== UPGRADE_INTENT) return;

    url.searchParams.delete("intent");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setUpgradeIntentPending(false);
    setUpgradeOpen(true);
  }, []);

  const refreshSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not refresh the member session.");
    const payload = (await response.json()) as SessionPayload;
    setMember(
      payload.member
        ? {
            ...payload.member,
            tier: payload.entitlement.plan,
            billingState: payload.entitlement.billingState,
            canManageBilling: payload.entitlement.canManageBilling,
            canStartCheckout: payload.entitlement.canStartCheckout,
            currentPeriodEnd: payload.entitlement.currentPeriodEnd,
            runsUsed: payload.entitlement.runsUsed,
            runsLimit: payload.entitlement.runsLimit,
          }
        : null,
    );
    if (payload.member) consumeUpgradeIntent();
  }, [consumeUpgradeIntent]);

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
                billingState: payload.entitlement.billingState,
                canManageBilling: payload.entitlement.canManageBilling,
                canStartCheckout: payload.entitlement.canStartCheckout,
                currentPeriodEnd: payload.entitlement.currentPeriodEnd,
                runsUsed: payload.entitlement.runsUsed,
                runsLimit: payload.entitlement.runsLimit,
              }
            : null,
        );
        if (payload.member) consumeUpgradeIntent();
      })
      .catch(() => undefined);
    const promptKey = promptKeyFromLocation();
    const promptParams = new URLSearchParams({ sort: "trending" });
    if (promptKey) promptParams.set("prompt", promptKey);
    fetch(`/api/prompts?${promptParams.toString()}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { prompts?: PromptRecord[] } | null) => {
        if (!payload?.prompts?.length) return;
        const requestedPrompt = findPromptByKey(payload.prompts, promptKeyFromLocation());
        setPrompts(payload.prompts);
        setSelectedId((current) =>
          requestedPrompt?.id ||
          (payload.prompts?.some((prompt) => prompt.id === current)
            ? current
            : payload.prompts![0].id),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [consumeUpgradeIntent]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("billing");
    if (status !== "success" && status !== "cancelled") return;

    url.searchParams.delete("billing");
    const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", cleanUrl);

    let active = true;
    window.queueMicrotask(() => {
      if (active) setBillingReturn(status);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (surface !== "community") return;

    let active = true;
    fetch("/api/community", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { prompts?: CommunityScore[] } | null) => {
        if (!active || !payload?.prompts?.length) return;
        const promptsById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
        const ranked = payload.prompts.flatMap((score) => {
          const prompt = promptsById.get(score.id);
          return prompt
            ? [{
                ...prompt,
                usage_count: Number(score.usage_count) || 0,
                favorite_count: score.favorite_count === undefined
                  ? undefined
                  : Number(score.favorite_count) || 0,
                vote_count: score.vote_count === undefined
                  ? undefined
                  : Number(score.vote_count) || 0,
                momentum: score.momentum === undefined
                  ? undefined
                  : Number(score.momentum) || 0,
              }]
            : [];
        });
        if (ranked.length) setCommunityPrompts(ranked);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [prompts, surface]);

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

  const launchPath = useMemo<GuidedPathStep[]>(() => {
    const promptsBySlug = new Map(prompts.map((prompt) => [prompt.slug, prompt]));
    return LAUNCH_PATH_STEPS.flatMap((step) => {
      const prompt = promptsBySlug.get(step.slug);
      return prompt ? [{ label: step.label, prompt }] : [];
    });
  }, [prompts]);

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

  async function sharePrompt(prompt: PromptRecord) {
    const shareUrl = shareUrlForPrompt(prompt);
    const shareData = {
      title: `${prompt.title} | Prompt Atlas`,
      text: prompt.description,
      url: shareUrl,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await copyText(shareUrl);
      }
      setSharedPromptId(prompt.id);
      window.setTimeout(() => setSharedPromptId((current) => current === prompt.id ? null : current), 1600);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "AbortError") {
        await copyText(shareUrl);
        setSharedPromptId(prompt.id);
        window.setTimeout(() => setSharedPromptId((current) => current === prompt.id ? null : current), 1600);
      }
    }
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

  function applySignalState(promptId: string, signaled: boolean) {
    const signalDelta = signaled ? 1 : -1;
    const momentumDelta = signaled ? 6 : -6;
    const updatePrompt = (prompt: PromptRecord): PromptRecord =>
      prompt.id === promptId
        ? {
            ...prompt,
            signaled,
            vote_count:
              typeof prompt.vote_count === "number"
                ? Math.max(prompt.vote_count + signalDelta, 0)
                : prompt.vote_count,
            momentum:
              typeof prompt.momentum === "number"
                ? Math.max(prompt.momentum + momentumDelta, 0)
                : prompt.momentum,
          }
        : prompt;

    setPrompts((current) => current.map(updatePrompt));
    setCommunityPrompts((current) => current?.map(updatePrompt) ?? current);
  }

  async function toggleSignal() {
    if (!member) {
      setAuthOpen(true);
      return;
    }
    const nextValue = !selected.signaled;
    applySignalState(selected.id, nextValue);

    const response = await fetch(`/api/prompts/${selected.id}/signal`, {
      method: nextValue ? "POST" : "DELETE",
    });
    if (!response.ok) {
      applySignalState(selected.id, !nextValue);
      if (response.status === 401) setAuthOpen(true);
    }
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    setMember(null);
    setSurface("discover");
  }

  async function checkBillingAccess() {
    setCheckingBilling(true);
    setBillingCheckFailed(false);
    try {
      await refreshSession();
    } catch {
      setBillingCheckFailed(true);
    } finally {
      setCheckingBilling(false);
    }
  }

  async function managePlan() {
    if (billingPortalBusy) return;
    setBillingPortalBusy(true);
    setBillingPortalError(false);
    setBillingReturn(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { url?: string }
        | null;
      if (!response.ok || !payload?.url) throw new Error("Portal unavailable.");

      const destination = new URL(payload.url);
      if (destination.protocol !== "https:" || destination.hostname !== "billing.stripe.com") {
        throw new Error("Unexpected portal destination.");
      }
      window.location.assign(destination.toString());
    } catch {
      setBillingPortalError(true);
    } finally {
      setBillingPortalBusy(false);
    }
  }

  function upgrade() {
    setUpgradeOpen(true);
  }

  function requireAuthForUpgrade() {
    const url = new URL(window.location.href);
    url.searchParams.set("intent", UPGRADE_INTENT);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    setUpgradeIntentPending(true);
    setUpgradeOpen(false);
    setAuthOpen(true);
  }

  function closeAuth() {
    const url = new URL(window.location.href);
    if (url.searchParams.get("intent") === UPGRADE_INTENT) {
      url.searchParams.delete("intent");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    setUpgradeIntentPending(false);
    setAuthOpen(false);
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
        onViewPlan={upgrade}
        onManagePlan={managePlan}
        billingPortalBusy={billingPortalBusy}
        onSignIn={() => setAuthOpen(true)}
        onSignOut={signOut}
      />

      {billingReturn ? (
        <BillingReturnNotice
          status={billingReturn}
          confirmed={member?.tier === "explorer_pro"}
          checking={checkingBilling}
          checkFailed={billingCheckFailed}
          onCheck={checkBillingAccess}
          onDismiss={() => setBillingReturn(null)}
          onViewPlan={() => {
            setBillingReturn(null);
            setUpgradeOpen(true);
          }}
        />
      ) : null}

      {billingPortalError ? (
        <BillingPortalErrorNotice
          busy={billingPortalBusy}
          onDismiss={() => setBillingPortalError(false)}
          onRetry={managePlan}
        />
      ) : null}

      {surface === "discover" && selected ? (
        <DiscoveryCanvas
          prompts={visiblePrompts.length ? visiblePrompts : prompts}
          selected={selected}
          launchPath={launchPath}
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
          onSignal={toggleSignal}
          onShare={() => void sharePrompt(selected)}
          shareCopied={sharedPromptId === selected.id}
          onCategory={changeCategory}
          onOpenPacks={() => navigate("packs")}
          onViewPlan={upgrade}
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
          launchPath={launchPath}
          member={member}
          customize={customize}
          onSelectPrompt={selectPrompt}
          onBack={() => setSurface("discover")}
          onAuth={() => setAuthOpen(true)}
          onUpgrade={upgrade}
          onFavorite={toggleFavorite}
          onSignal={toggleSignal}
          onShare={() => sharePrompt(selected)}
          shareCopied={sharedPromptId === selected.id}
          onUsage={updateUsage}
        />
      ) : null}

      {surface === "favorites" ? (
        visiblePrompts.length && selected ? (
          <DiscoveryCanvas
            prompts={visiblePrompts}
            selected={selected}
            launchPath={launchPath}
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
            onSignal={toggleSignal}
            onShare={() => void sharePrompt(selected)}
            shareCopied={sharedPromptId === selected.id}
            onCategory={changeCategory}
            onOpenPacks={() => navigate("packs")}
            onViewPlan={upgrade}
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

      {surface === "packs" ? (
        <PromptPacksView
          prompts={prompts}
          member={member}
          onOpen={(prompt) => {
            setSelectedId(prompt.id);
            setCustomize(true);
            setSurface("workspace");
          }}
          onDiscover={() => navigate("discover")}
          onViewPlan={upgrade}
        />
      ) : null}

      {surface === "community" ? (
        <CommunityView
          prompts={communityPrompts || prompts}
          member={member}
          onOpen={(prompt) => {
            setSelectedId(prompt.id);
            setSurface("workspace");
          }}
          onCreate={() => navigate("create")}
          onDiscover={() => navigate("discover")}
          onViewPlan={upgrade}
        />
      ) : null}

      <AuthDialog
        open={authOpen}
        returnTo={upgradeIntentPending ? "/?intent=upgrade" : "/"}
        onClose={closeAuth}
        onAuthenticated={refreshSession}
      />
      <UpgradeDialog
        open={upgradeOpen}
        canCheckout={Boolean(member)}
        isRestarting={Boolean(
          member?.tier === "free" &&
            member.canManageBilling &&
            member.canStartCheckout,
        )}
        mustManageExistingPlan={Boolean(
          member?.canManageBilling && !member.canStartCheckout,
        )}
        onClose={() => setUpgradeOpen(false)}
        onManagePlan={() => {
          setUpgradeOpen(false);
          void managePlan();
        }}
        onRequireAuth={requireAuthForUpgrade}
      />
    </div>
  );
}
