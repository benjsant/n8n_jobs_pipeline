// Tests du builder de lettre — node cv/letter.test.mjs
import assert from "node:assert/strict";
import { buildLetterHtml } from "./letter.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const data = {
  candidate: { name: "Alex Martin", email: "a@ex.com", phone: "06", location: "Lyon" },
  company: "NovaTech",
  date: "Lyon, le 11 juin 2026",
  subject: "Candidature — Dev IA Junior",
  body: "Madame, Monsieur,\n\nPremier paragraphe.\nDeuxième ligne.\n\nDernier paragraphe.",
};

t("document HTML complet", () => {
  const html = buildLetterHtml(data);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("@page"));
});

t("contient identité, destinataire, objet", () => {
  const html = buildLetterHtml(data);
  assert.ok(html.includes("Alex Martin"));
  assert.ok(html.includes("NovaTech"));
  assert.ok(html.includes("Candidature — Dev IA Junior"));
});

t("paragraphes : double saut = <p>, simple saut = <br>", () => {
  const html = buildLetterHtml(data);
  const pCount = (html.match(/<p>/g) || []).length;
  assert.equal(pCount, 3, `attendu 3 <p>, reçu ${pCount}`);
  assert.ok(html.includes("Premier paragraphe.<br>Deuxième ligne."));
});

t("échappe le HTML (anti-injection)", () => {
  const html = buildLetterHtml({ body: "a <script>x</script> b" });
  assert.ok(!html.includes("<script>x"));
  assert.ok(html.includes("&lt;script&gt;"));
});

t("robuste aux champs manquants", () => {
  const html = buildLetterHtml({});
  assert.ok(html.includes("[Nom]"));
});

console.log(`\n${passed} tests lettre OK`);
