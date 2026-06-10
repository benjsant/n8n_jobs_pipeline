// Génère le PDF du CV à partir du HTML construit par Astro (dist/index.html).
// Usage : npm run build && npm run pdf  (ou : node scripts/render-pdf.mjs out.pdf)
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, "..", "dist", "index.html");
const outPath = resolve(process.argv[2] ?? resolve(here, "..", "dist", "cv.pdf"));

if (!existsSync(htmlPath)) {
  console.error(`HTML introuvable : ${htmlPath}\nLance d'abord : npm run build`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});
await browser.close();
console.log(`PDF généré : ${outPath}`);
