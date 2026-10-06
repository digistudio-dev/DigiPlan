# Configuration Google Calendar (DigiPlan Pro)

DigiPlan synchronise les rendez-vous **de DigiPlan vers un agenda Google** (sens unique). Le propriétaire retrouve ainsi son planning sur son téléphone.

## 1. Créer les identifiants OAuth (une seule fois, par DigiStudio.dev)

1. Ouvrir <https://console.cloud.google.com/> et créer un projet (ex. « DigiPlan »).
2. **API et services → Bibliothèque** : activer **Google Calendar API**.
3. **Écran de consentement OAuth** :
   - Type : *Externe* ; nom de l’application : DigiPlan ; e-mail d’assistance ; logo (facultatif).
   - Champs d’application (scopes) : `.../auth/calendar.events`, `.../auth/calendar.calendarlist.readonly`, `openid`, `email`.
   - Tant que l’application est en mode *Test*, ajouter les comptes Google des clients comme *utilisateurs test* (100 max). Pour une diffusion large, publier l’application (vérification Google requise pour les scopes Calendar).
4. **Identifiants → Créer des identifiants → ID client OAuth** → type **Application de bureau**.
5. Récupérer le **Client ID** et le **Client secret**.

> Pour une application de bureau, Google considère le « client secret » comme non confidentiel : la sécurité repose sur PKCE et la redirection locale. Il peut donc être intégré au build.

## 2. Fournir les identifiants à DigiPlan

Deux possibilités :

- **Intégrés à l’installateur** (recommandé) : copier `.env.example` en `.env`, renseigner `MAIN_VITE_GOOGLE_CLIENT_ID` et `MAIN_VITE_GOOGLE_CLIENT_SECRET`, puis `npm run package`.
- **Saisis par l’établissement** : **Paramètres → Google Calendar → Identifiants OAuth**.

## 3. Connexion (côté établissement)

1. **Paramètres → Google Calendar → Connecter un compte Google** : le navigateur s’ouvre sur la page de connexion Google.
2. Accepter les autorisations. La page « Compte Google connecté » s’affiche ; revenir dans DigiPlan.
3. Choisir l’**agenda de destination**, puis activer **Synchroniser les rendez-vous vers Google**.

Fonctionnement technique : flux OAuth 2.0 « application installée » avec redirection *loopback* `http://127.0.0.1:<port aléatoire>`, PKCE (S256) et paramètre `state`. Le jeton d’actualisation est chiffré via `safeStorage` (DPAPI Windows) dans la base locale.

## Synchronisation

- Création / modification / déplacement d’un rendez-vous → événement créé ou mis à jour.
- Annulation ou suppression → événement supprimé.
- L’identifiant Google est stocké sur le rendez-vous (`google_event_id`) ; l’identifiant DigiPlan est stocké dans l’événement (`extendedProperties.private.digiplanId`) : après un arrêt brutal, DigiPlan retrouve l’événement au lieu d’en créer un doublon.
- File d’attente persistée (`google_sync_status`) : hors connexion, les modifications attendent et sont envoyées au retour d’internet (toutes les 2 min, ou **Synchroniser maintenant**).
- Activation : les rendez-vous à venir (et ceux des 7 derniers jours) sont envoyés.
- Changement d’agenda : les nouveaux événements sont créés dans le nouvel agenda ; l’ancien n’est pas modifié.
- Déconnexion (avec confirmation) : jeton révoqué, synchronisation arrêtée, événements existants conservés dans Google.
- Accès révoqué depuis Google : message « Reconnectez votre compte » dans le centre de notifications.

## Évolution vers la synchronisation bidirectionnelle

Non activée dans cette version pour garantir la fiabilité. L’architecture la prépare : identifiant DigiPlan dans les événements, file persistée, horodatage `google_synced_at`. Il suffira d’ajouter la lecture incrémentale (`syncToken`) et une règle de résolution des conflits.
