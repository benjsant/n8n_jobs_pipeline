# Rendu CV → PDF, entièrement conteneurisé.
# Image Playwright officielle : Node + Chromium déjà installés (pas de
# téléchargement de navigateur sur l'hôte).
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Le navigateur est DÉJÀ dans l'image de base : on bloque le téléchargement que
# le postinstall de `playwright` tente sinon (long + fait échouer npm sur cette
# image node22/npm10 : « Exit handler never called! »).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# npm 10.9.0 de l'image plante en fin d'install (« Exit handler never called! »,
# bug node22/npm10). On épingle une version stable avant d'installer.
COPY package.json package-lock.json* ./
RUN npm install -g npm@10.8.2 \
 && npm install --no-audit --no-fund

# Le reste du projet CV (template, données, scripts)
COPY . .

# Au run : build du HTML (avec personnalisation éventuelle) puis export PDF.
# CV_PERSONALIZATION = chemin (dans le conteneur) du JSON produit par l'agent.
# Le PDF sort dans /app/dist/cv.pdf — monter un volume pour le récupérer.
CMD ["sh", "-c", "npm run build && npm run pdf"]
