import { INTERESTS, WINDOWS } from "@/lib/catalog";

export function InterestFields({ selected = [] }: { selected?: readonly string[] }) {
  return (
    <fieldset>
      <legend>Interests</legend>
      <div className="choices">
        {INTERESTS.map((interest) => (
          <label className="choice" key={interest}>
            <input type="checkbox" name="interests" value={interest} defaultChecked={selected.includes(interest)} />
            <span>{interest}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function WindowFields({ selected = [] }: { selected?: readonly string[] }) {
  return (
    <fieldset>
      <legend>Free windows</legend>
      <div className="choices">
        {WINDOWS.map((window) => (
          <label className="choice" key={window}>
            <input type="checkbox" name="availability" value={window} defaultChecked={selected.includes(window)} />
            <span>{window}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
