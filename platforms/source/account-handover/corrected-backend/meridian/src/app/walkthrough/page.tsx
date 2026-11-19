import Link from "next/link";
import { ErrorNote } from "@/components/Shell";
import { resetAction } from "@/lib/actions";
import { DEMO_ACCOUNTS } from "@/lib/catalog";
import { currentContext } from "@/lib/session";

export const metadata = { title: "Walkthrough" };

export default async function WalkthroughPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { person } = await currentContext();
  return (
    <>
      <p className="eyebrow">For the person presenting</p>
      <h1>Four minutes, two windows.</h1>
      <p className="lede">The old prototype at app.societyofexplorers.com stays in one tab and forgets everything on reload. This demo signs people in, stores the plan, and hides relay handles until both accept.</p>
      <ErrorNote error={error} />
      <ol className="steps">
        <li>
          <h2>Open two browsers</h2>
          <p>Use a normal window and a private window so they keep separate sessions. Both can reach this app at the same time.</p>
        </li>
        <li>
          <h2>Sign in as Ada, then Jules</h2>
          <p>Window A: <Link href="/">Ada Linden</Link>, magic name <span className="pass">ada</span>, passcode <span className="pass">grove</span>. Window B: Jules Okonkwo, <span className="pass">jules</span> / <span className="pass">sketch</span>.</p>
        </li>
        <li>
          <h2>Open the seeded walk</h2>
          <p>As Ada, open <strong>A short riverside walk</strong>. Jules and Mina are invited. No relay is visible. Say that inviting is not consent.</p>
        </li>
        <li>
          <h2>Accept the plan, still hidden</h2>
          <p>As Jules, accept the plan. Point at the line that the relay is still hidden. Acceptance of the outing is not acceptance of contact.</p>
        </li>
        <li>
          <h2>One yes is not enough</h2>
          <p>As Ada, choose <strong>Accept disclosure</strong>. Jules’s window still shows the relay as hidden. Then Jules accepts disclosure. Both relays appear. They look like <span className="pass">relay:ada.linden</span>, not an email or a phone number.</p>
        </li>
        <li>
          <h2>Revoke, and watch the other window</h2>
          <p>As Ada, open <Link href="/permissions">Permissions</Link>. Grove can read interests and free windows. Revoke <strong>Read free windows</strong>. The agent panel drops the windows on the next read. Then revoke contact on the plan. Jules’s window hides the relay within seconds, without Jules clicking anything. Revoking stops future sharing; it can't erase what was already seen.</p>
        </li>
        <li>
          <h2>Show the receipt</h2>
          <p>Open <Link href="/audit">Audit</Link>. The revoke has an Ed25519 receipt. Open it. The page says the signature matches the current log key. Say plainly that this is a signed log, not a blockchain, and there is no token. A broken link shows on the verify page. A deleted suffix does not, because there is no independent checkpoint.</p>
        </li>
        <li>
          <h2>Leave a private note</h2>
          <p>There is also a finished plan, <strong>A quiet coworking hour</strong>, between Mina (<span className="pass">mina</span> / <span className="pass">trail</span>) and Rowan (<span className="pass">rowan</span> / <span className="pass">desk</span>). Mina already left a private note. Sign in as Rowan and show that the note is not there. Rowan can write one after the plan is marked done. A new plan can be marked done with <strong>We did this</strong>.</p>
        </li>
        <li>
          <h2>The half-open dinner</h2>
          <p><strong>Soup and one story</strong> is the awkward middle. Samir (<span className="pass">samir</span> / <span className="pass">table</span>) already accepted disclosure. Rowan has not. The relay stays hidden. That is the gate.</p>
        </li>
      </ol>
      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>What is real, and what is not</h2>
        <p>Real: sign-in, profiles, plans, invitations, mutual consent, server-side revoke, private feedback, and signed receipts.</p>
        <p>Not real: these five people, the places, and the relays. Matching is the overlap of interests and windows, not private set intersection. Agents are permissioned names. They do not plan or send anything on their own. No message is delivered. Nothing is booked. Receipts are hash-chained so a broken link can be detected. Completeness is unknown without an independent checkpoint. They are not anchored on a blockchain.</p>
        <h3>Passcodes</h3>
        <ul>
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.magicName}><span className="pass">{account.magicName}</span> / <span className="pass">{account.passcode}</span> · {account.displayName} · agent {account.agentName}</li>
          ))}
        </ul>
      </section>
      {person ? (
        <form className="card" action={resetAction} style={{ marginTop: "0.9rem" }}>
          <h2>Reset the synthetic world</h2>
          <p>This deletes plans, notes, and extra people, then loads the five seeded people again. You are signed in as {person.displayName}. The reset also needs the server secret. That value is not printed here.</p>
          <div className="field">
            <label htmlFor="secret">Reset secret</label>
            <input id="secret" name="secret" type="password" autoComplete="off" />
          </div>
          <button className="danger" type="submit">Reset demo data</button>
        </form>
      ) : (
        <section className="card" style={{ marginTop: "0.9rem" }}>
          <h2>Reset the synthetic world</h2>
          <p>Sign in first. Reset also needs the server secret, which is not printed on this page.</p>
        </section>
      )}
    </>
  );
}
