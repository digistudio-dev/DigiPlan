# Architecture de DigiPlan

## Vue d’ensemble

```
┌───────────────────────────── Processus principal (Node / Electron) ─────────────────────────────┐
│ index.ts         cycle de vie, instance unique, démarrage des tâches de fond                    │
│ window.ts        fenêtre sécurisée (contextIsolation, sandbox, CSP, navigation bloquée)         │
│ ipc/registry.ts  enregistrement des canaux : validation Zod, erreurs traduites, journalisation  │
│ ipc/handlers.ts  branchement canaux → services (contrôle Pro côté principal)                    │
│ db/              SQLite (better-sqlite3) + Drizzle, migrations SQL versionnées                   │
│ services/        métier : rendez-vous, clients, paiements, rapports, sauvegardes, rappels…      │
│ integrations/    WhatsApp (whatsapp-web.js), Google Calendar (OAuth loopback + REST)            │
│ license/         vérification des codes (empreintes HMAC), état signé par poste                 │
└──────────────────────────────────────────▲──────────────────────────────────────────────────────┘
                                           │ IPC typé (invoke / événements), canaux en liste blanche
┌──────────────────────────────────────────┴──────────────── preload (sandbox) ───────────────────┐
│ window.digiplan.invoke(canal, entrée) · window.digiplan.on(événement, écouteur)                 │
└──────────────────────────────────────────▲──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────┴──────────────── Interface (React) ───────────────────┐
│ lib/api.ts       client typé ; lib/queries.ts TanStack Query + invalidation par événements      │
│ stores/ui.ts     Zustand : navigation, panneaux, dialogues                                     │
│ features/*       écrans (tableau de bord, calendrier, clients, prestations, équipe…)            │
│ components/      design system (Radix + Tailwind), dialogues, graphiques                       │
│ i18n/fr.ts       dictionnaire typé (ajout futur : ar.ts, en.ts)                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
                     src/shared : types, contrat IPC, catégories, logique métier pure
```

## Arborescence

```
src/
  main/            processus principal
  preload/         pont sécurisé
  renderer/        interface React (Vite)
  shared/          code partagé et testable sans Electron
    categories.ts      moteur de configuration par activité
    terminology.ts     terminologie + accords grammaticaux (un/une, nouveau/nouvelle…)
    ipc.ts             contrat IPC (schémas Zod d’entrée + types de sortie)
    domain/            disponibilités, récurrence, rappels, prix/soldes, téléphone, montants, sauvegardes
drizzle/           migrations SQL (embarquées dans l’installateur)
tests/             tests unitaires (Vitest)
scripts/e2e/       scénarios de bout en bout (Playwright + Electron)
build/             icônes et personnalisation de l’installateur
resources/         logos et icône d’exécution
docs/              documentation (docs/private exclu de Git)
```

## Configuration par activité

`src/shared/categories.ts` décrit chaque activité (`BusinessCategoryConfig`) : libellés (client, équipe, prestation, ressource) avec genre grammatical, prestations proposées, ressources suggérées, durée et pas de créneau, indicateurs et panneaux du tableau de bord, fonctionnalités (passage sans rendez-vous, salle d’attente, champs patient…), étiquettes et catégories de dépenses.

L’interface ne contient aucun `if (categorie === …)` : elle consomme `useApp()` → `{ category, terms }`.
**Ajouter une activité** = ajouter une entrée dans `CATEGORIES` et son identifiant dans `CategoryId` / `CATEGORY_ORDER`.
Le propriétaire peut personnaliser les termes dans **Paramètres → Général**.

## Base de données

SQLite en mode WAL, `foreign_keys = ON`. Identifiants UUID, montants en centimes (entiers), instants en millisecondes.

| Table | Rôle |
|---|---|
| `business_settings` | profil de l’établissement (ligne unique), activité, terminologie personnalisée |
| `settings` | paramètres JSON (application, Google, sauvegardes, séquence de reçus…) |
| `staff`, `staff_services` | équipe et prestations assignées |
| `working_hours`, `staff_breaks` | horaires et pauses (`staff_id` NULL = établissement) |
| `clients`, `client_tags` | fiches et étiquettes ; `search_text` normalisé pour la recherche |
| `service_categories`, `services` | catalogue (durée, prix, couleur, tampons) |
| `resources` | fauteuils, cabines, salles (Pro) |
| `appointments`, `appointment_services` | rendez-vous ; lignes avec copie du nom/prix (historique fiable) |
| `appointment_series` | séries récurrentes |
| `payments` | grand livre ; n° de reçu unique `R2026-00001` ; annulation logique |
| `reminders` | rappels WhatsApp : `dedupe_key` unique, statut, tentatives, erreurs |
| `message_templates` | modèles de messages |
| `expenses` | dépenses (Pro), suppression logique |
| `licenses` | activation Pro signée |
| `activity_logs` | traçabilité des actions métier |

Suppressions : les éléments ayant un historique sont **archivés** (équipe, prestations, clients) ; les rendez-vous sont supprimés logiquement et jamais s’ils ont des paiements ; les paiements sont **annulés**, jamais effacés.

Nouvelle migration : modifier `src/main/db/schema.ts` puis `npm run db:generate`. Les migrations sont appliquées automatiquement au démarrage (y compris sur une sauvegarde restaurée plus ancienne).

## Moteur de disponibilité

`src/shared/domain/availability.ts` — fonctions pures :
- `checkSlot(début, fin, contexte)` → liste de conflits (fermeture, hors horaires, pause, chevauchement équipe, ressource occupée, créneau passé), chacun **bloquant** ou simple **avertissement** ;
- `findAvailableSlots(jour, durée, pas, contexte)` → créneaux libres.

Les temps tampons (préparation / battement) élargissent la zone occupée. Les chevauchements peuvent être autorisés (paramètre), jamais pour une ressource.

## Rappels WhatsApp

`src/shared/domain/reminders.ts` (logique pure, testée) + `src/main/services/reminders.ts` (stockage SQLite) :
- un rappel est planifié par rendez-vous (`dedupe_key = rdv:rappel:début:délai`, unique) ;
- toute modification du rendez-vous recalcule le rappel (annulation de l’ancien, réactivation si l’horaire redevient identique, jamais de renvoi d’un rappel déjà envoyé) ;
- un cycle toutes les 30 s : décision *attendre / envoyer / ignorer* ; prise atomique `scheduled → sending` (anti-doublon) ; 3 tentatives maximum ;
- reprise après redémarrage : envoi en retard seulement s’il reste au moins *N* minutes avant le rendez-vous (paramétrable), jamais après le début ; un envoi interrompu n’est jamais renvoyé automatiquement (risque de doublon) ;
- historique complet : programmé, envoyé, échec, ignoré, horodatage, erreur.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` ; preload minimal à liste blanche.
- Chaque entrée IPC est validée par Zod dans le processus principal ; seul l’expéditeur local (fichier de l’application ou serveur de développement) est accepté.
- CSP stricte, navigation et ouverture de fenêtres bloquées, permissions web refusées, liens externes limités à une liste blanche.
- Jeton Google chiffré avec `safeStorage` (DPAPI Windows). Aucun secret de licence en clair.
- Exports CSV protégés contre l’injection de formules ; contenu des reçus échappé et affiché dans une iframe sans script.

## Mises à jour futures

La version provient de `package.json`. `electron-builder.yml` contient `publish: null` : ajouter un fournisseur (GitHub, serveur générique) et `electron-updater` dans le processus principal suffit pour activer les mises à jour automatiques ; les migrations de base sont déjà versionnées et appliquées au démarrage.

## Internationalisation

`src/renderer/src/i18n/fr.ts` exporte le dictionnaire et son type `Dictionary`. Une nouvelle langue est un objet du même type (le compilateur signale les clés manquantes), enregistré dans `i18n/index.ts`. Les dates utilisent `date-fns` (locale à adapter) et la terminologie métier provient de la configuration de catégorie.
