import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { currentContext } from "@/lib/session";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Meridian", template: "%s · Meridian" },
  description: "A live demo of small plans with synthetic people. Relay handles stay hidden until both people accept.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { person, kind } = await currentContext();
  return (
    <html lang="en">
      <body>
        <Shell person={person} kind={kind}>{children}</Shell>
      </body>
    </html>
  );
}
