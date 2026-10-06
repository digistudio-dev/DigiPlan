// État d'interface global (navigation, panneaux, dialogues).

import { create } from 'zustand'
import type { ProFeature } from '@shared/edition'

export type Page = 'dashboard' | 'calendar' | 'clients' | 'services' | 'staff' | 'payments' | 'reports' | 'whatsapp' | 'settings'

export type SettingsSection =
  | 'general'
  | 'business'
  | 'hours'
  | 'appointments'
  | 'notifications'
  | 'whatsapp'
  | 'google'
  | 'backups'
  | 'appearance'
  | 'license'
  | 'about'

export interface AppointmentDraft {
  id?: string
  startAt?: number
  durationMin?: number
  staffId?: string
  clientId?: string
  walkIn?: boolean
}

interface UiState {
  page: Page
  settingsSection: SettingsSection
  navigate: (page: Page, section?: SettingsSection) => void

  appointmentDrawerId: string | null
  openAppointment: (id: string | null) => void

  appointmentForm: AppointmentDraft | null
  openAppointmentForm: (draft?: AppointmentDraft) => void
  closeAppointmentForm: () => void

  clientDrawerId: string | null
  openClient: (id: string | null) => void

  clientForm: { id?: string } | null
  openClientForm: (id?: string) => void
  closeClientForm: () => void

  paymentDialog: { appointmentId?: string; clientId?: string } | null
  openPayment: (ctx?: { appointmentId?: string; clientId?: string }) => void
  closePayment: () => void

  receiptPaymentId: string | null
  openReceipt: (paymentId: string | null) => void

  composer: { appointmentId?: string; clientId?: string } | null
  openComposer: (ctx: { appointmentId?: string; clientId?: string } | null) => void

  commandOpen: boolean
  setCommandOpen: (open: boolean) => void

  upgradeFeature: ProFeature | null
  openUpgrade: (feature: ProFeature | null) => void

  calendarFocusDate: number | null
  focusCalendarOn: (date: number) => void

  /** Vrai tant que l'assistant de configuration est affiché (jusqu'au clic final). */
  onboardingActive: boolean
}

export const useUi = create<UiState>((set) => ({
  page: 'dashboard',
  settingsSection: 'general',
  navigate: (page, section) => set((s) => ({ page, settingsSection: section ?? s.settingsSection })),

  appointmentDrawerId: null,
  openAppointment: (id) => set({ appointmentDrawerId: id }),

  appointmentForm: null,
  openAppointmentForm: (draft = {}) => set({ appointmentForm: draft }),
  closeAppointmentForm: () => set({ appointmentForm: null }),

  clientDrawerId: null,
  openClient: (id) => set({ clientDrawerId: id }),

  clientForm: null,
  openClientForm: (id) => set({ clientForm: { id } }),
  closeClientForm: () => set({ clientForm: null }),

  paymentDialog: null,
  openPayment: (ctx = {}) => set({ paymentDialog: ctx }),
  closePayment: () => set({ paymentDialog: null }),

  receiptPaymentId: null,
  openReceipt: (paymentId) => set({ receiptPaymentId: paymentId }),

  composer: null,
  openComposer: (ctx) => set({ composer: ctx }),

  commandOpen: false,
  setCommandOpen: (open) => set({ commandOpen: open }),

  upgradeFeature: null,
  openUpgrade: (feature) => set({ upgradeFeature: feature }),

  calendarFocusDate: null,
  focusCalendarOn: (date) => set({ calendarFocusDate: date, page: 'calendar' }),

  onboardingActive: false
}))

/**
 * Actions de l'interface SANS abonnement à l'état : le composant ne se re-rend pas
 * à chaque ouverture de panneau ou de dialogue. Les actions Zustand sont stables.
 * À utiliser uniquement pour appeler des fonctions (jamais pour lire des valeurs).
 */
export function useUiActions() {
  return useUi.getState()
}
