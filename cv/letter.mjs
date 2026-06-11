// Rendu de la lettre de motivation -> HTML A4 (puis PDF via render-letter.mjs).
//
// La lettre TEXTE est produite par l'agent DeepSeek (champ `lettre_motivation`,
// cf. system prompt §6) à partir d'un template de assets/letters/. Ici on ne
// fait QUE la mise en page : on n'invente ni ne reformule rien.

const escape = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Découpe le corps en paragraphes (double saut = paragraphe, simple = <br>). */
function paragraphs(body) {
  const text = String(body ?? "").trim();
  if (!text) return "";
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((b) => `<p>${escape(b).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Construit le document HTML complet de la lettre.
 * @param {object} data
 *   - candidate: { name, email, phone, location }
 *   - company:   string (destinataire)
 *   - date:      string (optionnel, ex. "Lyon, le 11 juin 2026")
 *   - subject:   string (objet)
 *   - body:      string (texte de la lettre, sauts de ligne en \n)
 */
export function buildLetterHtml(data = {}) {
  const c = data.candidate ?? {};
  const contact = [c.email, c.phone, c.location].filter(Boolean).map(escape).join(" · ");
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Lettre de motivation${c.name ? ` — ${escape(c.name)}` : ""}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: "Inter","Helvetica Neue",Arial,sans-serif; color: #1f2329; font-size: 11pt; line-height: 1.5; }
      .page { width: 210mm; min-height: 297mm; padding: 22mm 24mm; margin: 0 auto; background: #fff; }
      .sender { font-weight: 600; }
      .sender .contact { font-weight: 400; color: #5c6670; font-size: 9.5pt; }
      .recipient { margin-top: 18px; }
      .date { margin-top: 18px; color: #5c6670; }
      .subject { margin-top: 18px; font-weight: 600; }
      .body { margin-top: 14px; }
      .body p { margin: 0 0 10px; text-align: justify; }
      .sign { margin-top: 22px; }
      @page { size: A4; margin: 0; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="sender">
        ${escape(c.name) || "[Nom]"}
        ${contact ? `<div class="contact">${contact}</div>` : ""}
      </div>
      ${data.company ? `<div class="recipient">À l'attention de ${escape(data.company)}</div>` : ""}
      ${data.date ? `<div class="date">${escape(data.date)}</div>` : ""}
      ${data.subject ? `<div class="subject">Objet : ${escape(data.subject)}</div>` : ""}
      <div class="body">
        ${paragraphs(data.body)}
      </div>
      <div class="sign">${escape(c.name) || ""}</div>
    </main>
  </body>
</html>`;
}
