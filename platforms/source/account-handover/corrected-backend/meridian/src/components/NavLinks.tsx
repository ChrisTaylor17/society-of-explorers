"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const items = signedIn
    ? [
        ["/home", "Home"],
        ["/plans/new", "New plan"],
        ["/profile", "Profile"],
        ["/permissions", "Permissions"],
        ["/audit", "Audit"],
        ["/walkthrough", "Walkthrough"],
        ["/verify", "Verify"],
      ]
    : [
        ["/", "Sign in"],
        ["/walkthrough", "Walkthrough"],
        ["/verify", "Verify"],
      ];
  return (
    <>
      {items.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </>
  );
}
