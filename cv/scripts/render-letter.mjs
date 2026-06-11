// Génère le PDF d'une lettre à partir d'un JSON de données.
// Usage : LETTER_DATA=chemin.json node scripts/render-letter.mjs [sortie.pdf]
//   ou : node scripts/render-letter.mjs sortie.pdf < data.json
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { buildLetterHtml } from "../letter.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(process.argv[2] ?? resolve(here, "..", "dist", "lettre.pdf"));

let raw;
if (process.env.LETTER_DATA) {
  raw = readFileSync(process.env.LETTER_DATA, "utf-8");
} else if (!process.stdin.isTTY) {
  raw = readFileSync(0, "utf-8"); // stdin
} else {
  console.error("Fournis les données : LETTER_DATA=fichier.json ou via stdin.");
  process.exit(1);
}

const html = buildLetterHtml(JSON.parse(raw));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});
await browser.close();
console.log(`PDF lettre généré : ${outPath}`);
