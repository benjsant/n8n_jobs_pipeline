// Enrichissement entreprise GROUNDED : on résume une entreprise UNIQUEMENT à
// partir d'un texte source réel (description de l'offre, éventuellement contenu
// du site). Garde-fou : le modèle ne doit RIEN inventer — si une info n'est pas
// dans le texte, il laisse vide. Alimente companies.sector / companies.ai_summary.
//
// Pur (pas d'appel réseau) : construit les messages et parse la réponse.
// Testé par company-enrichment.test.mjs.

/**
 * Messages DeepSeek pour une fiche entreprise synthétique et factuelle.
 * @param {string} companyName
 * @param {string} sourceText  texte réel (offre + site) — seule source autorisée
 */
export function buildEnrichmentMessages(companyName, sourceText) {
  const system =
    "Tu produis une fiche entreprise SYNTHÉTIQUE à partir UNIQUEMENT du texte " +
    "fourni. Tu n'inventes RIEN : si une information n'est pas présente ou " +
    "déductible du texte, tu laisses la valeur vide (\"\"). Tu réponds " +
    "UNIQUEMENT en JSON valide au format {\"sector\":\"\",\"ai_summary\":\"\"}. " +
    "ai_summary : 1-2 phrases neutres, factuelles, sans superlatifs.";
  const user =
    `ENTREPRISE: ${companyName || "(inconnue)"}\n\n` +
    `TEXTE SOURCE (ne te sers QUE de ça):\n${String(sourceText || "").slice(0, 2000)}`;
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
  };
}

/** Parse la réponse ; toujours un objet { sector, ai_summary } (vides si KO). */
export function parseEnrichmentResponse(response) {
  let data;
  try {
    data = typeof response === "string" ? JSON.parse(response) : response;
  } catch {
    return { sector: "", ai_summary: "" };
  }
  return {
    sector: String(data?.sector ?? "").trim(),
    ai_summary: String(data?.ai_summary ?? "").trim(),
  };
}
