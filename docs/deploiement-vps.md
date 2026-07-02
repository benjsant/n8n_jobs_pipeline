# 🔐 Déploiement VPS privé (WireGuard + SSH durci)

Guide complet pour héberger **n8n_jobs_pipeline** sur un VPS **personnel**, non
exposé au public : accès à l'UI n8n **uniquement via WireGuard**, SSH durci
(port changé, clés only), pare-feu fermé par défaut.

> Principe : seuls **deux** ports sont ouverts au monde — le **SSH** (port
> custom) et le **WireGuard** (UDP). Tout le reste (n8n :5678, Postgres,
> services) n'écoute que sur le réseau privé WireGuard ou en local.

Distribution de référence : **Debian 12 / Ubuntu 22.04** (adapter `apt` au besoin).

---

## 0. Vue d'ensemble

```
[Ton PC] --(tunnel WireGuard 10.66.66.0/24)--> [VPS]
   • SSH sur port custom (ex. 49222), clés only
   • n8n UI sur http://10.66.66.1:5678  (privé, via le tunnel)
   • Discord ← (sortant) webhooks    |   liens d'action → http://10.66.66.1:5678 (cliqués depuis ton PC connecté au VPN)
   • DeepSeek / sources d'offres ← (sortant) internet
```

Ce qui est **public** : SSH (port custom) + WireGuard (UDP). Ce qui est **privé** :
n8n, Postgres, jobspy, render.

---

## 1. Première connexion + utilisateur non-root

```bash
ssh root@IP_DU_VPS                      # connexion initiale (port 22)
adduser benjamin                        # crée ton utilisateur
usermod -aG sudo benjamin               # droits sudo
# copie ta clé publique pour le nouvel utilisateur
rsync --archive --chown=benjamin:benjamin ~/.ssh /home/benjamin
```

Depuis ton PC, vérifie que tu peux te connecter en `benjamin` **par clé** avant
de durcir SSH :
```bash
ssh benjamin@IP_DU_VPS
```

## 2. Durcir SSH (changer le port, clés only)

Édite `/etc/ssh/sshd_config` (ou un fichier dans `/etc/ssh/sshd_config.d/`) :
```
Port 49222                 # choisis un port libre 1024-65535
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
```
Applique :
```bash
sudo systemctl restart ssh        # (ou sshd selon la distro)
```
⚠️ **Garde ta session actuelle ouverte** et teste la nouvelle dans un 2e terminal :
```bash
ssh -p 49222 benjamin@IP_DU_VPS
```
Tant que ça ne marche pas, ne ferme pas la session en cours.

## 3. Pare-feu (ufw) — fermé par défaut

```bash
sudo apt update && sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 49222/tcp           # ton SSH custom
sudo ufw allow 51820/udp           # WireGuard
sudo ufw enable
sudo ufw status verbose
```
> On n'ouvre **jamais** 5678 (n8n), 5432 (Postgres), 8000 (services) au public.

## 4. WireGuard (serveur sur le VPS)

```bash
sudo apt install -y wireguard
wg genkey | sudo tee /etc/wireguard/server.key | wg pubkey | sudo tee /etc/wireguard/server.pub
# côté client (sur ton PC) :
wg genkey | tee client.key | wg pubkey | tee client.pub
```

`/etc/wireguard/wg0.conf` (VPS) :
```ini
[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = <CONTENU de /etc/wireguard/server.key>

[Peer]
# ton PC
PublicKey = <CONTENU de client.pub>
AllowedIPs = 10.66.66.2/32
```

Active :
```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

Config **client** (ton PC), `wg0.conf` :
```ini
[Interface]
Address = 10.66.66.2/24
PrivateKey = <CONTENU de client.key>

[Peer]
PublicKey = <CONTENU de /etc/wireguard/server.pub côté VPS>
Endpoint = IP_DU_VPS:51820
AllowedIPs = 10.66.66.0/24          # uniquement le réseau privé (split tunnel)
PersistentKeepalive = 25
```
Monte le tunnel (`wg-quick up wg0` ou l'appli WireGuard), puis teste :
```bash
ping 10.66.66.1
```

## 5. Docker + Docker Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker benjamin     # se reconnecter ensuite
docker compose version
```

## 6. Cloner le projet + `.env`

```bash
git clone https://github.com/benjsant/n8n_jobs_pipeline.git
cd n8n_jobs_pipeline
cp .env.example .env
```
Génère les secrets locaux :
```bash
openssl rand -hex 32     # N8N_ENCRYPTION_KEY
openssl rand -base64 24  # POSTGRES_PASSWORD
openssl rand -base64 18  # N8N_BASIC_AUTH_PASSWORD
```
Dans `.env`, pour un accès **via WireGuard**, règle :
```ini
N8N_HOST=10.66.66.1
WEBHOOK_URL=http://10.66.66.1:5678/
```
> `WEBHOOK_URL` sert aux liens d'action (workflow `03` « Générer / Ignorer »
> postés dans Discord). Comme tu cliques ces liens **depuis ton PC connecté au
> tunnel**, l'IP WireGuard `10.66.66.1` est la bonne cible. Discord n'a pas
> besoin d'atteindre n8n (les webhooks Discord sont **sortants** depuis n8n).

Puis renseigne les clés API utiles (voir [installation.md](installation.md) §3 :
`DEEPSEEK_API_KEY`, une source `RAPIDAPI_KEY`/Adzuna/`SERPAPI_KEY`, FT, Discord…).

## 7. N'exposer n8n que sur le tunnel WireGuard

Par défaut le `docker-compose.yml` mappe `5678:5678` (toutes interfaces — pratique
en local). Sur le VPS, **bind le port sur l'IP WireGuard uniquement**. Crée un
`docker-compose.override.yml` (non versionné, propre au VPS) :
```yaml
services:
  n8n:
    ports:
      - "10.66.66.1:5678:5678"   # n8n joignable seulement via le tunnel
```
> Compose **fusionne** automatiquement `docker-compose.override.yml`. Combiné au
> pare-feu (5678 jamais ouvert), n8n est injoignable hors WireGuard.

Ajoute l'override au `.gitignore` local si tu ne veux pas le suivre :
```bash
echo "docker-compose.override.yml" >> .gitignore
```

## 8. Lancer la stack

```bash
docker compose config        # valide .env + override
docker compose up -d         # build jobspy + render (lourd au 1er run), démarre postgres + n8n
docker compose ps            # tout healthy ?
```
Accès UI (depuis ton PC, tunnel monté) : **http://10.66.66.1:5678**
(login basique = `N8N_BASIC_AUTH_USER` / `_PASSWORD`, ou compte owner au 1er lancement).

## 9. Importer les workflows + credentials

```bash
for f in 01-recherche-offres 02-agent-candidature 03-statut-offre 04-candidature-finalisation; do
  docker exec job-hunter-n8n n8n import:workflow --input=/workflows/$f.json
done
```
Puis dans l'UI (cf. [workflows/README.md](https://github.com/benjsant/n8n_jobs_pipeline/blob/main/workflows/README.md)) :
1. **Credential Postgres** « Postgres job-hunter » → host `postgres`, port `5432`,
   base/user/mot de passe = ceux du `.env` ; l'associer aux nœuds `REMPLACER`.
2. **Credentials Google** (Drive + Gmail OAuth2) dans le `04` — voir §11.
3. Activer les workflows voulus (importés inactifs).

## 10. Tester le pipeline

```bash
just test                                  # suites hors stack (sanity)
python3 scripts/test_deepseek.py           # agent réel (DEEPSEEK_API_KEY requis)
```
Puis, dans l'UI, exécuter `01` manuellement (offres collectées + scorées en base),
puis `02` (CV/lettre PDF dans `./output/`).

## 11. Google OAuth (Drive + Gmail) pour le `04`

L'OAuth Google a besoin d'une URL de redirection que Google doit accepter.
Sur un setup WireGuard privé, deux options :
- **Tunnel temporaire le temps du consentement** : exposer n8n via un domaine
  HTTPS le temps de cliquer « Autoriser », puis revenir au binding privé. n8n
  affiche l'URL de redirection à déclarer dans la console Google Cloud.
- **Reverse-proxy HTTPS** (Caddy/Traefik) sur un sous-domaine, accessible
  seulement via WireGuard, avec un certificat (DNS-01) — plus avancé.

Scopes : Drive (fichiers) + Gmail (création de brouillon). **Garde-fou** : le `04`
crée un **brouillon**, jamais d'envoi automatique.

## 12. Sauvegardes & mises à jour

```bash
# Sauvegarde de la base (workflows n8n + données métier)
docker exec job-hunter-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > backup-$(date +%F).sql.gz

# Mise à jour du code
git pull && docker compose up -d --build
```
Volumes à préserver : `postgres_data`, `n8n_data`. Ne change **jamais**
`N8N_ENCRYPTION_KEY` après coup (sinon credentials illisibles).

---

## ✅ Checklist sécurité

- [ ] SSH sur port custom, `PermitRootLogin no`, `PasswordAuthentication no`.
- [ ] `ufw` : seuls SSH (custom) + WireGuard (51820/udp) ouverts.
- [ ] n8n bindé sur l'IP WireGuard (`docker-compose.override.yml`), jamais `0.0.0.0:5678`.
- [ ] `.env` présent sur le VPS, **jamais** commité (vérifié par le hook anti-fuite).
- [ ] `WEBHOOK_URL` = IP WireGuard (liens d'action cliqués via le tunnel).
- [ ] Postgres / jobspy / render **non** exposés (pas de `ports:` publics).
- [ ] Sauvegarde `pg_dump` planifiée (cron).
- [ ] Mêmes secrets `N8N_ENCRYPTION_KEY` conservés entre redéploiements.

## Dépannage

| Symptôme | Piste |
|---|---|
| UI n8n inaccessible | tunnel WireGuard monté ? `ping 10.66.66.1` ; binding override appliqué ? `docker compose ps` |
| Liens « Générer/Ignorer » morts | `WEBHOOK_URL` = IP WireGuard ; être connecté au tunnel en cliquant |
| OAuth Google refuse l'URL | l'URL de redirection déclarée dans Google Cloud doit matcher celle affichée par n8n (§11) |
| Verrouillé hors SSH | console/KVM du fournisseur VPS pour rétablir `sshd_config`/`ufw` |
