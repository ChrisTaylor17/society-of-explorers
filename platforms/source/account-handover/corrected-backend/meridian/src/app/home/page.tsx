import Link from "next/link";
import { ErrorNote } from "@/components/Shell";
import { kindLabel } from "@/lib/catalog";
import { listPlanSummaries, suggestionsFor } from "@/lib/domain";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "Home" };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { repo, person } = await requirePerson();
  const { error } = await searchParams;
  const [plans, suggestions] = await Promise.all([
    listPlanSummaries(repo, person.id),
    suggestionsFor(repo, person.id),
  ]);
  const waiting = plans.filter((plan) => plan.role === "guest" && plan.invitationStatus === "invited");
  return (
    <>
      <p className="eyebrow">Signed in as {person.displayName}</p>
      <h1>A little more together.</h1>
      <p className="lede">Plans you host, invitations waiting on you, and people who share an interest or a free window. You see the overlap, not their whole list. Matching here is still that overlap. It is not private set intersection.</p>
      <ErrorNote error={error} />
      <div className="split">
        <section className="stack">
          <div className="row">
            <h2>Plans</h2>
            <Link className="button secondary" href="/plans/new">Propose a plan</Link>
          </div>
          {waiting.length > 0 ? <p className="note">{waiting.length === 1 ? "One invitation needs an answer." : `${waiting.length} invitations need an answer.`}</p> : null}
          {plans.length === 0 ? <p className="card">No plans yet.</p> : null}
          {plans.map((plan) => (
            <article className="card" key={plan.id}>
              <div className="row">
                <h3><Link href={`/plans/${plan.id}`}>{plan.title}</Link></h3>
                <span className={`status ${plan.status}`}>{plan.status}</span>
              </div>
              <p className="meta">{kindLabel(plan.kind)} · {plan.whenLabel} · {plan.placeLabel}</p>
              <p className="meta">{plan.role === "host" ? "You are hosting" : `Invited by ${plan.hostName}`} · {plan.invitationStatus}</p>
            </article>
          ))}
        </section>
        <section className="stack">
          <h2>Overlap</h2>
          {suggestions.length === 0 ? <p className="card">No one else shares an interest or a free window with you yet.</p> : null}
          {suggestions.map((personMatch) => (
            <article className="card" key={personMatch.id}>
              <h3>{personMatch.displayName}</h3>
              {personMatch.area ? <p className="meta">{personMatch.area}</p> : null}
              {personMatch.bio ? <p>{personMatch.bio}</p> : null}
              <div className="chips">
                {personMatch.sharedInterests.map((interest) => <span className="chip" key={interest}>{interest}</span>)}
                {personMatch.sharedWindows.map((window) => <span className="chip" key={window}>{window}</span>)}
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
