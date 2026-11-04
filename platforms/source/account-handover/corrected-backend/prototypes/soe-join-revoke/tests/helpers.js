import assert from "node:assert/strict";
import { createHttp } from "../src/http.js";
import { payloadHash } from "../src/hash.js";
import { PEOPLE, PLAN } from "../src/synthetic.js";
import { createWorld } from "../src/world.js";

export const PLAN_ID = PLAN.id;
export const PASS = Object.fromEntries(PEOPLE.map((person) => [person.id, person.passcode]));

export function assertNoRelay(body) {
  assert.doesNotMatch(JSON.stringify(body), /relay:/);
}

export async function boot() {
  const world = createWorld({ allowFaults: true });
  const http = createHttp(world);
  const { url } = await http.listen(0);
  return {
    world,
    url,
    stop: () => http.close(),
  };
}

export async function request(url, path, { method = "GET", token = "", body, fault = "" } = {}) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (fault) headers["x-soe-fault"] = fault;
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json();
  return { status: response.status, body: parsed, cache: response.headers.get("cache-control") };
}

export async function signIn(url, id) {
  const result = await request(url, "/api/session", {
    method: "POST",
    body: { magicName: id, passcode: PASS[id] },
  });
  assert.equal(result.body.status, "ok", JSON.stringify(result.body));
  assert.equal(typeof result.body.token, "string");
  assertNoRelay(result.body);
  return result.body;
}

export function envelope(personId, key, body) {
  return { personId, idempotencyKey: key, payloadHash: payloadHash(body), body };
}

export async function write(url, token, endpoint, personId, key, body, fault = "") {
  return request(url, `/api/writes/${endpoint}`, {
    method: "POST",
    token,
    fault,
    body: envelope(personId, key, body),
  });
}
