import type { AppointmentStatus, PaymentMethod } from './types'

export const APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'no_show'
]

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  arrived: 'Arrivé',
  in_progress: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absent'
}

/** Couleur de référence de chaque statut (utilisée pour le calendrier et les pastilles). */
export const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: '#d97706',
  confirmed: '#2563eb',
  arrived: '#0891b2',
  in_progress: '#7c3aed',
  completed: '#16a34a',
  cancelled: '#94a3b8',
  no_show: '#dc2626'
}

/** Statuts qui occupent un créneau dans l'agenda. */
export const BLOCKING_STATUSES: AppointmentStatus[] = ['pending', 'confirmed', 'arrived', 'in_progress', 'completed']

export function isBlockingStatus(status: AppointmentStatus): boolean {
  return BLOCKING_STATUSES.includes(status)
}

export function isClosedStatus(status: AppointmentStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'no_show'
}

/** Prochaine action logique proposée dans le panneau de détail. */
export function nextStatusAction(status: AppointmentStatus): { to: AppointmentStatus; label: string } | null {
  switch (status) {
    case 'pending':
      return { to: 'confirmed', label: 'Confirmer' }
    case 'confirmed':
      return { to: 'arrived', label: 'Marquer arrivé' }
    case 'arrived':
      return { to: 'in_progress', label: 'Commencer' }
    case 'in_progress':
      return { to: 'completed', label: 'Terminer' }
    default:
      return null
  }
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  transfer: 'Virement',
  other: 'Autre'
}

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other']
