import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { suggestionsFor, updateProfile, visiblePeople } from "../src/lib/domain";
import { seedIfEmpty } from "../src/lib/seed";
import { makePerson, testRepo, unwrap } from "./helpers";
import type { Repository } from "../src/lib/db";

describe("data minimization", () => {
  let repo: Repository;

  beforeEach(async () => {
    repo = await testRepo();
  });

  test("other people receive only overlaps and opted-in fields", async () => {
    const ada = await makePerson(repo, "adaone", ["Walks", "Notebooks"], ["Saturday morning", "Sunday afternoon"]);
    await makePerson(repo, "julesone", ["Drawing", "Walks"], ["Saturday morning", "Friday evening"]);
    const visible = await visiblePeople(repo, ada.person.id);
    const jules = visible.find((person) => person.magicName === "julesone");
    assert.ok(jules);
    assert.deepEqual(jules.sharedInterests, ["Walks"]);
    assert.deepEqual(jules.sharedWindows, ["Saturday morning"]);
    assert.equal(jules.area, null);
    assert.equal(jules.bio, null);
    const payload = JSON.stringify(jules);
    assert.equal(payload.includes("Drawing"), false);
    assert.equal(payload.includes("Friday evening"), false);
    assert.equal(payload.includes("Example hill"), false);
    assert.equal(payload.includes("Synthetic test person"), false);
    assert.equal(payload.includes("relay:"), false);
  });

  test("area and bio appear only after the person opts in", async () => {
    const ada = await makePerson(repo, "adaone");
    const jules = await makePerson(repo, "julesone", ["Walks"], ["Saturday morning"]);
    unwrap(
      await updateProfile(repo, jules.person.id, {
        displayName: jules.person.displayName,
        interests: jules.person.interests,
        availability: jules.person.availability,
        area: "North rooms",
        contactHandle: jules.person.contactHandle,
        bio: "A short public bio.",
        shareArea: true,
        shareBio: true,
      }),
    );
    const visible = await visiblePeople(repo, ada.person.id);
    const shown = visible.find((person) => person.id === jules.person.id);
    assert.equal(shown?.area, "North rooms");
    assert.equal(shown?.bio, "A short public bio.");
    assert.equal(JSON.stringify(shown).includes("relay:"), false);
  });

  test("suggestions omit people with no shared interest or window", async () => {
    await seedIfEmpty(repo);
    const ada = "person_ada";
    const suggestions = await suggestionsFor(repo, ada);
    const names = suggestions.map((person) => person.magicName);
    assert.ok(names.includes("jules"));
    const jules = suggestions.find((person) => person.magicName === "jules");
    assert.deepEqual(jules?.sharedInterests, []);
    assert.deepEqual(jules?.sharedWindows, ["Saturday morning"]);
    assert.equal(jules?.area, "North rooms");
    assert.equal(jules?.bio, null);
    assert.equal(JSON.stringify(suggestions).includes("Drawing"), false);
    assert.equal(JSON.stringify(suggestions).includes("relay:"), false);
    assert.equal(JSON.stringify(suggestions).includes("Will trade"), false);

    const outsider = await makePerson(repo, "outsider", ["Cooking"], ["Friday evening"]);
    await updateProfile(repo, outsider.person.id, {
      displayName: outsider.person.displayName,
      interests: ["Cooking"],
      availability: ["Friday evening"],
      area: "Hidden lane",
      contactHandle: outsider.person.contactHandle,
      bio: "Not for the directory.",
      shareArea: false,
      shareBio: false,
    });
    const again = await suggestionsFor(repo, ada);
    assert.equal(again.some((person) => person.magicName === "outsider"), false);
    const listed = (await visiblePeople(repo, ada)).find((person) => person.magicName === "outsider");
    assert.deepEqual(listed?.sharedInterests, []);
    assert.deepEqual(listed?.sharedWindows, []);
    assert.equal(listed?.area, null);
    assert.equal(JSON.stringify(listed).includes("Cooking"), false);
    assert.equal(JSON.stringify(listed).includes("Hidden lane"), false);
  });
});
