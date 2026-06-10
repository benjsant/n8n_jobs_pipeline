# assets/ — modèles de lettre

Sources documentaires versionnées (génériques, sans données perso) utilisées par
l'agent DeepSeek pour personnaliser les candidatures.

```
assets/
└── letters/   # modèles de lettres de motivation, typés (voir letters/README.md)
```

- Le **CV maître** ne vit plus ici : il est à la racine dans `cv/` (template
  Astro + données structurées). Voir `cv/README.md`.
- Les **modèles génériques** (sans données perso) sont versionnés.
- Les documents **générés** (CV/lettres remplis, PDF) contiennent des données
  personnelles : ils ne sont pas versionnés (cf. `.gitignore`) et sont archivés
  sur Google Drive. Vérifie avant de committer.
- Comportement de l'agent : voir `prompts/agent-system-prompt.md`.
