"use client";

import { useEffect } from "react";

export function SessionKeep() {
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      await fetch("/api/session", { method: "POST", cache: "no-store" }).catch(() => undefined);
    };
    const id = window.setInterval(tick, 60_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);
  return null;
}
