# Rendu CV → PDF, entièrement conteneurisé.
# Image Playwright officielle : Node + Chromium déjà installés (pas de
# téléchargement de navigateur sur l'hôte).
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app

# Dépendances d'abord (cache de build)
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Le reste du projet CV (template, données, scripts)
COPY . .

# Au run : build du HTML (avec personnalisation éventuelle) puis export PDF.
# CV_PERSONALIZATION = chemin (dans le conteneur) du JSON produit par l'agent.
# Le PDF sort dans /app/dist/cv.pdf — monter un volume pour le récupérer.
CMD ["sh", "-c", "npm run build && npm run pdf"]
