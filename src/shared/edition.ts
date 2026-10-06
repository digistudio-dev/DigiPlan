import { FREE_STAFF_LIMIT } from './constants'
import type { Edition } from './types'

export type ProFeature =
  | 'unlimitedStaff'
  | 'whatsapp'
  | 'whatsappReminders'
  | 'googleCalendar'
  | 'advancedReports'
  | 'recurringAppointments'
  | 'expenses'
  | 'commissions'
  | 'customReceipt'
  | 'resources'

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  unlimitedStaff: 'Équipe illimitée',
  whatsapp: 'Messagerie WhatsApp intégrée',
  whatsappReminders: 'Rappels WhatsApp automatiques',
  googleCalendar: 'Synchronisation Google Calendar',
  advancedReports: 'Rapports avancés',
  recurringAppointments: 'Rendez-vous récurrents',
  expenses: 'Suivi des dépenses',
  commissions: "Commissions de l'équipe",
  customReceipt: 'Reçus personnalisés',
  resources: 'Gestion des ressources'
}

export function hasFeature(edition: Edition, _feature: ProFeature): boolean {
  return edition === 'pro'
}

export function staffLimit(edition: Edition): number {
  return edition === 'pro' ? Number.POSITIVE_INFINITY : FREE_STAFF_LIMIT
}
