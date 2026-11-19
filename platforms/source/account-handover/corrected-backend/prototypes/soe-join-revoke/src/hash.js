import { createHash } from "node:crypto";

/**
 * Canonical JSON used by the synthetic mobile client.
 * Arrays keep order. Object keys are sorted. The hash covers the write body only.
 */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function payloadHash(body) {
  return createHash("sha256").update(stable(body)).digest("hex");
}
