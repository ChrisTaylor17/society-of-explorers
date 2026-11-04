import { payloadHash } from "../src/hash.js";
import { request } from "./helpers.js";

/**
 * A tiny stand-in for the mobile client's queued writes.
 * Offline actions stay on the device. Flush replays them in order.
 * An ambiguous response is reconciled with lookup before another send.
 */
export function createDevice({ url, token, personId }) {
  let online = true;
  const queue = [];

  async function send(endpoint, envelope, fault = "") {
    if (!online) return { status: "offline" };
    return request(url, `/api/writes/${endpoint}`, {
      method: "POST",
      token,
      fault,
      body: envelope,
    });
  }

  async function lookup(endpoint, key, hash) {
    return request(url, "/api/lookup", {
      method: "POST",
      token,
      body: { personId, endpoint, key, payloadHash: hash },
    });
  }

  return {
    setOnline(value) {
      online = value;
    },
    queued() {
      return queue.length;
    },
    async write(endpoint, key, body, fault = "") {
      const envelope = { personId, idempotencyKey: key, payloadHash: payloadHash(body), body };
      if (!online) {
        queue.push({ endpoint, envelope });
        return { status: "offline" };
      }
      const result = await send(endpoint, envelope, fault);
      if (result.body?.status === "ambiguous") {
        const found = await lookup(endpoint, key, envelope.payloadHash);
        if (found.body.status === "recorded" && found.body.result.status === "committed") {
          return { reconciled: true, ...found.body.result, lookup: found.body };
        }
        if (found.body.status === "absent" && fault) {
          return send(endpoint, envelope);
        }
      }
      return result.body;
    },
    async flush() {
      const results = [];
      while (online && queue.length > 0) {
        const item = queue[0];
        const result = await send(item.endpoint, item.envelope);
        if (result.body?.status === "expired-session" || result.status === 401) {
          results.push(result.body);
          break;
        }
        queue.shift();
        results.push(result.body);
      }
      return results;
    },
  };
}
