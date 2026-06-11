// Tests enrichissement entreprise — node workflows/lib/company-enrichment.test.mjs
import assert from "node:assert/strict";
import { buildEnrichmentMessages, parseEnrichmentResponse } from "./company-enrichment.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("messages : JSON forcé + consigne anti-invention + texte source", () => {
  const req = buildEnrichmentMessages("NovaTech", "Éditeur de logiciels IA pour l'industrie.");
  assert.equal(req.response_format.type, "json_object");
  assert.match(req.messages[0].content, /JSON/);
  assert.match(req.messages[0].content, /n'invente|inventes/i);
  assert.match(req.messages[1].content, /NovaTech/);
  assert.match(req.messages[1].content, /Éditeur de logiciels/);
});

t("texte source tronqué (borne de sécurité)", () => {
  const long = "x".repeat(5000);
  const req = buildEnrichmentMessages("X", long);
  assert.ok(req.messages[1].content.length < 2200);
});

t("parse : extrait sector + ai_summary", () => {
  const out = parseEnrichmentResponse(JSON.stringify({
    sector: "Édition logicielle", ai_summary: "Éditeur d'outils IA pour l'industrie.",
  }));
  assert.equal(out.sector, "Édition logicielle");
  assert.match(out.ai_summary, /outils IA/);
});

t("parse : JSON invalide -> champs vides (pas d'invention)", () => {
  assert.deepEqual(parseEnrichmentResponse("oops"), { sector: "", ai_summary: "" });
});

t("parse : champs manquants -> vides", () => {
  assert.deepEqual(parseEnrichmentResponse(JSON.stringify({ sector: "Tech" })),
    { sector: "Tech", ai_summary: "" });
});

t("parse : accepte un objet déjà parsé", () => {
  assert.equal(parseEnrichmentResponse({ ai_summary: "ok" }).ai_summary, "ok");
});

console.log(`\n${passed} tests company-enrichment OK`);
