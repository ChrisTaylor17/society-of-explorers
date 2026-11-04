import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorNote } from "@/components/Shell";
import { LivePlan } from "@/components/LivePlan";
import { completePlanAction, feedbackAction, inviteAction } from "@/lib/actions";
import { kindLabel } from "@/lib/catalog";
import { getPlanView, visiblePeople } from "@/lib/domain";
import { againLabel, enjoymentLabel } from "@/lib/format";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "Plan" };

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { repo, person } = await requirePerson();
  const plan = await getPlanView(repo, person.id, id);
  if (!plan) notFound();
  const memberIds = new Set(plan.participants.map((item) => item.personId));
  const others = (await visiblePeople(repo, person.id)).filter((item) => !memberIds.has(item.id));
  return (
    <>
      <p className="eyebrow"><Link href="/home">Plans</Link> · {kindLabel(plan.kind)}</p>
      <div className="row">
        <h1>{plan.title}</h1>
        <span className={`status ${plan.status}`}>{plan.status}</span>
      </div>
      <p className="lede">{plan.whenLabel} · {plan.placeLabel}</p>
      {plan.note ? <p>{plan.note}</p> : null}
      <ErrorNote error={error} />
      <div className="split">
        <LivePlan initial={plan} />
        <div className="stack">
          {plan.hostId === person.id && plan.status !== "completed" && others.length > 0 ? (
            <form className="card" action={inviteAction}>
              <h2>Invite someone else</h2>
              <input type="hidden" name="planId" value={plan.id} />
              <div className="field">
                <label htmlFor="inviteeId">Person</label>
                <select id="inviteeId" name="inviteeId" required>
                  {others.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </div>
              <button className="secondary" type="submit">Invite</button>
            </form>
          ) : null}
          {plan.canComplete ? (
            <form className="card" action={completePlanAction}>
              <h2>After you meet</h2>
              <p>Marking the plan done opens private feedback. It does not send a message.</p>
              <input type="hidden" name="planId" value={plan.id} />
              <button className="primary" type="submit">We did this</button>
            </form>
          ) : null}
          {plan.status === "completed" ? (
            <section className="card">
              <h2>Private feedback</h2>
              <p>Only you can read this note. The other person is not shown that you wrote it.</p>
              {plan.myFeedback ? (
                <>
                  <p><strong>{enjoymentLabel(plan.myFeedback.enjoyment)}</strong> · {againLabel(plan.myFeedback.again)}</p>
                  {plan.myFeedback.keepNote ? <p>{plan.myFeedback.keepNote}</p> : <p className="meta">No written note.</p>}
                </>
              ) : (
                <form action={feedbackAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <fieldset>
                    <legend>How was the hour?</legend>
                    <div className="choices">
                      {[
                        ["glad", "Glad I went"],
                        ["mixed", "Mixed"],
                        ["not-for-me", "Not for me"],
                      ].map(([value, label]) => (
                        <label className="choice" key={value}>
                          <input type="radio" name="enjoyment" value={value} required />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>Would you do it again?</legend>
                    <div className="choices">
                      {[
                        ["yes", "Yes"],
                        ["maybe", "Maybe"],
                        ["no", "No"],
                      ].map(([value, label]) => (
                        <label className="choice" key={value}>
                          <input type="radio" name="again" value={value} required />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field">
                    <label htmlFor="keepNote">What would you want to remember?</label>
                    <textarea id="keepNote" name="keepNote" maxLength={500} />
                  </div>
                  <button className="primary" type="submit">Save private note</button>
                </form>
              )}
            </section>
          ) : (
            <p className="card">Private feedback opens after the host marks the plan done.</p>
          )}
        </div>
      </div>
    </>
  );
}
