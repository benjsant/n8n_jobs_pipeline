// Scoring hybride : le score déterministe (offer-utils.scoreOffer) sert de
// pré-filtre cheap sur TOUTES les offres ; on ne fait affiner par le LLM que le
// top-N, pour un score de pertinence nuancé + une justification.
//
// Pur (pas d'appel réseau ici) : construit les messages et fusionne la réponse.
// Testé par llm-scoring.test.mjs. Dans n8n : nœuds Code (construction / fusion)
// autour d'un nœud HTTP DeepSeek.

const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Garde les N meilleures offres selon le score déterministe (tri stable desc). */
export function selectTopN(offers, n = 20) {
  return [...offers]
    .map((o, i) => ({ o, i }))
    .sort((a, b) => (b.o.score ?? 0) - (a.o.score ?? 0) || a.i - b.i)
    .slice(0, n)
    .map(({ o }) => o);
}

/**
 * Construit les messages DeepSeek pour scorer un lot d'offres vis-à-vis d'un
 * profil de recherche, avec ses critères `must_have` / `exclusions` (barème
 * inspiré du pipeline Make réel). Retour prêt pour /chat/completions.
 * @param {object|string} profile  { must_have, exclusions } (ou un texte libre)
 * @param {object[]} offers        offres (title, company, location, description)
 */
export function buildScoringMessages(profile, offers) {
  const p = typeof profile === "string" ? { must_have: profile, exclusions: "" } : (profile || {});
  const system =
    "Tu es un expert en recrutement qui évalue la PERTINENCE d'offres d'emploi " +
    "pour un profil donné. Barème : 90-100 = correspond très bien aux critères " +
    "indispensables et aucune exclusion ; 50-89 = correspond partiellement ; " +
    "moins de 50 = hors sujet ou contient un critère d'exclusion. Tu réponds " +
    "UNIQUEMENT en JSON valide, sans texte autour, au format " +
    "{\"scores\":[{\"i\":<index>,\"score\":<0-100>,\"reason\":\"<une phrase>\"}]}. " +
    "N'invente rien.";
  const list = offers
    .map((o, i) =>
      `#${i} — ${o.title || "?"} @ ${o.company || "?"} (${o.location || "?"})\n` +
      `${String(o.description || "").slice(0, 600)}`,
    )
    .join("\n\n");
  const user =
    `Critères indispensables recherchés : ${p.must_have || "(non précisés)"}\n` +
    `Critères d'exclusion (à pénaliser fortement) : ${p.exclusions || "(aucun)"}\n\n` +
    `OFFRES À SCORER (renvoie un score par index):\n${list}`;
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
}

/**
 * Fusionne la réponse LLM dans les offres : ajoute `score` (= score LLM) et
 * `score_reason`. Robuste : si la réponse est invalide ou une offre n'a pas de
 * score LLM, on conserve le score déterministe existant.
 * @param {string|object} response  contenu JSON renvoyé par le modèle
 * @param {object[]} offers         le MÊME lot que celui passé à buildScoringMessages
 */
export function parseScoringResponse(response, offers) {
  let data;
  try {
    data = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    return offers.map((o) => ({ ...o })); // réponse illisible -> on garde tout
  }
  const byIndex = new Map();
  for (const s of data?.scores ?? []) {
    if (s && Number.isInteger(s.i)) byIndex.set(s.i, s);
  }
  return offers.map((o, i) => {
    const s = byIndex.get(i);
    if (!s || s.score == null) return { ...o }; // pas de score LLM -> fallback
    return { ...o, score: clamp(s.score), score_reason: String(s.reason ?? "") };
  });
}
