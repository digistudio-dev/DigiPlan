# DigiPlan

**Logiciel Windows de gestion de rendez-vous pour établissements de services** — barbiers, salons de coiffure et de beauté, dentistes, médecins, kinésithérapeutes, spas, coachs, consultants.
Développé par [DigiStudio.dev](https://digistudio.dev).

Interface entièrement en français, données stockées localement (fonctionne sans internet), édition **Free** et **Pro**.

---

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Prérequis](#prérequis)
3. [Installation du projet](#installation-du-projet)
4. [Scripts](#scripts)
5. [Construire l’installateur Windows](#construire-linstallateur-windows)
6. [Emplacement des données](#emplacement-des-données)
7. [Free / Pro et codes d’activation](#free--pro-et-codes-dactivation)
8. [Documentation détaillée](#documentation-détaillée)
9. [Choix techniques et compromis](#choix-techniques-et-compromis)

---

## Fonctionnalités

| Domaine | Free | Pro |
|---|:-:|:-:|
| Assistant de premier lancement adapté à l’activité (10 catégories) | ✓ | ✓ |
| Tableau de bord par activité (indicateurs, journée, prochain rendez-vous) | ✓ | ✓ |
| Calendrier jour / semaine / mois / agenda, glisser-déposer, redimensionnement | ✓ | ✓ |
| Moteur de disponibilité (horaires, pauses, tampons, conflits) | ✓ | ✓ |
| Clients / patients, fiches, étiquettes, historique, archivage | ✓ | ✓ |
| Prestations, catégories, durées, prix, temps tampons | ✓ | ✓ |
| Équipe | 1 membre | illimitée |
| Paiements (total, partiel, multiples), grand livre, reçus imprimables / PDF | ✓ | ✓ |
| Rapports de base, exports CSV | ✓ | ✓ |
| Sauvegardes manuelles et automatiques, restauration sécurisée | ✓ | ✓ |
| Thèmes clair / sombre, recherche globale (Ctrl + K) | ✓ | ✓ |
| WhatsApp : connexion par QR code, messages, rappels automatiques | | ✓ |
| Google Calendar (synchronisation DigiPlan → Google) | | ✓ |
| Rendez-vous récurrents (série, « celui-ci / les suivants / toute la série ») | | ✓ |
| Rapports avancés, commissions, dépenses, résultat net | | ✓ |
| Ressources (fauteuils, cabines, salles), reçus personnalisés | | ✓ |

Raccourcis : **Ctrl + N** nouveau rendez-vous · **Ctrl + K** recherche · **Ctrl + Maj + C** nouveau client · **Ctrl + P** nouveau paiement · **Ctrl + Entrée** enregistrer un rendez-vous.

## Prérequis

- Windows 10/11 x64
- Node.js 22 ou plus récent (testé avec Node 24) et npm
- Pour recompiler le module natif SQLite si aucun binaire précompilé n’est disponible : Visual Studio Build Tools (C++) et Python 3
- Microsoft Edge (présent par défaut sur Windows) ou Google Chrome — utilisé en arrière-plan par l’intégration WhatsApp

## Installation du projet

```bash
npm install
```

`postinstall` recompile automatiquement `better-sqlite3` pour la version d’Electron (`electron-builder install-app-deps`).
Le téléchargement de Chromium par Puppeteer est désactivé (`.puppeteerrc.cjs`) : DigiPlan pilote le navigateur Edge/Chrome déjà installé.

Copiez `.env.example` en `.env` si vous souhaitez intégrer des identifiants Google Calendar au build.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Lancement en développement (rechargement à chaud de l’interface) |
| `npm run seed:dev` | Développement + données de démonstration (après l’assistant ; jamais en production) |
| `npm run typecheck` | Vérification TypeScript (processus principal et interface) |
| `npm run lint` | ESLint (0 avertissement toléré) |
| `npm test` | Tests unitaires de la logique métier (Vitest) |
| `npm run build` | Typecheck + build de production (`out/`) |
| `npm run package` | Build + installateur Windows NSIS (`release/<version>/`) |
| `npm run package:dir` | Build + application décompressée (sans installateur), pour test rapide |
| `npm run icons` | Régénère les icônes (`build/icon.ico`, PNG) depuis les logos sources |
| `npm run db:generate` | Génère une nouvelle migration SQL après modification de `src/main/db/schema.ts` |

### Tests de bout en bout

Les scénarios `scripts/e2e/*.mjs` pilotent l’application Electron réelle (Playwright) avec un dossier de données isolé :

```bash
npx electron-vite build
node scripts/e2e/run.mjs scripts/e2e/01-onboarding.mjs --fresh
node scripts/e2e/run.mjs scripts/e2e/02-core.mjs
node scripts/e2e/run.mjs scripts/e2e/03-pro.mjs
```

La variable `DIGIPLAN_USER_DATA` (utilisée par ces scénarios) n’est prise en compte **qu’en développement**, jamais dans l’application installée.

## Construire l’installateur Windows

```bash
npm run package
```

Résultat : `release/1.0.0/DigiPlan-Setup-1.0.0.exe`

L’installateur (en français) :
- propose le dossier d’installation (par défaut, installation pour l’utilisateur courant, sans droits administrateur) ;
- crée l’entrée du menu Démarrer ;
- propose une case **« Créer un raccourci sur le Bureau »** sur la dernière page ;
- se désinstalle proprement depuis « Applications installées » — **les données et sauvegardes sont conservées**.

> Signature de code : pour éviter l’avertissement SmartScreen à la première installation, signez l’exécutable avec un certificat de signature de code (variables `CSC_LINK` / `CSC_KEY_PASSWORD` d’electron-builder).

## Emplacement des données

| Élément | Emplacement |
|---|---|
| Base de données SQLite | `%APPDATA%\DigiPlan\data\digiplan.db` |
| Journal technique | `%APPDATA%\DigiPlan\logs\digiplan.log` (rotation à 5 Mo) |
| Session WhatsApp | `%APPDATA%\DigiPlan\whatsapp-session\` |
| Sauvegardes (par défaut) | `Documents\DigiPlan\Backups\` (modifiable) |
| Application | dossier d’installation choisi (aucune donnée n’y est écrite) |

Les chemins exacts sont visibles dans **Paramètres → À propos**.

## Free / Pro et codes d’activation

- L’édition Free est active par défaut.
- **Paramètres → Licence** : saisir un code `DGP-XXXX-XXXX-XXXX` puis « Activer DigiPlan Pro ». L’activation est persistée et signée pour le poste.
- Les **5 codes générés** sont listés dans `docs/private/ACTIVATION_CODES.md` (+ `activation-codes.json`). Ce dossier est **exclu de Git** et de l’installateur ; conservez-en une copie sécurisée. Seules les empreintes HMAC-SHA256 des codes sont présentes dans l’application (`src/main/license/verify.ts`), compilée en bytecode V8.

## Documentation détaillée

- [Architecture](docs/ARCHITECTURE.md)
- [Intégration WhatsApp](docs/WHATSAPP.md)
- [Configuration Google Calendar](docs/GOOGLE_CALENDAR.md)
- [Sauvegarde et restauration](docs/BACKUP_RESTORE.md)

## Choix techniques et compromis

- **WhatsApp** repose sur WhatsApp Web (`whatsapp-web.js`), non officiel : un changement côté WhatsApp peut nécessiter une mise à jour de la bibliothèque. Les rappels ne partent que lorsque DigiPlan est ouvert ; à la réouverture, les rappels encore utiles sont envoyés (règle configurable), jamais après le début du rendez-vous.
- **Google Calendar** : synchronisation fiable à sens unique DigiPlan → Google. La synchronisation bidirectionnelle n’a pas été activée pour garantir la stabilité ; l’identifiant DigiPlan est stocké dans chaque événement (`extendedProperties`) pour permettre de l’ajouter ensuite.
- **Calendrier par colonnes d’équipe** : les vues « ressources » de FullCalendar sont sous licence commerciale ; DigiPlan propose à la place le filtrage par membre et la coloration par équipe / prestation / statut.
- **Licence** : vérification locale sans serveur, comme demandé. Ce n’est pas une protection anti-copie absolue : un même code peut être saisi sur plusieurs postes.
- **Données médicales** : DigiPlan gère des rendez-vous, pas des dossiers médicaux. Les notes sont destinées aux informations pratiques.
- **Utilisateurs** : application mono-poste sans comptes utilisateurs ni mot de passe dans cette version.
- **Fuseau horaire** : les heures affichées et les rappels suivent l’horloge de Windows. Réglez le poste sur « (UTC+01:00) Casablanca » (changements d’heure du Ramadan gérés par Windows). Le fuseau saisi dans DigiPlan est transmis à Google Calendar.
