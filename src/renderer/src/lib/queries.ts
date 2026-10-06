// Accès aux données via TanStack Query, avec invalidation ciblée déclenchée par le processus principal.

import { QueryClient, useQuery, keepPreviousData } from '@tanstack/react-query'
import type { DataEntity } from '@shared/ipc'
import { api, onEvent } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: 0 }
  }
})

/** Correspondance entité modifiée → caches à rafraîchir. */
const INVALIDATION: Record<DataEntity, string[]> = {
  appointments: ['appointments', 'appointment', 'dashboard', 'reports', 'client', 'clients', 'search', 'payments'],
  clients: ['clients', 'client', 'search', 'appointments', 'appointment', 'dashboard', 'tags'],
  services: ['catalog', 'search'],
  staff: ['staff', 'search', 'appointments'],
  payments: ['payments', 'dashboard', 'reports', 'client', 'clients', 'appointment', 'appointments'],
  expenses: ['expenses', 'reports'],
  settings: ['bootstrap', 'backup'],
  business: ['bootstrap', 'staff'],
  resources: ['resources'],
  templates: ['templates'],
  reminders: ['reminders', 'appointment', 'appointments'],
  backups: ['backups', 'backup'],
  notifications: ['notifications']
}

let bridged = false
export function bridgeDataEvents(): void {
  if (bridged) return
  bridged = true
  onEvent('data:changed', ({ entities }) => {
    const keys = new Set(entities.flatMap((e) => INVALIDATION[e] ?? []))
    for (const k of keys) void queryClient.invalidateQueries({ queryKey: [k] })
  })
  onEvent('license:changed', () => void queryClient.invalidateQueries({ queryKey: ['bootstrap'] }))
  onEvent('whatsapp:state', (state) => queryClient.setQueryData(['whatsapp'], state))
  onEvent('google:state', (state) => queryClient.setQueryData(['google'], state))
}

export const useBootstrap = () => useQuery({ queryKey: ['bootstrap'], queryFn: () => api('bootstrap.get'), staleTime: Infinity })

export const useStaffList = (includeInactive = false) =>
  useQuery({ queryKey: ['staff', includeInactive], queryFn: () => api('staff.list', { includeInactive }) })

export const useCatalog = (includeInactive = false) =>
  useQuery({ queryKey: ['catalog', includeInactive], queryFn: () => api('services.list', { includeInactive }) })

export const useResources = () => useQuery({ queryKey: ['resources'], queryFn: () => api('resources.list') })

export const useAppointmentsRange = (from: number, to: number, enabled = true) =>
  useQuery({
    queryKey: ['appointments', from, to],
    queryFn: () => api('appointments.range', { from, to }),
    placeholderData: keepPreviousData,
    enabled
  })

export const useAppointment = (id: string | null) =>
  useQuery({ queryKey: ['appointment', id], queryFn: () => api('appointments.get', { id: id! }), enabled: Boolean(id) })

export const useClient = (id: string | null) =>
  useQuery({ queryKey: ['client', id], queryFn: () => api('clients.get', { id: id! }), enabled: Boolean(id) })

export const useClientHistory = (id: string | null) =>
  useQuery({ queryKey: ['client', id, 'history'], queryFn: () => api('clients.history', { id: id! }), enabled: Boolean(id) })

export const useDashboard = () =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => api('dashboard.get'), refetchInterval: 60_000 })

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api('notifications.list'), refetchInterval: 60_000 })

export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api('templates.list') })

export const useWhatsAppState = () => useQuery({ queryKey: ['whatsapp'], queryFn: () => api('whatsapp.state') })

export const useGoogleState = () => useQuery({ queryKey: ['google'], queryFn: () => api('google.state') })

export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: () => api('clients.tags') })
