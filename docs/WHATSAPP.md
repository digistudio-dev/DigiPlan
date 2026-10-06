# Intégration WhatsApp (DigiPlan Pro)

## Principe

DigiPlan utilise **WhatsApp Web** via la bibliothèque `whatsapp-web.js`. Le navigateur **Microsoft Edge** (installé par défaut sur Windows 10/11) — ou à défaut Google Chrome — est piloté en arrière-plan, sans fenêtre visible. Aucun Chromium supplémentaire n’est téléchargé ni embarqué.

Le client WhatsApp tourne dans le processus principal, de façon asynchrone : l’interface n’est jamais bloquée pendant l’initialisation.

## Connexion

1. **Paramètres → WhatsApp** (ou menu **WhatsApp**) → **Connecter WhatsApp**.
2. Un QR code s’affiche dans DigiPlan après quelques secondes (jusqu’à une minute la première fois).
3. Sur le téléphone de l’établissement : WhatsApp → **Appareils connectés** → **Connecter un appareil** → scanner.
4. Statut **Connecté**, avec le nom et le numéro du compte.

La session est conservée dans `%APPDATA%\DigiPlan\whatsapp-session\` : le QR code n’est pas redemandé à chaque lancement. DigiPlan se reconnecte automatiquement au démarrage.

## États gérés

| État | Comportement |
|---|---|
| Démarrage | indicateur de chargement, l’application reste utilisable |
| QR code | renouvelé automatiquement ; expiration après 6 renouvellements → bouton pour recommencer |
| Connecté | envoi de messages et rappels |
| Déconnecté (réseau) | reconnexion automatique (1, 2, 5 puis 10 min) ; les rappels restent planifiés |
| Appareil dissocié depuis le téléphone / session expirée | message clair, nouveau scan nécessaire |
| Pas d’internet / WhatsApp indisponible | message d’erreur en français, nouvelle tentative automatique |
| Edge et Chrome absents | message explicite, bouton de connexion désactivé |

**Déconnecter** (avec confirmation) supprime la session sur l’ordinateur et suspend les rappels.

## Messages

- **Manuels** : depuis un rendez-vous ou une fiche client → « WhatsApp » ouvre un éditeur prérempli (modèle au choix). Rien n’est envoyé sans clic sur **Envoyer**.
- **Confirmation** : case « Envoyer une confirmation WhatsApp » lors de la création d’un rendez-vous (choix explicite, jamais automatique par défaut).
- **Rappels automatiques** : interrupteur par rendez-vous (activé par défaut en Pro, paramétrable), délais 24 h / 12 h / 2 h / 1 h.

Le numéro utilisé est le numéro WhatsApp de la fiche (ou à défaut le téléphone), normalisé au format international (`0612345678` → `+212612345678`). DigiPlan vérifie que le numéro est enregistré sur WhatsApp avant l’envoi.

## Modèles

Menu **WhatsApp → Modèles de messages** : confirmation, rappel, annulation, remerciement (réinitialisables) + modèles personnalisés. Variables : `{{client_name}}`, `{{business_name}}`, `{{date}}`, `{{time}}`, `{{service}}`, `{{staff_name}}`, `{{address}}`, `{{phone}}`. Aperçu en direct.

## Règles des rappels

- Aucun doublon : clé d’unicité par rendez-vous/horaire/délai, prise atomique avant envoi.
- Rendez-vous annulé, absent, terminé, commencé ou supprimé → rappel ignoré.
- DigiPlan fermé à l’heure prévue → à la réouverture, envoi seulement s’il reste au moins le délai configuré (**Paramètres → Notifications → Rappels en retard**, 1 h par défaut) ; jamais après le début du rendez-vous.
- WhatsApp déconnecté → le rappel attend la reconnexion (et suit la même règle de retard).
- Échec d’envoi → 3 tentatives espacées de 5 min, puis statut « Échec » avec message ; relance manuelle possible depuis l’historique.

## Limites connues

- WhatsApp Web n’est pas une API officielle de Meta : une évolution de WhatsApp peut nécessiter de mettre à jour `whatsapp-web.js` (`npm update whatsapp-web.js` puis nouvel installateur).
- Les rappels nécessitent que DigiPlan soit ouvert (application de bureau, pas de serveur).
- Envoyez des messages à vos clients, dans un volume raisonnable : un usage assimilable à du spam peut entraîner une restriction du compte par WhatsApp.
