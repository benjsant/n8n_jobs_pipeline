# services/jobspy — micro-service JobSpy

Expose [python-jobspy](https://github.com/cullenwatson/JobSpy) en HTTP pour que
n8n agrège LinkedIn / Indeed / Glassdoor sans Python embarqué dans n8n (Tâche 5).

## Endpoints

- `GET /health` → `{"status": "ok"}`
- `GET /search` → offres normalisées (mêmes champs que la table `offers`) :
  - `term` (requis) : mots-clés
  - `location` (défaut `France`), `results` (1-200, défaut 50)
  - `hours_old` (défaut 72), `country_indeed` (défaut `France`)
  - `sites` : liste séparée par des virgules (défaut `indeed,linkedin,glassdoor`)

Exemple : `GET /search?term=développeur%20IA&location=Lyon&results=30`

Réponse :
```json
{ "count": 12, "offers": [ { "source": "jobspy:indeed", "title": "...", "company": "...", "location": "...", "url": "...", "description": "..." } ] }
```

Le `hash` de dédup et le `score` sont calculés côté workflow n8n, pas ici.

## Lancer

Via la stack : `docker compose up -d jobspy` (n8n l'atteint sur
`http://jobspy:8000`, cf. `JOBSPY_API_URL`).

En local pour debug :
```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

## Tests

```bash
python -m pytest test_app.py        # ou : python test_app.py
```
Les tests couvrent `/health` et la normalisation **sans** appeler les boards
externes (import `jobspy` paresseux).

## ⚠️ Notes

- LinkedIn via JobSpy peut être rate-limité / nécessiter des proxies ; Indeed et
  Glassdoor sont plus fiables sans proxy.
- Respecter les CGU des plateformes et un volume de requêtes raisonnable.
