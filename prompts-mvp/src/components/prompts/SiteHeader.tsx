"use client";

import { LogOut, Menu, UserRound, X } from "lucide-react";
import { useState } from "react";
import type { AtlasSurface, MemberSummary } from "@/lib/prompts/types";

interface SiteHeaderProps {
  surface: AtlasSurface;
  member: MemberSummary | null;
  onNavigate(surface: AtlasSurface): void;
  onSignIn(): void;
  onSignOut(): void;
}

const navigation: Array<{ label: string; surface: AtlasSurface }> = [
  { label: "Discover", surface: "discover" },
  { label: "Favorites", surface: "favorites" },
  { label: "Create", surface: "create" },
  { label: "Community", surface: "community" },
];

export function SiteHeader({
  surface,
  member,
  onNavigate,
  onSignIn,
  onSignOut,
}: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(surface: AtlasSurface) {
    onNavigate(surface);
    setMenuOpen(false);
  }

  return (
    <header className="relative z-30 flex h-[74px] items-center border-b border-[#d0aa6230] px-5 sm:px-8 lg:px-12">
      <button
        type="button"
        onClick={() => navigate("discover")}
        className="cursor-pointer text-left font-medium uppercase tracking-[0.28em] text-[#e8c77f]"
      >
        <span className="text-[0.58rem] tracking-[0.19em] sm:text-[0.76rem] sm:tracking-[0.28em]">
          Society of Explorers
        </span>
      </button>

      <nav aria-label="Prompt Atlas" className="absolute left-1/2 hidden h-full -translate-x-1/2 items-center gap-8 md:flex">
        {navigation.map((item) => {
          const active = surface === item.surface || (surface === "workspace" && item.surface === "discover");
          return (
            <button
              key={item.surface}
              type="button"
              onClick={() => navigate(item.surface)}
              className={`relative h-full cursor-pointer px-1 text-sm transition-colors ${
                active ? "text-[#e8c77f]" : "text-[#c3bdb2] hover:text-white"
              }`}
            >
              {item.label}
              {active ? <span className="absolute inset-x-0 bottom-0 h-px bg-[#d0aa62]" /> : null}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
          className="cursor-pointer text-[#9e988e] transition-colors hover:text-white md:hidden"
        >
          {menuOpen ? <X size={19} strokeWidth={1.4} /> : <Menu size={19} strokeWidth={1.4} />}
        </button>
        {member ? (
          <>
            <button
              type="button"
              onClick={() => onNavigate("favorites")}
              className="hidden cursor-pointer text-xs text-[#bdb5a8] transition-colors hover:text-white sm:block"
              title={`${member.runsLimit === null ? "Unlimited" : Math.max(member.runsLimit - member.runsUsed, 0)} runs remaining`}
            >
              {member.displayName}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="cursor-pointer text-[#8c877e] transition-colors hover:text-[#eee7d9]"
            >
              <LogOut size={18} strokeWidth={1.4} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            className="flex cursor-pointer items-center gap-2 text-sm text-[#ddd5c8] transition-colors hover:text-white"
          >
            <UserRound size={18} strokeWidth={1.35} />
            <span>Sign in</span>
          </button>
        )}
      </div>

      {menuOpen ? (
        <nav
          aria-label="Mobile Prompt Atlas"
          className="hairline-frame absolute right-4 top-[62px] z-50 w-[210px] px-2 py-2 md:hidden"
        >
          {navigation.map((item) => (
            <button
              key={item.surface}
              type="button"
              onClick={() => navigate(item.surface)}
              className={`flex h-11 w-full cursor-pointer items-center border-b border-[#d0aa621c] px-3 text-left text-sm last:border-0 ${
                surface === item.surface ? "text-[#e8c77f]" : "text-[#aaa49a]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
