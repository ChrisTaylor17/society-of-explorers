import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { publicSignInRoster } from "../src/lib/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.(ts|tsx|md|css)$/.test(name)) out.push(path);
  }
  return out;
}

describe("public copy", () => {
  test("the sign-in page does not list seeded passcodes or a reset phrase", () => {
    const page = readFileSync(join(root, "src/app/page.tsx"), "utf8");
    for (const word of ["grove", "sketch", "trail", "table", "desk", "reset-the-grove"]) {
      assert.equal(page.toLowerCase().includes(word), false, word);
    }
    const roster = JSON.stringify(publicSignInRoster());
    assert.equal(roster.includes("grove"), false);
    assert.equal(roster.includes("passcode"), false);
    assert.ok(roster.includes("ada"));
  });

  test("the walkthrough keeps passcodes and drops the public reset phrase", () => {
    const page = readFileSync(join(root, "src/app/walkthrough/page.tsx"), "utf8");
    assert.equal(page.includes("reset-the-grove"), false);
    assert.match(page, /grove/);
    assert.match(page, /within seconds/);
    assert.match(page, /can't erase what was already seen/);
  });

  test("user-facing copy says within seconds, not instant", () => {
    const offenders = filesUnder(join(root, "src"))
      .concat([join(root, "README.md")])
      .filter((path) => /instant/i.test(readFileSync(path, "utf8")));
    assert.deepEqual(offenders, []);
    const permissions = readFileSync(join(root, "src/app/permissions/page.tsx"), "utf8");
    assert.match(permissions, /within seconds/);
    assert.match(permissions, /can't erase what was already seen/);
  });
});
