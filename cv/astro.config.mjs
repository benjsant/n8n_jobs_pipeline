import { defineConfig } from "astro/config";

// CV statique. La personnalisation par offre est injectée au build via la
// variable d'environnement CV_PERSONALIZATION (chemin d'un JSON), cf.
// src/pages/index.astro.
export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
});
