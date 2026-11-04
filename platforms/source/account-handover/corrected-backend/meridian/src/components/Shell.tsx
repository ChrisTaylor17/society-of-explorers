import Link from "next/link";
import { signOutAction } from "@/lib/actions";
import type { StoreKind } from "@/lib/db";
import type { Person } from "@/lib/domain";
import { NavLinks } from "./NavLinks";
import { SessionKeep } from "./SessionKeep";

export function Shell({
  person,
  kind,
  children,
}: {
  person: Person | null;
  kind: StoreKind;
  children: React.ReactNode;
}) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href={person ? "/home" : "/"}>
          <span className="mark" aria-hidden="true">m</span>
          <span>Meridian<small>by Society of Explorers</small></span>
        </Link>
        <nav className="nav" aria-label="Demo">
          <NavLinks signedIn={Boolean(person)} />
          {person ? <span className="who">{person.displayName}</span> : null}
          {person ? (
            <form action={signOutAction}>
              <button className="text-button" type="submit">Sign out</button>
            </form>
          ) : null}
        </nav>
      </header>
      <div className="wrap">
        {kind === "ephemeral-sqlite" ? (
          <p className="banner">This server is using a temporary database. Two browsers may not see the same plans until a Blob store or DATABASE_URL is connected.</p>
        ) : (
          <p className="banner">Synthetic people only. Other members see a shared interest or window, plus anything you chose to show. Relay handles stay hidden until both people accept. Revoking stops future sharing; it can't erase what was already seen.</p>
        )}
        <main id="main" className="page">{children}</main>
      </div>
      {person ? <SessionKeep /> : null}
      <footer className="site-footer">
        <span>A good hour. A little more together.</span>
        <span>Synthetic demo · No chain · No token</span>
      </footer>
    </>
  );
}

export function ErrorNote({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="error" role="alert">{error}</p>;
}
