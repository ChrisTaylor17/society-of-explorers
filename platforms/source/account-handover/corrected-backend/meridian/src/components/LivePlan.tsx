"use client";

import { useEffect, useState } from "react";
import { grantContactAction, respondAction, revokeAction } from "@/lib/actions";
import type { PlanView } from "@/lib/domain";

export function LivePlan({ initial }: { initial: PlanView }) {
  const [plan, setPlan] = useState(initial);
  const [checked, setChecked] = useState("just now");

  useEffect(() => {
    setPlan(initial);
  }, [initial]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const response = await fetch(`/api/plans/${initial.id}`, { cache: "no-store" });
      if (!response.ok || stop) return;
      const next = (await response.json()) as PlanView;
      if (!stop) {
        setPlan(next);
        setChecked(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    };
    const id = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [initial.id]);

  const mine = plan.participants.find((person) => person.personId === plan.viewerId);
  const others = plan.participants.filter((person) => person.personId !== plan.viewerId);

  return (
    <div className="stack" aria-live="polite">
      <p className="meta"><span className="live-dot" aria-hidden="true" />Checked with the server {checked}. A revoke in another window hides the relay here within seconds. Revoking stops future sharing; it can't erase what was already seen.</p>
      {mine?.invitationStatus === "invited" ? (
        <form className="card" action={respondAction}>
          <h3>You are invited</h3>
          <p>Accepting the plan does not share your relay. That is a separate step.</p>
          <input type="hidden" name="planId" value={plan.id} />
          <div className="actions">
            <button className="primary" name="decision" value="accepted" type="submit">Accept the plan</button>
            <button className="quiet" name="decision" value="declined" type="submit">Decline</button>
          </div>
        </form>
      ) : null}
      {others.map((person) => (
        <article className="card" key={person.personId}>
          <div className="row">
            <h3>{person.displayName}</h3>
            <span className={`status ${person.invitationStatus}`}>{person.role === "host" ? "Host" : person.invitationStatus}</span>
          </div>
          {person.contact ? (
            <p><strong>Relay</strong> <span className="pass">{person.contact}</span></p>
          ) : (
            <p className="hidden-relay">Relay hidden</p>
          )}
          <p>{person.contactReason}</p>
          <div className="actions">
            {person.canGrant ? (
              <form action={grantContactAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="otherId" value={person.personId} />
                <button className="primary" type="submit">Accept disclosure</button>
              </form>
            ) : null}
            {person.myGrantId ? (
              <form action={revokeAction}>
                <input type="hidden" name="permissionId" value={person.myGrantId} />
                <input type="hidden" name="next" value={`/plans/${plan.id}`} />
                <button className="danger" type="submit">Revoke contact</button>
              </form>
            ) : null}
          </div>
        </article>
      ))}
      <p className="meta">Your relay, visible only to you on this page until both of you accept: <span className="pass">{mine?.contact}</span></p>
    </div>
  );
}
