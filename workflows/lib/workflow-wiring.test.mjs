// Tests de CÂBLAGE des workflows n8n (analyse statique du JSON, sans n8n lancé).
// Attrape les bugs de "plomberie" que les tests de logique ne voient pas :
//   - un champ profil référencé mais absent du SELECT « Profils actifs »
//     (bug réel : latitude/longitude/rome_codes manquants -> LBA appelé sans géo) ;
//   - un nœud Postgres INSERT/UPDATE dont la sortie est lue ($json.X) sans RETURNING
//     (bug réel : alerte spontanée « undefined ») ;
//   - une variable $env.X utilisée mais non documentée dans .env.example.
// Exécuter : node workflows/lib/workflow-wiring.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wfDir = join(here, "..");
const load = (f) => JSON.parse(readFileSync(join(wfDir, f), "utf-8"));
const wf01 = load("01-recherche-offres.json");
const byName = (wf, n) => wf.nodes.find((x) => x.name === n);
const paramText = (node) => JSON.stringify(node.parameters ?? {});

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("Profils actifs : le SELECT couvre tous les champs profil référencés ($('Boucle profils'))", () => {
  const refs = new Set();
  const re = /\$\('Boucle profils'\)\.(?:first\(\)|item|last\(\))\.json\.(\w+)/g;
  for (const n of wf01.nodes) {
    const txt = paramText(n);
    let m;
    while ((m = re.exec(txt))) refs.add(m[1]);
  }
  const query = byName(wf01, "Profils actifs").parameters.query;
  const up = query.toUpperCase();
  const select = query.slice(up.indexOf("SELECT") + 6, up.indexOf("FROM"));
  const cols = new Set(select.split(",").map((c) => c.trim().split(/\s+as\s+/i).pop().trim()));
  assert.ok(refs.size >= 5, "trop peu de champs profil détectés (regex cassée ?)");
  for (const f of refs) {
    assert.ok(cols.has(f), `champ profil « ${f} » référencé dans un nœud mais ABSENT du SELECT « Profils actifs »`);
  }
});

t("Upsert spontané : RETURNING couvre les champs lus par « Discord spontanée »", () => {
  const q = byName(wf01, "Upsert entreprise (spontanée)").parameters.query;
  const up = q.toUpperCase();
  assert.ok(up.includes("RETURNING"), "l'upsert spontané doit RETURNING ce que le message Discord lit");
  const ret = q.slice(up.lastIndexOf("RETURNING") + "RETURNING".length).replace(/;/g, "");
  const retCols = new Set(ret.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean));
  const msg = byName(wf01, "Discord spontanée").parameters.jsonBody;
  const used = new Set();
  const re = /\$json\.(\w+)/g;
  let m;
  while ((m = re.exec(msg))) used.add(m[1].toLowerCase());
  for (const f of used) {
    assert.ok(retCols.has(f), `« Discord spontanée » lit $json.${f} mais l'upsert ne le RETURNE pas`);
  }
});

t("Toute variable $env.X des workflows est documentée dans .env.example", () => {
  const envExample = readFileSync(join(wfDir, "..", ".env.example"), "utf-8");
  const declared = new Set(
    envExample.split("\n").map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1]).filter(Boolean),
  );
  const used = new Set();
  for (const f of readdirSync(wfDir).filter((f) => f.endsWith(".json"))) {
    const txt = readFileSync(join(wfDir, f), "utf-8");
    const re = /\$env\.([A-Z][A-Z0-9_]*)/g;
    let m;
    while ((m = re.exec(txt))) used.add(m[1]);
  }
  for (const v of used) {
    assert.ok(declared.has(v), `$env.${v} utilisé dans un workflow mais absent de .env.example`);
  }
});

console.log(`\n${passed} tests workflow-wiring OK`);
