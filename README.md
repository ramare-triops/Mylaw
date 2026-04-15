# Mylex

**Mylex** est un atelier personnel d'outils juridiques pour avocat. Application web offline-first, modulaire, pilotée par l'IA.

## Stack technique

- **Framework** : Next.js 14+ (App Router)
- **Langage** : TypeScript strict
- **Style** : Tailwind CSS + CSS variables
- **Éditeur** : TipTap
- **Persistance locale** : IndexedDB via Dexie.js
- **IA** : OpenAI GPT-4o via Vercel AI SDK

## Installation

```bash
npm install
cp .env.local.example .env.local
# Éditer .env.local avec votre clé OpenAI
npm run dev
```

## Architecture

```
app/                     # Next.js App Router
├── page.tsx             # Dashboard
├── tools/               # Bibliothèque et vues d'outils
├── documents/           # Gestion documentaire
├── templates/           # Modèles
├── ai/                  # Interface IA standalone
├── settings/            # Configuration
└── api/                 # Routes API (IA, export...)

components/              # Composants React
├── layout/              # Sidebar, Topbar, layout global
├── editor/              # Éditeur TipTap
├── tools/               # Modules d'outils
└── ui/                  # Primitives UI (Radix)

lib/                     # Logique métier
├── db.ts                # Schéma Dexie.js
├── tools-registry.ts    # Registre des outils
├── ai-context.ts        # Contexte IA
└── utils.ts             # Utilitaires

hooks/                   # Hooks React custom
types/                   # Types TypeScript
```

## Feuille de route

### Phase 1 — MVP ✅
- Layout principal (sidebar + topbar)
- Persistance IndexedDB + restauration de session
- Éditeur de document (TipTap) avec auto-save
- Système de modèles + variables
- Export DOCX
- Outil Notes
- Outil Deadline Tracker
- Snippet Expander

### Phase 2 — IA & Documents
- Panel IA flottant (OpenAI streaming)
- Analyse de document importé
- Reformulation & transformation IA
- Calculateur de délais

### Phase 3 — Outils avancés
- Mode Préparation d'audience
- Détecteur de conflits d'intérêts
- Timeline des faits
- Suivi de temps

## Conventions

- **Commits** : Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`)
- **Composants** : un fichier = un composant, PascalCase
- **Hooks** : préfixe `use`, dans `hooks/`
- **API Routes** : validation Zod sur tous les inputs
