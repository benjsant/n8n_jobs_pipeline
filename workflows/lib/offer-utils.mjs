// Logique partagée : déduplication (hash canonicalisé) + scoring des offres
// (0-100) piloté par le PROFIL de recherche + filtre d'exclusions.
//
// Source de vérité de cette logique. Le workflow n8n 01 colle le contenu de ces
// fonctions dans un nœud Code (n8n n'importe pas de fichier externe). Garder
// synchronisé. Testé par offer-utils.test.mjs.
import { createHash } from "node:crypto";

/** Normalise une chaîne : minuscules, accents décomposés, espaces compactés. */
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
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
