// Tests du scoring hybride — node workflows/lib/llm-scoring.test.mjs
import assert from "node:assert/strict";
import { selectTopN, buildScoringMessages, parseScoringResponse } from "./llm-scoring.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const offers = [
  { title: "Dev IA Junior", company: "Nova", location: "Lyon", description: "python", score: 70 },
  { title: "Sales", company: "X", location: "Paris", description: "vente", score: 20 },
  { title: "ML Engineer", company: "Y", location: "Remote", description: "ml", score: 85 },
];

t("selectTopN trie par score déterministe desc", () => {
  const top = selectTopN(offers, 2);
  assert.equal(top.length, 2);
  assert.equal(top[0].title, "ML Engineer"); // 85
  assert.equal(top[1].title, "Dev IA Junior"); // 70
});

t("selectTopN borne à la taille dispo", () => {
  assert.equal(selectTopN(offers, 99).length, 3);
});

t("buildScoringMessages : JSON forcé + profil + index", () => {
  const req = buildScoringMessages("Junior IA, Python, Lyon", offers);
  assert.equal(req.response_format.type, "json_object");
  assert.match(req.messages[0].content, /JSON/);          // requis pour le mode JSON
  assert.match(req.messages[1].content, /Junior IA, Python/);
  assert.match(req.messages[1].content, /#0 —/);          // offres indexées
});

t("parseScoringResponse : applique score LLM + reason", () => {
  const raw = JSON.stringify({ scores: [
    { i: 0, score: 88, reason: "stack ok" },
    { i: 2, score: 95, reason: "excellent" },
  ] });
  const out = parseScoringResponse(raw, offers);
  assert.equal(out[0].score, 88);
  assert.equal(out[0].score_reason, "stack ok");
  assert.equal(out[2].score, 95);
  assert.equal(out[1].score, 20); // pas de score LLM -> fallback déterministe
});

t("parseScoringResponse : clamp 0-100", () => {
  const out = parseScoringResponse(JSON.stringify({ scores: [{ i: 0, score: 150 }] }), offers);
  assert.equal(out[0].score, 100);
});

t("parseScoringResponse : JSON invalide -> offres inchangées", () => {
  const out = parseScoringResponse("pas du json", offers);
  assert.deepEqual(out.map((o) => o.score), [70, 20, 85]);
});

t("parseScoringResponse : accepte un objet déjà parsé", () => {
  const out = parseScoringResponse({ scores: [{ i: 1, score: 60, reason: "ok" }] }, offers);
  assert.equal(out[1].score, 60);
});

console.log(`\n${passed} tests llm-scoring OK`);
