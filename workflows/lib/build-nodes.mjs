// Génère le jsCode des nœuds Code des workflows 01 et 02 À PARTIR des modules
// de lib/, pour qu'il n'y ait qu'UNE source de vérité (fini le copier-coller
// manuel, et fini la dérive silencieuse nœud <-> lib).
//
// n8n ne peut pas importer un fichier dans un nœud Code : on « inline » donc la
// lib (préambule) + un petit driver propre à chaque nœud (la glu $input/$('X')).
// Lancer après toute modif d'un module de lib/ :
//   just build-nodes   (ou: node workflows/lib/build-nodes.mjs)
// Mode --check (CI / just test) : échoue si un nœud a divergé de sa lib.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wfPath = (f) => join(here, "..", f);

// 1. Chargement « node-safe » d'un module : retrait des imports, dé-export,
//    et retrait optionnel de fonctions dépendant de node:crypto.
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

function loadLib(file, { dropFns = [] } = {}) {
  let lib = readFileSync(join(here, file), "utf-8")
    .split("\n").filter((l) => !l.startsWith("import ")).join("\n");
  for (const fn of dropFns) lib = removeFn(lib, fn);
  return lib.replace(/^export /gm, "").trim();
}

const LIB = {
  // computeHash/annotate dépendent de node:crypto (le SHA256 est fait par le
  // nœud Crypto dédié du 01).
  "offer-utils.mjs": loadLib("offer-utils.mjs", { dropFns: ["computeHash", "annotate"] }),
  "sources.mjs": loadLib("sources.mjs"),
  "llm-scoring.mjs": loadLib("llm-scoring.mjs"),
  "company-enrichment.mjs": loadLib("company-enrichment.mjs"),
  "render-payloads.mjs": loadLib("render-payloads.mjs"),
};

const header = (libFile) =>
  `// ⚠️ AUTO-GÉNÉRÉ par workflows/lib/build-nodes.mjs depuis ${libFile}.\n` +
  `// Ne pas éditer ici : modifie ${libFile} puis relance \`just build-nodes\`.\n\n`;

// 2. Drivers : la SEULE logique propre au workflow (glu d'entrées/sorties n8n).
const gen = (libFile, driver) => header(libFile) + LIB[libFile] + "\n\n" + driver.trim() + "\n";

const SCORER_DRIVER = `
// --- driver: Scorer + hashSource (score profil + exclusions + géo + clé de hash) ---
const prof = $('Boucle profils').first().json;
const P = prefsFromProfile(prof);
return $input.all().map(({ json: o }) => o)
  .filter((o) => !matchesExclusions(o, P.exclusions) && !isOutOfZone(o))
  .map((o) => ({ json: { ...o, score: scoreOffer(o, P), profile_id: prof.id,
    hashSource: [canonTitle(o.title), canonCompany(o.company), canonLocation(o.location)].join('|') } }));`;

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
return kept.map((json, k) => ({ json: withMeta(json, keptVecs[k]) }));`;

// 3. Nœuds générés, par fichier de workflow.
const GEN = {
  "01-recherche-offres.json": {
    "Scorer + hashSource": gen("offer-utils.mjs", SCORER_DRIVER),
    "Dédup sémantique": gen("offer-utils.mjs", DEDUP_DRIVER),
    "norm FT": gen("sources.mjs", `
// --- driver: norm FT (réponse France Travail -> schéma commun) ---
return normalizeFranceTravail($input.first().json).map((o) => ({ json: o }));`),
    "norm JobSpy": gen("sources.mjs", `
// --- driver: norm JobSpy (réponse du micro-service -> schéma commun) ---
return normalizeJobSpy($input.first().json).map((o) => ({ json: o }));`),
    "norm LBA": gen("sources.mjs", `
// --- driver: norm LBA (offres d'alternance jobs[] -> schéma commun) ---
return normalizeLaBonneAlternanceJobs($input.first().json).map((o) => ({ json: o }));`),
    "norm LBA recruteurs": gen("sources.mjs", `
// --- driver: norm LBA recruteurs (entreprises à contacter, candidature spontanée) ---
// Filtre les fiches sans nom (inutilisables pour l'upsert companies).
return normalizeLBARecruiters($input.first().json).filter((o) => o.name).map((o) => ({ json: o }));`),
    "Préparer scoring LLM": gen("llm-scoring.mjs", `
// --- driver: Préparer scoring LLM (top-N + messages DeepSeek, critères du profil) ---
const prof = $('Boucle profils').first().json;
const all = $input.all().map((i) => i.json);
const offers = selectTopN(all, 20);
const { messages } = buildScoringMessages(prof, offers);
return [{ json: { messages, offers, threshold: prof.score_threshold || 60 } }];`),
    "Fusion scores": gen("llm-scoring.mjs", `
// --- driver: Fusion scores (réponse LLM -> score + score_reason, fallback déterministe) ---
const raw = $input.first().json.choices?.[0]?.message?.content ?? '';
const offers = $('Préparer scoring LLM').first().json.offers || [];
return parseScoringResponse(raw, offers).map((o) => ({ json: o }));`),
  },
  "02-agent-candidature.json": {
    "Préparer enrichissement": gen("company-enrichment.mjs", `
// --- driver: Préparer enrichissement (fiche entreprise GROUNDED, texte de l'offre seul) ---
const entree = $('Normaliser entrée').first().json;
const src = (entree.company_info || '') + '\\n' + (entree.description || '');
const { messages } = buildEnrichmentMessages(entree.company || '', src);
return [{ json: { messages } }];`),
    "Parser entreprise": gen("company-enrichment.mjs", `
// --- driver: Parser entreprise (réponse LLM -> { sector, ai_summary }, vides si KO) ---
const raw = $input.first().json.choices?.[0]?.message?.content ?? '';
return [{ json: parseEnrichmentResponse(raw) }];`),
    "Préparer rendu": gen("render-payloads.mjs", `
// --- driver: Préparer rendu (corps de POST /cv et /letter, recopie stricte de l'agent) ---
const agent = $('Parser sortie agent').first().json;
const entree = $('Normaliser entrée').first().json;
const application_id = String($('Créer candidature (draft)').first().json.id);
const lettre = (agent.lettre && typeof agent.lettre === 'object') ? agent.lettre : {};
const template = entree.spontaneous ? 'candidature-spontanee' : String(lettre.template ?? '');
const accroche = String(lettre.accroche ?? '');
const company = String(entree.company ?? '');
const subject = String(agent.objet_email ?? '');
const cv_payload = buildCvPayload({ application_id, personnalisation_cv: agent.personnalisation_cv });
const letter_payload = buildLetterPayload({ application_id, company, template, accroche, vars: { poste: String(entree.title ?? '') } });
return [{ json: { application_id, company, subject, body: accroche, cv_payload, letter_payload } }];`),
    "Préparer finalisation": gen("render-payloads.mjs", `
// --- driver: Préparer finalisation (entrée du 04 ; to_email vide = GARDE-FOU humain) ---
const prep = $('Préparer rendu').first().json;
return [{ json: buildFinalisationInput({
  company: prep.company,
  cv_path: $('Rendu CV (PDF)').first().json.cv_path,
  letter_path: $('Rendu lettre (PDF)').first().json.letter_path,
  to_email: '',
  subject: prep.subject,
  body: prep.body,
}) }];`),
  },
};

// 4. Mode --check (CI) : échoue si un nœud a divergé de sa lib.
//    Mode normal : régénère le jsCode des nœuds dans les workflows.
const check = process.argv.includes("--check");
let drift = false;
for (const [file, nodes] of Object.entries(GEN)) {
  const wf = JSON.parse(readFileSync(wfPath(file), "utf-8"));
  let touched = false;
  for (const [name, code] of Object.entries(nodes)) {
    const node = wf.nodes.find((n) => n.name === name);
    if (!node) throw new Error(`nœud introuvable : « ${name} » dans ${file}`);
    if (check) {
      if (node.parameters.jsCode !== code) { drift = true; console.error(`✗ désynchronisé : « ${name} » (${file})`); }
    } else if (node.parameters.jsCode !== code) {
      node.parameters.jsCode = code;
      touched = true;
    }
  }
  if (!check && touched) {
    writeFileSync(wfPath(file), JSON.stringify(wf, null, 2), "utf-8");
    console.log(`✓ ${file} : ${Object.keys(nodes).length} nœud(s) régénéré(s) depuis lib/.`);
  } else if (!check) {
    console.log(`✓ ${file} : déjà synchronisé.`);
  }
}

if (check) {
  if (drift) {
    console.error("Des nœuds n8n ont divergé de leur module lib/. Lance : just build-nodes");
    process.exit(1);
  }
  console.log("✓ Nœuds synchronisés avec les modules de lib/.");
}
