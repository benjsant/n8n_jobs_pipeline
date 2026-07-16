# Audit d'optimisation (15 juillet 2026)

Périmètre : la stack Docker du pipeline (Candid n'a encore ni API ni conteneur).
Méthode : audit **statique** (code, compose, Dockerfiles) + **données réelles**
du dump PostgreSQL du 12/07. La stack étant éteinte, la RAM est estimée d'après
les composants ; les chiffres à mesurer en marche sont signalés.

## Constat central, chiffré

Le dump du 12/07 (3,3 Mo de données) se répartit ainsi :

| Table | Lignes | Poids | Part |
|---|---:|---:|---:|
| `execution_data` (historique n8n) | 21 | 2,8 Mo | **85 %** |
| `offers` (tes données métier) | 72 | 106 Ko | 3 % |
| `companies` | 123 | 14 Ko | <1 % |
| le reste (n8n interne, profils…) | | ~400 Ko | 12 % |

**La base est à 85 % de l'historique d'exécutions n8n**, soit ~135 Ko par
exécution (le workflow 01 fait transiter toutes les offres par 26 nœuds, et
n8n sérialise l'état complet à chaque étape). Les données métier sont
minuscules. C'est LE levier de stockage ; tout le reste est marginal à côté.

À l'inverse, **le coût API est déjà bien conçu** : scoring LLM en un seul appel
groupé quotidien sur le top 20 (pré-filtre déterministe gratuit avant), agent
sur déclenchement humain uniquement (2 à 4 appels par candidature), grounding
via deux API gratuites (recherche-entreprises.api.gouv.fr, DuckDuckGo HTML),
dédup par embeddings **locaux**. Il n'y a pas de gaspillage d'API à corriger,
seulement une optimisation de cache à saisir.

## Priorité 1 : quick wins (une ligne de compose chacun)

### 1a. Borner l'historique d'exécutions n8n

Aucun réglage `EXECUTIONS_*` dans le compose : n8n applique ses défauts
(purge à 14 jours, sauvegarde de TOUTES les exécutions réussies avec leur
payload complet). Pour un pipeline qui tourne tous les jours à 8h :

```yaml
# service n8n, environment :
EXECUTIONS_DATA_SAVE_ON_SUCCESS: none    # ne garder que les échecs (à déboguer)
EXECUTIONS_DATA_SAVE_ON_ERROR: all
EXECUTIONS_DATA_PRUNE: "true"
EXECUTIONS_DATA_MAX_AGE: "168"           # 7 jours suffisent pour déboguer
```

Effet : la table qui pèse 85 % de la base cesse de croître avec les succès.
Compromis : on perd le rejeu visuel des exécutions réussies dans l'UI n8n
(les logs Discord jobs-log couvrent déjà le suivi quotidien). Alternative
douce si tu veux garder quelques succès : `EXECUTIONS_DATA_MAX_AGE: "72"`
sans toucher à `SAVE_ON_SUCCESS`.

### 1b. Rotation des logs Docker

Aucune section `logging:` dans le compose : les logs json de chaque conteneur
croissent sans limite sur le disque (classique VPS plein au bout de six mois).

```yaml
# à la racine du compose, puis référencé par service (anchor YAML) :
x-logging: &logging
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "3" }
```

### 1c. Limites mémoire par service

Aucun `mem_limit` : un emballement d'un seul service (Chromium, pandas) peut
étouffer un VPS 2 Go. Valeurs de départ raisonnables, à ajuster après mesure :

```yaml
postgres: 512m · n8n: 768m · render: 768m · embeddings: 640m
agent-langgraph: 512m · jobspy: 512m · cleanup: 32m
```

## Priorité 2 : RAM au repos (à mesurer, estimations argumentées)

Estimation de la RAM résidente à froid, service par service :

| Service | Estimation repos | Pourquoi |
|---|---|---|
| n8n | 400-600 Mo | runtime Node + workflows chargés |
| render | 300-500 Mo | **Chromium persistant jamais fermé** (`browserPromise` réutilisé, jamais `close()`) + Node |
| embeddings | 350-500 Mo | **modèle ONNX chargé à l'import**, résident 24h/24 pour ~1 usage/jour |
| jobspy | 150-300 Mo | pandas + jobspy (import paresseux : léger jusqu'au 1er /search, lourd ensuite) |
| agent-langgraph | 200-300 Mo | langchain + langgraph + FastAPI |
| postgres | 100-200 Mo | défauts pg16, adaptés à cette volumétrie |
| cleanup | ~5 Mo | boucle sh + sleep |

Total estimé au repos : **1,5 à 2,4 Go**. Confortable sur ta machine, tendu
sur un VPS 2 Go. Deux gisements réels :

### 2a. `embeddings` : charger le modèle à la demande

Le modèle multilingue MiniLM est chargé au démarrage du module
(`_model = TextEmbedding(...)` au niveau module) et reste résident en
permanence, alors qu'il sert quelques secondes par jour (dédup du 01 à 8h).
Passer en chargement paresseux avec déchargement après inactivité :

```python
# esquisse : _model devient un cache avec TTL
_model, _last_use = None, 0.0
def _get_model():
    global _model, _last_use
    if _model is None:
        _model = TextEmbedding(MODEL_NAME, cache_dir=CACHE_DIR)
    _last_use = time.monotonic()
    return _model
# tâche de fond : si time.monotonic() - _last_use > 900 s -> _model = None ; gc
```

Gain : ~400 Mo libérés 23h50 par jour. Coût : ~5-10 s de latence au premier
/embed du matin (invisible, c'est un cron). Variante encore plus simple :
tester la déclinaison **quantifiée int8** du modèle dans fastembed (moitié
de RAM, précision quasi identique pour de la dédup à seuil 0,80 : le seuil a
été calibré large exprès).

### 2b. `render` : fermer Chromium après inactivité

`getBrowser()` lance Chromium au premier PDF et ne le ferme jamais : 200-400 Mo
résident pour quelques rendus par jour. Même motif que 2a : timer d'inactivité
(10-15 min) qui fait `browser.close()` et remet la promesse à null ; relance
paresseuse au rendu suivant (~1-2 s de latence, imperceptible). À combiner
avec la sérialisation déjà en place.

### 2c. Micro : le conteneur `cleanup`

Un conteneur entier pour un `find` quotidien. Négligeable en RAM (~5 Mo), mais
si tu veux épurer : un `cron` hôte ou un label systemd-timer fait pareil sans
conteneur. À ne faire que par goût, le gain est cosmétique.

## Priorité 3 : appels API (déjà sain, une optimisation à saisir)

### 3a. Ordre des messages de l'agent : exploiter le cache DeepSeek

DeepSeek applique un **cache de préfixe automatique** (tokens en cache ~10 fois
moins chers, réponse plus rapide). Le cache ne vaut que pour un préfixe
byte-identique. Or `build_user_message()` construit :

```
[offre variable] → [description variable] → [cv_index STABLE en dernier]
```

Le bloc stable (cv_index, ~plusieurs Ko) est placé APRÈS le contenu variable :
il n'est jamais servi depuis le cache, ni entre les 2 appels d'une même
candidature (analyze puis accroche), ni entre candidatures. Inverser l'ordre :

```
system prompt (stable) → cv_index (stable) → offre (variable) → tâche
```

Gain : le préfixe stable (system prompt + cv_index, la majorité des tokens
d'entrée) est facturé au tarif cache dès le 2e appel. À volume personnel le
gain en euros est petit, mais c'est structurel, gratuit à faire, et la même
règle est déjà actée pour Candid (TASKS étape 4) : autant que les deux
implémentations racontent la même histoire.

### 3b. `hours_old` de JobSpy : 72h par défaut pour une collecte quotidienne

Le 01 tourne chaque jour mais demande 72h d'offres : chaque offre est
re-scrapée ~3 fois puis rejetée par la dédup. Ce n'est pas un coût d'API
(scraping), mais du temps d'exécution et du risque de blocage inutiles.
Passer à 48h garde une marge de recouvrement (jour raté) en réduisant d'un
tiers le volume scrapé. Ne pas descendre à 24h : un raté de cron = un trou.

### 3c. Ce qui est déjà bien (à ne pas toucher)

- Scoring hybride : pré-filtre déterministe gratuit, LLM seulement sur le
  top 20, **en un seul appel groupé** (pas un appel par offre).
- Juge de l'accroche déterministe (regex), pas un LLM-judge : les 3 tentatives
  max ne coûtent que les régénérations réellement nécessaires.
- Grounding entreprise sur API gratuites, embeddings locaux, Discord gratuit.
- Séparation analyze (temp 0,2) / accroche (temp 0,7) : deux appels au lieu
  d'un, mais c'est un choix de qualité délibéré, pas du gaspillage.

## Priorité 4 : stockage secondaire

- **Purge des offres ignorées** : chaque offre garde description complète +
  vecteur 384d (~1,5 Ko + index HNSW). À 100-200 offres/jour, compter
  ~50-100 Mo/an. Un `DELETE FROM offers WHERE status='ignored' AND created_at
  < now() - interval '90 days'` (ou juste `UPDATE ... SET embedding=NULL,
  description=''`) en tâche mensuelle borne ça. Pas urgent, à poser avant le
  passage VPS.
- **Images Docker** : l'image render (base Playwright jammy) pèse ~2 Go à elle
  seule, embeddings embarque le modèle (~500 Mo), c'est le prix de l'hors-ligne
  et c'est assumé. Le vrai gaspillage est le **cache de build** qui s'accumule :
  un `docker builder prune -f` après chaque campagne de rebuild, et
  `docker image prune` après les mises à jour d'images.
- **Sauvegardes** : le dump pg_dump fait 3,3 Mo aujourd'hui ; avec 1a appliqué
  il restera durablement petit. Une rotation simple (7 quotidiennes) suffit.

## Ce qui doit être mesuré en marche (non vérifiable stack éteinte)

1. `docker stats --no-stream` au repos puis pendant un run du 01 : valide les
   estimations RAM et cale les `mem_limit` définitifs.
2. `docker system df` : poids réel images + cache de build.
3. Durée du run quotidien du 01 avant/après le passage `hours_old` 72→48.
4. `usage` retourné par DeepSeek avant/après la réorganisation 3a
   (`prompt_cache_hit_tokens` dans la réponse) : preuve chiffrée du cache.

## Ordre d'exécution conseillé

1. **1a + 1b + 1c** : trois blocs YAML, dix minutes, aucun risque, règle le
   levier n°1 (85 % de la base) et les deux fuites lentes classiques (logs,
   OOM). À faire avant la remise en route de la stack (sur ce PC ou l'autre).
2. **3a** : réordonner `build_user_message` (+ mise à jour des tests de parité).
3. **2a puis 2b** : chargement paresseux embeddings, puis fermeture Chromium.
4. **3b, 4** : au fil de l'eau.
