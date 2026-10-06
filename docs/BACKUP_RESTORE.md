# Sauvegarde et restauration

## Ce qui est sauvegardé

La totalité de la base de données locale : établissement, paramètres, équipe, horaires, clients, prestations, rendez-vous, paiements, dépenses, modèles, historique des rappels, licence.
La session WhatsApp n’est pas incluse (un nouveau scan du QR code peut être nécessaire sur un autre ordinateur).

## Sauvegardes

- **Dossier par défaut** : `Documents\DigiPlan\Backups` (modifiable dans **Paramètres → Sauvegardes**).
- **Format** : un fichier SQLite autonome, ex. `DigiPlan_2026-10-06_14-30-00_manual.db`.
- **Méthode** : API de sauvegarde en ligne de SQLite (copie cohérente même pendant l’utilisation), écriture dans un fichier temporaire puis renommage, contrôle d’intégrité après chaque sauvegarde.
- **Automatique** (activée par défaut) : une sauvegarde quotidienne, vérifiée toutes les heures pendant l’utilisation.
- **Manuelle** : bouton **Sauvegarder maintenant**.
- **Rétention** : les *N* sauvegardes automatiques les plus récentes sont conservées (30 par défaut). Les sauvegardes manuelles ne sont **jamais** supprimées automatiquement.
- Un échec de sauvegarde est signalé dans le centre de notifications et consigné dans le journal.

Recommandation : copiez régulièrement le dossier des sauvegardes sur une clé USB ou un stockage cloud.

## Restauration

**Paramètres → Sauvegardes** → **Restaurer** sur une sauvegarde de la liste, ou **Restaurer depuis un fichier…** (sauvegarde copiée depuis un autre ordinateur).

Étapes réalisées par DigiPlan :
1. **Vérification** du fichier : contrôle d’intégrité SQLite, présence des tables DigiPlan, résumé du contenu (nom de l’établissement, nombre de fiches, rendez-vous, paiements).
2. **Avertissement** explicite + case à cocher obligatoire.
3. **Sauvegarde de sécurité** de l’état actuel (`…_pre-restore.db`).
4. Arrêt des tâches de fond (rappels, WhatsApp, synchronisation Google) et fermeture propre de la base.
5. Remplacement atomique de la base (copie préalable puis renommage).
6. **Redémarrage** de DigiPlan ; les migrations éventuelles s’appliquent automatiquement à une sauvegarde plus ancienne.

En cas d’erreur, la sauvegarde de sécurité permet de revenir à l’état précédent par la même procédure.

## Changement d’ordinateur

1. Sur l’ancien poste : **Sauvegarder maintenant**, copier le fichier `.db`.
2. Installer DigiPlan sur le nouveau poste, terminer l’assistant (n’importe quelles valeurs).
3. **Restaurer depuis un fichier…** → choisir la sauvegarde.
4. Ressaisir le code Pro si nécessaire (l’activation est liée au poste) et reconnecter WhatsApp / Google.

## Emplacements

| Élément | Chemin |
|---|---|
| Base active | `%APPDATA%\DigiPlan\data\digiplan.db` |
| Sauvegardes | `Documents\DigiPlan\Backups\` |
| Journal | `%APPDATA%\DigiPlan\logs\digiplan.log` |

La base active n’est jamais placée dans le dossier d’installation, et la désinstallation ne supprime ni les données ni les sauvegardes.
