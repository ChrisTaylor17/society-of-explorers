import { ErrorNote } from "@/components/Shell";
import { InterestFields, WindowFields } from "@/components/Fields";
import { updateProfileAction } from "@/lib/actions";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "Profile" };

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { person } = await requirePerson();
  const query = await searchParams;
  const error = query.error;
  return (
    <div className="split">
      <section>
        <p className="eyebrow">Profile</p>
        <h1>{person.displayName}</h1>
        <p className="lede">Other people see only the interests and free windows you share with them. Area and bio stay hidden unless you opt in below. The relay handle is shared only from a plan, and only after both of you accept.</p>
        <ErrorNote error={error} />
        {query.saved === "1" ? <p className="ok" role="status">Saved on this server. Other people still cannot see your relay.</p> : null}
      </section>
      <form className="panel" action={updateProfileAction}>
        <div className="field">
          <label htmlFor="displayName">Display name</label>
          <input id="displayName" name="displayName" type="text" required maxLength={40} defaultValue={person.displayName} />
        </div>
        <div className="field">
          <label htmlFor="area">Fictional area</label>
          <input id="area" name="area" type="text" required maxLength={40} defaultValue={person.area} />
        </div>
        <div className="field">
          <label htmlFor="contactHandle">Relay handle</label>
          <input id="contactHandle" name="contactHandle" type="text" required defaultValue={person.contactHandle} autoCapitalize="none" />
        </div>
        <InterestFields selected={person.interests} />
        <WindowFields selected={person.availability} />
        <div className="field">
          <label htmlFor="bio">Short bio</label>
          <textarea id="bio" name="bio" maxLength={280} defaultValue={person.bio} />
        </div>
        <fieldset>
          <legend>Show to other members</legend>
          <div className="choices">
            <label className="choice">
              <input type="checkbox" name="shareArea" value="yes" defaultChecked={person.shareArea} />
              <span>Fictional area</span>
            </label>
            <label className="choice">
              <input type="checkbox" name="shareBio" value="yes" defaultChecked={person.shareBio} />
              <span>Short bio</span>
            </label>
          </div>
        </fieldset>
        <button className="primary" type="submit">Save profile</button>
      </form>
    </div>
  );
}
