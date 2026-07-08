// Génère le jsCode des nœuds Code du workflow 01 À PARTIR de offer-utils.mjs,
// pour qu'il n'y ait qu'UNE source de vérité (fini le copier-coller manuel).
//
// n8n ne peut pas importer un fichier dans un nœud Code : on « inline » donc la
// lib (préambule) + un petit driver propre à chaque nœud. Lancer après toute
// modif de offer-utils.mjs :  just build-nodes   (ou: node workflows/lib/build-nodes.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wfPath = join(here, "..", "01-recherche-offres.json");

// 1. Lib « node-safe » : on retire les imports et les fonctions qui dépendent de
//    node:crypto (computeHash/annotate — le hash SHA256 est fait par un nœud
//    crypto dédié), puis on dé-exporte tout.
function removeFn(src, name) {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return src;
  let start = at;
  if (src.slice(start - 7, start) === "export ") start -= 7;
  let i = src.indexOf("{", at), depth = 0, end = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) { end = i + 1; break; }
  }
  return src.slice(0, start) + src.slice(end);
}

let lib = readFileSync(join(here, "offer-utils.mjs"), "utf-8")
  .split("\n").filter((l) => !l.startsWith("import ")).join("\n");
lib = removeFn(lib, "computeHash");
lib = removeFn(lib, "annotate");
lib = lib.replace(/^export /gm, "").trim();

// 2. Drivers : la SEULE logique propre au workflow (glu d'entrées/sorties n8n).
const SCORER_DRIVER = `
// --- driver: Scorer + hashSource (score profil + exclusions + géo + clé de hash) ---
const prof = $('Boucle profils').first().json;
const P = prefsFromProfile(prof);
return $input.all().map(({ json: o }) => o)
  .filter((o) => !matchesExclusions(o, P.exclusions) && !isOutOfZone(o))
  .map((o) => ({ json: { ...o, score: scoreOffer(o, P), profile_id: prof.id,
    hashSource: [canonTitle(o.title), canonCompany(o.company), canonLocation(o.location)].join('|') } }));`.trim();

const DEDUP_DRIVER = `
// --- driver: Dédup sémantique intra-lot (embeddings + cosinus, tolérant) ---
// Attache aussi embedding + company_canon à chaque offre retenue : l'INSERT
// aval les persiste (pgvector) et écarte les quasi-doublons DÉJÀ EN BASE
// (anti-join sur distance cosinus <= 1 - SEMANTIC_DUP_THRESHOLD, même entreprise).
const items = $input.all().map((i) => i.json);
if (!items.length) return [];
const withMeta = (o, v) => ({ ...o,
  company_canon: canonCompany(o.company || ''),
  embedding: Array.isArray(v) ? '[' + v.join(',') + ']' : '' });
const url = ($env.EMBEDDINGS_API_URL || 'http://embeddings:8002') + '/embed';
let vecs;
try {
  const resp = await this.helpers.httpRequest({ method: 'POST', url, body: { texts: items.map(embeddingText) }, json: true });
  vecs = resp.embeddings;
} catch (e) { return items.map((json) => ({ json: withMeta(json) })); }
if (!Array.isArray(vecs) || vecs.length !== items.length) return items.map((json) => ({ json: withMeta(json) }));
const kept = [], keptVecs = [];
let dropped = 0;
for (let i = 0; i < items.length; i++) {
  const v = vecs[i];
  let dup = false;
  for (let k = 0; k < kept.length; k++) {
    if (semanticDupDecision(cosineSim(v, keptVecs[k]), items[i], kept[k]).isDup) { dup = true; break; }
  }
  if (dup) { dropped++; continue; }
  kept.push(items[i]); keptVecs.push(v);
}
console.log(\`Dedup semantique : \${dropped} quasi-doublon(s) ecarte(s) sur \${items.length}.\`);
return kept.map((json, k) => ({ json: withMeta(json, keptVecs[k]) }));`.trim();

const HEADER =
  "// ⚠️ AUTO-GÉNÉRÉ par workflows/lib/build-nodes.mjs depuis offer-utils.mjs.\n" +
  "// Ne pas éditer ici : modifie offer-utils.mjs puis relance `just build-nodes`.\n\n";

const GEN = {
  "Scorer + hashSource": HEADER + lib + "\n\n" + SCORER_DRIVER + "\n",
  "Dédup sémantique": HEADER + lib + "\n\n" + DEDUP_DRIVER + "\n",
};

// 3. Mode --check (CI) : échoue si les nœuds ont divergé de offer-utils.mjs.
//    Mode normal : régénère le jsCode des 2 nœuds dans le 01.
const wf = JSON.parse(readFileSync(wfPath, "utf-8"));
const check = process.argv.includes("--check");
let drift = false;
for (const [name, code] of Object.entries(GEN)) {
  const node = wf.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`nœud introuvable : ${name}`);
  if (check) {
    if (node.parameters.jsCode !== code) { drift = true; console.error(`✗ désynchronisé : « ${name} »`); }
  } else {
    node.parameters.jsCode = code;
  }
}

if (check) {
  if (drift) {
    console.error("Les nœuds n8n ont divergé de offer-utils.mjs. Lance : just build-nodes");
    process.exit(1);
  }
  console.log("✓ Nœuds synchronisés avec offer-utils.mjs.");
} else {
  writeFileSync(wfPath, JSON.stringify(wf, null, 2), "utf-8");
  console.log("✓ Nœuds 'Scorer + hashSource' et 'Dédup sémantique' régénérés depuis offer-utils.mjs.");
}
