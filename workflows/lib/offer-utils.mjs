// Logique partagée : déduplication (hash canonicalisé) + scoring des offres
// (0-100) piloté par le PROFIL de recherche + filtre d'exclusions.
//
// SOURCE UNIQUE de cette logique. n8n n'importe pas de fichier dans un nœud Code,
// donc le jsCode des nœuds « Scorer + hashSource » et « Dédup sémantique » du 01
// est GÉNÉRÉ d'ici par build-nodes.mjs (`just build-nodes`). Après toute modif,
// relancer le build ; `just test` vérifie la parité (build-nodes.mjs --check).
// Testé par offer-utils.test.mjs.
import { createHash } from "node:crypto";

/** Normalise une chaîne : minuscules, accents REPLIÉS (é->e), espaces compactés.
 * Le NFKD décompose les accents ; on retire ensuite les diacritiques combinants
 * pour que « Développeur » et « Developpeur » se canonicalisent pareil (dédup
 * accent-insensible). Sans ce retrait, l'accent combinant devenait un espace. */
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Canonicalisation pour la déduplication (réduit les quasi-doublons
// inter-sources : "(H/F)", "F/H", suffixes juridiques, ponctuation, "France"). ---
export function canonTitle(t) {
  return norm(t)
    .replace(/\(.*?\)/g, " ")               // (H/F), (CDI), ...
    .replace(/\b[hf]\s*\/\s*[hfx]\b/g, " ") // h/f, f/h, h/x
    .replace(/\bf\s*\/\s*h\b/g, " ")
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function canonCompany(c) {
  return norm(c)
    .replace(/\b(sas|sasu|sarl|sa|eurl|inc|ltd|llc|gmbh|group|groupe)\b/g, " ")
    .replace(/[^a-z0-9àâäéèêëîïôöùûüç ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function canonLocation(l) {
  return norm(l)
    .replace(/\bfrance\b/g, " ")
    .replace(/[^a-zàâäéèêëîïôöùûüç ]/g, " ") // vire les codes INSEE/dépt "59 -"
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash de déduplication : SHA256(titre|entreprise|ville) canonicalisés. */
export function computeHash(offer) {
  const key = [canonTitle(offer.title), canonCompany(offer.company), canonLocation(offer.location)].join("|");
  return createHash("sha256").update(key).digest("hex");
}

// --- Déduplication SÉMANTIQUE (pgvector) : attrape les quasi-doublons inter-
// sources que le hash exact rate (titre reformulé, intitulé d'entreprise variable).
// L'embedding est calculé par le micro-service `embeddings` (fastembed) sur ce texte.

/**
 * Seuil de similarité cosinus au-delà duquel deux offres (même entreprise) sont
 * des doublons. Calibré sur des mesures réelles (modèle multilingual-MiniLM) :
 * même offre reformulée entre sources ≈ 0.82-0.85 ; postes différents ≈ 0.12 ;
 * sans rapport ≈ 0.04. 0.80 attrape les vrais doublons avec une large marge.
 */
export const SEMANTIC_DUP_THRESHOLD = 0.80;

/** Texte canonique à embedder : MÊME construction pour candidat et offres stockées. */
export function embeddingText(offer) {
  const desc = String(offer.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  return [offer.title, offer.company, offer.location, desc]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .join(" \n ");
}

/** Similarité cosinus de deux vecteurs (0 si dimensions incompatibles ou nul). */
export function cosineSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Décide si `candidate` est un doublon sémantique d'une `existing` offre, à partir
 * de leur similarité cosinus. Garde-fou : on n'écarte que si l'entreprise concorde
 * (canonicalisée) — si l'une manque, on ne bloque pas. Renvoie {isDup, reason, ...}.
 */
export function semanticDupDecision(similarity, candidate, existing, opts = {}) {
  const threshold = opts.threshold ?? SEMANTIC_DUP_THRESHOLD;
  const cA = canonCompany(candidate?.company);
  const cB = canonCompany(existing?.company);
  const sameCompany = cA && cB ? cA === cB : true;
  const isDup = similarity >= threshold && sameCompany;
  const reason = isDup
    ? `doublon sémantique (similarité ${similarity.toFixed(3)} ≥ ${threshold}, même entreprise)`
    : similarity < threshold
      ? `distinct (similarité ${similarity.toFixed(3)} < ${threshold})`
      : `similaire mais entreprise différente (« ${cA} » ≠ « ${cB} »)`;
  return { isDup, similarity, sameCompany, threshold, reason };
}

// Préférences par défaut (repli quand le profil ne fournit pas un champ).
export const DEFAULT_PREFS = {
  keywords: ["ia", "intelligence artificielle", "ml", "machine learning",
    "data", "llm", "python", "développeur", "developpeur", "backend", "api"],
  juniorTerms: ["junior", "débutant", "debutant", "alternance", "apprenti",
    "stage", "stagiaire", "entry level"],
  seniorTerms: ["senior", "confirmé", "confirme", "lead", "principal",
    "5 ans", "expérimenté", "experimente", "10 ans"],
  remoteTerms: ["télétravail", "teletravail", "remote", "hybride", "distanciel"],
  goodContracts: ["cdi", "alternance", "cdd", "apprentissage", "freelance"],
};

const splitWords = (s) => norm(s).split(/[,;\n\s]+/).filter(Boolean);
const splitPhrases = (s) => String(s ?? "").split(/[,;\n]+/).map(norm).filter(Boolean);

/**
 * Construit les préférences de scoring À PARTIR D'UN PROFIL `search_profiles`
 * (keywords, must_have, exclusions, contract_types, seniority). C'est ce qui
 * aligne enfin le scoring sur le multi-profils (au lieu de constantes en dur).
 */
export function prefsFromProfile(profile = {}) {
  const kw = [...splitWords(profile.keywords), ...splitPhrases(profile.must_have)];
  const contracts = splitPhrases(profile.contract_types);
  return {
    keywords: kw.length ? kw : DEFAULT_PREFS.keywords,
    exclusions: splitPhrases(profile.exclusions),
    contractTypes: contracts.length ? contracts : DEFAULT_PREFS.goodContracts,
    seniority: norm(profile.seniority),
    remoteTerms: DEFAULT_PREFS.remoteTerms,
    juniorTerms: DEFAULT_PREFS.juniorTerms,
    seniorTerms: DEFAULT_PREFS.seniorTerms,
  };
}

/** Une offre tombe-t-elle sous une exclusion du profil ? (filtre dur) */
export function matchesExclusions(offer, exclusions = []) {
  if (!exclusions?.length) return false;
  const hay = norm(`${offer.title} ${offer.description} ${offer.contract_type} ${offer.location}`);
  return exclusions.some((x) => x && hay.includes(norm(x)));
}

// --- Filtre géographique : écarte les offres hors zone (étranger / Belgique non
// frontalière). Les sources texte (JobSpy LinkedIn/Indeed) cherchent par nom de
// ville sans contrainte de rayon -> elles débordent sur la Belgique (Bruxelles,
// Gand…). France Travail (INSEE + rayon) reste propre, donc non concerné. ---

// Villes frontalières tolérées (< ~30 km de Lille/Valenciennes) malgré le pays.
export const BORDER_ALLOW = [
  "mouscron", "tournai", "comines", "menen", "menin", "mons", "quievrain",
  "quiévrain", "estaimpuis", "kortrijk", "courtrai", "dottignies", "herseaux",
];

// Marqueurs de localisation étrangère (pays/régions/villes hors zone).
const FOREIGN_MARKERS = [
  /\bbelgi(?:um|que|e)\b/, /brussels|bruxelles/, /flemish|vlaams|flandre|flandres/,
  /walloon|wallon(?:ie|ne)?/, /\bghent\b|\bgent\b|\bgand\b/,
  /anderlecht|uccle|ixelles|schaerbeek|waterloo|merelbeke|erpe|aalst|leuven|louvain|antwerp|anvers/,
  /\bluxembourg\b/, /\bnetherlands\b|\bpays-bas\b/, /\bdeutschland\b|\ballemagne\b|\bgermany\b/,
];

/**
 * `true` si l'offre est clairement hors zone (étranger non frontalier). Location
 * vide -> gardée (FT/text génériques « France »). Ville frontalière -> gardée.
 */
export function isOutOfZone(offer) {
  const loc = norm(offer?.location);
  if (!loc) return false;
  if (BORDER_ALLOW.some((c) => loc.includes(c))) return false;
  return FOREIGN_MARKERS.some((re) => re.test(loc));
}

function seniorityScore(hay, prefs) {
  const isJunior = (prefs.juniorTerms ?? DEFAULT_PREFS.juniorTerms).some((t) => hay.includes(norm(t)));
  const isSenior = (prefs.seniorTerms ?? DEFAULT_PREFS.seniorTerms).some((t) => hay.includes(norm(t)));
  const want = prefs.seniority ?? "";
  if (/junior|alternance|débutant|debutant|apprenti|stage/.test(want)) {
    if (isJunior && !isSenior) return 20;
    return isSenior ? 0 : 10;
  }
  if (/senior|confirm|lead|expérim|experim/.test(want)) {
    if (isSenior && !isJunior) return 20;
    return isJunior ? 5 : 10;
  }
  // séniorité non précisée : on pénalise surtout le franchement senior.
  return isSenior && !isJunior ? 5 : 12;
}

/**
 * Score 0-100 selon l'adéquation au profil. Pondération (somme = 100) :
 *   mots-clés/must_have 40 · séniorité 20 · télétravail 15 ·
 *   type de contrat 15 · salaire renseigné 10
 * (la localisation est filtrée à la source / par les exclusions, plus en dur ici)
 */
export function scoreOffer(offer, prefs = DEFAULT_PREFS) {
  const hay = norm(`${offer.title} ${offer.description} ${offer.contract_type}`);
  const loc = norm(offer.location);
  let score = 0;

  const keywords = prefs.keywords ?? DEFAULT_PREFS.keywords;
  const hits = keywords.filter((k) => hay.includes(norm(k))).length;
  score += Math.min(40, hits * 10);

  score += seniorityScore(hay, prefs);

  const remoteTerms = prefs.remoteTerms ?? DEFAULT_PREFS.remoteTerms;
  if (remoteTerms.some((t) => hay.includes(norm(t)) || loc.includes(norm(t)))) score += 15;

  const contracts = prefs.contractTypes ?? prefs.goodContracts ?? DEFAULT_PREFS.goodContracts;
  if (contracts.some((c) => hay.includes(norm(c)) || norm(offer.contract_type).includes(norm(c)))) score += 15;

  if (norm(offer.salary)) score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Annoter une offre : hash + score + `excluded` (true si elle tombe sous une
 * exclusion du profil — le workflow doit alors l'écarter).
 */
export function annotate(offer, prefs = DEFAULT_PREFS) {
  return {
    ...offer,
    hash: computeHash(offer),
    score: scoreOffer(offer, prefs),
    excluded: matchesExclusions(offer, prefs.exclusions ?? []),
  };
}
