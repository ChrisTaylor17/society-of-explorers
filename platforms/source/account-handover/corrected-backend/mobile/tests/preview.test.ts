import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { DEMO_LABEL, REVOCATION_LIMIT } from "../src/copy.ts";
import { HOST } from "../src/fixture.ts";
import { collectGallery, renderGallery } from "../src/gallery.ts";

describe("local gallery", () => {
  test("renders every truthful state without leaking a stale title", async () => {
    const screens = await collectGallery();
    const phases = screens.map((screen) => screen.phase);
    assert.deepEqual(phases, [
      "loading",
      "offline",
      "expired-session",
      "discover",
      "visibility",
      "join-pending",
      "join-ambiguous",
      "mutual",
      "revoked",
      "failed-refresh",
      "live-blocked",
    ]);
    for (const screen of screens) {
      assert.equal(screen.demoLabel, DEMO_LABEL);
      assert.equal(screen.revocationNote, REVOCATION_LIMIT);
    }
    const mutual = screens.find((screen) => screen.phase === "mutual");
    const revoked = screens.find((screen) => screen.phase === "revoked");
    const stale = screens.find((screen) => screen.phase === "failed-refresh");
    const visibility = screens.find((screen) => screen.phase === "visibility");
    assert.equal(mutual?.relay.value, HOST.relay);
    assert.equal(revoked?.relay.value, null);
    assert.match(revoked?.lede ?? "", /cannot erase|already saw/);
    assert.equal(JSON.stringify(visibility).includes(HOST.relay), false);
    assert.equal(JSON.stringify(stale).includes("Leaked"), false);
    assert.equal(JSON.stringify(stale).includes(HOST.relay), false);

    const html = renderGallery(screens);
    assert.match(html, new RegExp(REVOCATION_LIMIT));
    assert.match(html, /Synthetic demo/);
    for (const phase of phases) assert.match(html, new RegExp(`data-phase="${phase}"`));
    const hostile = renderGallery([
      {
        ...screens[0],
        title: "<script>alert(1)</script>",
        lede: `Tom & Jerry`,
      },
    ]);
    assert.equal(hostile.includes("<script>alert"), false);
    assert.match(hostile, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(hostile, /Tom &amp; Jerry/);
  });

  test("the checked-in gallery matches the renderer", async () => {
    const html = renderGallery(await collectGallery());
    const file = readFileSync(join(import.meta.dirname, "../preview/index.html"), "utf8");
    assert.equal(file, html);
  });
});
