import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectGallery, renderGallery } from "../src/gallery.ts";

const previewDir = dirname(fileURLToPath(import.meta.url));
const target = join(previewDir, "index.html");

const html = renderGallery(await collectGallery());
mkdirSync(previewDir, { recursive: true });
writeFileSync(target, html);
console.log(target);
