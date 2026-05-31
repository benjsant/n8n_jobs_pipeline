# assets/ — CV et modèles de lettre

Sources documentaires utilisées par l'agent DeepSeek pour personnaliser les
candidatures (prévu, pas encore branché dans un workflow).

```
assets/
├── cv/        # CV du candidat (formats source : .md, .docx, .pdf)
└── lettres/   # modèles / exemples de lettres de motivation
```

- Les **modèles génériques** (sans données perso sensibles) peuvent être versionnés.
- Le **CV réel** et les lettres contenant des données personnelles sont des
  données perso : les PDF et le dossier `candidatures/` sont déjà ignorés par
  `.gitignore`. Vérifie avant de committer.
- L'agent (voir `prompts/agent-system-prompt.md`) s'appuiera sur ces fichiers
  pour adapter le CV et rédiger la lettre par entreprise.
