import { ErrorNote } from "@/components/Shell";
import { createPlanAction } from "@/lib/actions";
import { KINDS } from "@/lib/catalog";
import { visiblePeople } from "@/lib/domain";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "New plan" };

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { repo, person } = await requirePerson();
  const { error } = await searchParams;
  const people = await visiblePeople(repo, person.id);
  return (
    <>
      <p className="eyebrow">Propose</p>
      <h1>A small plan.</h1>
      <p className="lede">Coworking, a hike, dinner, a walk, or making something. The place stays fictional. Inviting someone does not share a relay.</p>
      <ErrorNote error={error} />
      <form className="panel" action={createPlanAction}>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" type="text" required maxLength={80} placeholder="A short riverside walk" />
          </div>
          <div className="field">
            <label htmlFor="kind">Kind</label>
            <select id="kind" name="kind" defaultValue="walk">
              {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="whenLabel">When</label>
            <select id="whenLabel" name="whenLabel" defaultValue={person.availability[0]}>
              {person.availability.map((window) => <option key={window}>{window}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="placeLabel">Fictional place</label>
            <input id="placeLabel" name="placeLabel" type="text" required maxLength={80} placeholder="Example park gate (fictional)" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="note">Note</label>
          <textarea id="note" name="note" maxLength={400} placeholder="Half an hour. Nothing is booked." />
        </div>
        <fieldset>
          <legend>Invite</legend>
          <div className="stack">
            {people.map((other) => (
              <label className="choice" key={other.id} style={{ borderRadius: 16, alignItems: "flex-start" }}>
                <input type="checkbox" name="inviteeIds" value={other.id} />
                <span>
                  <strong>{other.displayName}</strong>
                  <span className="meta" style={{ display: "block" }}>
                    {other.area ? `${other.area} · ` : ""}
                    {other.sharedInterests.length > 0 ? `Shared interests: ${other.sharedInterests.join(", ")}. ` : ""}
                    {other.sharedWindows.length > 0 ? `Shared windows: ${other.sharedWindows.join(", ")}.` : "No shared interest or window."}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="primary" type="submit">Send the invitation</button>
      </form>
    </>
  );
}
