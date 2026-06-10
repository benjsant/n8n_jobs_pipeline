// Logique partagée : déduplication (hash) + scoring des offres (0-100).
//
// Source de vérité de cette logique. Le workflow n8n 01 colle le contenu de
// `computeHash` et `scoreOffer` dans un nœud Code (n8n n'importe pas de fichier
// externe). Garder les deux synchronisés. Testé par offer-utils.test.mjs.
import { createHash } from "node:crypto";

/** Normalise une chaîne pour le hash/scoring : minuscules, espaces compactés. */
export function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hash de déduplication : SHA256(title + company + location). */
export function computeHash(offer) {
  const key = [offer.title, offer.company, offer.location].map(norm).join("|");
  return createHash("sha256").update(key).digest("hex");
}

// Préférences candidat par défaut (alignées sur le profil / system prompt).
export const DEFAULT_PREFS = {
  keywords: ["ia", "intelligence artificielle", "ml", "machine learning",
    "data", "llm", "python", "développeur", "developpeur"],
  juniorTerms: ["junior", "débutant", "debutant", "alternance", "apprenti",
    "stage", "stagiaire", "entry level"],
  seniorTerms: ["senior", "confirmé", "confirme", "lead", "principal",
    "5 ans", "expérimenté", "experimente"],
  remoteTerms: ["télétravail", "teletravail", "remote", "hybride", "distanciel"],
  goodContracts: ["cdi", "alternance", "cdd", "apprentissage"],
  preferredLocations: ["lyon", "remote", "télétravail", "teletravail", "france"],
};

/**
 * Score une offre sur 0-100 selon l'adéquation au profil.
 * Pondération (somme = 100) :
 *   technos/mots-clés 35 · niveau junior 25 · télétravail 15 ·
 *   localisation 10 · type de contrat 10 · salaire renseigné 5
 */
export function scoreOffer(offer, prefs = DEFAULT_PREFS) {
  const hay = norm(`${offer.title} ${offer.description} ${offer.contract_type}`);
  const loc = norm(offer.location);
  let score = 0;

  // Technos / mots-clés (35) : proportionnel au nombre de mots-clés présents.
  const hits = prefs.keywords.filter((k) => hay.includes(norm(k))).length;
  score += Math.min(35, hits * 9);

  // Niveau junior (25) : bonus si termes junior, malus si termes senior.
  const isJunior = prefs.juniorTerms.some((t) => hay.includes(norm(t)));
  const isSenior = prefs.seniorTerms.some((t) => hay.includes(norm(t)));
  if (isJunior && !isSenior) score += 25;
  else if (!isSenior) score += 12; // neutre = demi-bonus
  // (senior sans junior = 0)

  // Télétravail (15)
  if (prefs.remoteTerms.some((t) => hay.includes(norm(t)) || loc.includes(norm(t)))) {
    score += 15;
  }

  // Localisation préférée (10)
  if (prefs.preferredLocations.some((l) => loc.includes(norm(l)))) score += 10;

  // Type de contrat (10)
  if (prefs.goodContracts.some((c) => hay.includes(norm(c)))) score += 10;

  // Salaire renseigné (5)
  if (norm(offer.salary)) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Annoter une offre avec son hash et son score. */
export function annotate(offer, prefs = DEFAULT_PREFS) {
  return { ...offer, hash: computeHash(offer), score: scoreOffer(offer, prefs) };
}
