"use client";

import { useEffect, useState } from "react";
import { allowAgentAction, revokeAction } from "@/lib/actions";
import { scopeLabel } from "@/lib/catalog";
import type { AgentPreview, PermissionView } from "@/lib/domain";
import { stamp } from "@/lib/format";

type Payload = { permissions: PermissionView[]; agents: AgentPreview[] };

export function LivePermissions({ initial }: { initial: Payload }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const response = await fetch("/api/permissions", { cache: "no-store" });
      if (!response.ok || stop) return;
      const next = (await response.json()) as Payload;
      if (!stop) setData(next);
    };
    const id = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  const active = data.permissions.filter((item) => item.status === "active");
  const revoked = data.permissions.filter((item) => item.status === "revoked");

  return (
    <div className="stack">
      {data.agents.map((agent) => (
        <section className="card" key={agent.agentId} aria-live="polite">
          <p className="eyebrow">What this agent can see right now</p>
          <h2>{agent.name}</h2>
          <p>{agent.blurb}</p>
          <p><strong>Interests.</strong> {agent.interests ? agent.interests.join(", ") : "Hidden. This scope is revoked."}</p>
          <p><strong>Free windows.</strong> {agent.availability ? agent.availability.join(", ") : "Hidden. This scope is revoked."}</p>
          <p><strong>Draft a plan.</strong> {agent.draftPlans ? "Allowed. The agent still does not send anything by itself." : "Not allowed."}</p>
        </section>
      ))}

      <section className="card">
        <h2>Active access</h2>
        {active.length === 0 ? <p>Nothing is currently granted.</p> : null}
        <div className="stack">
          {active.map((item) => (
            <div className="row" key={item.id}>
              <div>
                <strong>{item.granteeName}</strong>
                <div className="meta">{scopeLabel(item.scope)} · {item.resourceLabel} · since {stamp(item.createdAt)}</div>
              </div>
              <form action={revokeAction}>
                <input type="hidden" name="permissionId" value={item.id} />
                <input type="hidden" name="next" value="/permissions" />
                <button className="danger" type="submit">Revoke</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Revoked</h2>
        {revoked.length === 0 ? <p>No revocations yet.</p> : null}
        <div className="stack">
          {revoked.map((item) => (
            <div className="row" key={item.id}>
              <div>
                <strong>{item.granteeName}</strong>
                <div className="meta">{scopeLabel(item.scope)} · {item.resourceLabel} · revoked {item.revokedAt ? stamp(item.revokedAt) : ""}</div>
              </div>
              {item.granteeKind === "agent" ? (
                <form action={allowAgentAction}>
                  <input type="hidden" name="agentId" value={item.granteeId} />
                  <input type="hidden" name="scope" value={item.scope} />
                  <button className="secondary" type="submit">Allow again</button>
                </form>
              ) : (
                <span className="meta">Grant again from the plan.</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
