import { redirect } from "next/navigation";
import { ErrorNote } from "@/components/Shell";
import { InterestFields, WindowFields } from "@/components/Fields";
import { createIdentityAction, signInAction } from "@/lib/actions";
import { publicSignInRoster } from "@/lib/catalog";
import { currentContext } from "@/lib/session";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { person } = await currentContext();
  if (person) redirect("/home");
  const { error } = await searchParams;
  return (
    <div className="split">
      <section>
        <p className="eyebrow">Meridian</p>
        <h1>Something to look forward to.</h1>
        <p className="lede">Small plans with the synthetic people in this demo. A walk, an hour of work, a pot of soup. Your relay handle stays hidden until both of you accept.</p>
        <ErrorNote error={error} />
        <form className="panel" action={signInAction} style={{ marginBottom: "1rem" }}>
          <h2>Sign in</h2>
          <p>Seeded passcodes are on the presenter walkthrough, not on this page.</p>
          <div className="field">
            <label htmlFor="signMagic">Magic name</label>
            <input id="signMagic" name="magicName" type="text" required maxLength={24} autoCapitalize="none" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="signPass">Passcode</label>
            <input id="signPass" name="passcode" type="password" required minLength={4} maxLength={80} autoComplete="off" />
          </div>
          <button className="primary" type="submit">Sign in</button>
        </form>
        <div className="cards">
          {publicSignInRoster().map((account) => (
            <article className="person-card" key={account.magicName}>
              <h2>{account.displayName}</h2>
              <p>{account.line}</p>
              <p className="meta">Magic name <span className="pass">{account.magicName}</span></p>
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Or make a synthetic person</h2>
        <p>No email. No phone. A magic name and a relay handle are enough.</p>
        <form action={createIdentityAction}>
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" name="displayName" type="text" required maxLength={40} placeholder="Nia North" />
          </div>
          <div className="field">
            <label htmlFor="magicName">Magic name</label>
            <input id="magicName" name="magicName" type="text" required maxLength={24} placeholder="nia" autoCapitalize="none" />
          </div>
          <div className="field">
            <label htmlFor="passcode">Passcode</label>
            <input id="passcode" name="passcode" type="text" required minLength={4} maxLength={80} placeholder="north-wind" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="area">Fictional area</label>
            <input id="area" name="area" type="text" required maxLength={40} placeholder="East meadow" />
          </div>
          <div className="field">
            <label htmlFor="contactHandle">Relay handle</label>
            <input id="contactHandle" name="contactHandle" type="text" required placeholder="relay:nia.north" autoCapitalize="none" />
          </div>
          <InterestFields />
          <WindowFields />
          <div className="field">
            <label htmlFor="bio">Short bio</label>
            <textarea id="bio" name="bio" maxLength={280} placeholder="Optional. Keep it fictional." />
          </div>
          <button className="secondary" type="submit">Create and sign in</button>
        </form>
      </section>
    </div>
  );
}
