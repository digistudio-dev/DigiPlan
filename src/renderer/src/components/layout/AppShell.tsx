import { lazy, Suspense, useEffect } from 'react'
import { useUi, useUiActions } from '@/stores/ui'
import { ErrorBoundary } from '../common'
import { Skeleton } from '../ui/primitives'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { CommandPalette } from '@/features/search/CommandPalette'
import { UpgradeDialog } from '@/features/licensing/UpgradeDialog'
import { AppointmentFormDialog } from '@/features/appointments/AppointmentFormDialog'
import { AppointmentDrawer } from '@/features/appointments/AppointmentDrawer'
import { ClientDrawer } from '@/features/clients/ClientDrawer'
import { ClientFormDialog } from '@/features/clients/ClientFormDialog'
import { PaymentDialog } from '@/features/payments/PaymentDialog'
import { ReceiptDialog } from '@/features/payments/ReceiptDialog'
import { WhatsAppComposer } from '@/features/whatsapp/WhatsAppComposer'
import { SeriesScopeHost } from '@/features/appointments/SeriesScopeDialog'

// Les écrans secondaires sont chargés à la demande (démarrage rapide), puis préchargés
// en arrière-plan dès que l'application est inactive : leur première ouverture est instantanée.
const loaders = {
  calendar: () => import('@/features/calendar/CalendarPage'),
  clients: () => import('@/features/clients/ClientsPage'),
  services: () => import('@/features/services/ServicesPage'),
  staff: () => import('@/features/staff/StaffPage'),
  payments: () => import('@/features/payments/PaymentsPage'),
  reports: () => import('@/features/reports/ReportsPage'),
  whatsapp: () => import('@/features/whatsapp/WhatsAppPage'),
  settings: () => import('@/features/settings/SettingsPage')
}
const CalendarPage = lazy(loaders.calendar)
const ClientsPage = lazy(loaders.clients)
const ServicesPage = lazy(loaders.services)
const StaffPage = lazy(loaders.staff)
const PaymentsPage = lazy(loaders.payments)
const ReportsPage = lazy(loaders.reports)
const WhatsAppPage = lazy(loaders.whatsapp)
const SettingsPage = lazy(loaders.settings)

function usePrefetchPages() {
  useEffect(() => {
    const id = window.setTimeout(() => {
      // Le calendrier d'abord : c'est l'écran le plus utilisé.
      void Object.values(loaders).reduce((p, load) => p.then(() => load()).then(() => undefined), Promise.resolve())
    }, 1200)
    return () => window.clearTimeout(id)
  }, [])
}

function PageFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-4 gap-3 pt-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

function useGlobalShortcuts() {
  const ui = useUiActions()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'k' && !e.shiftKey) {
        e.preventDefault()
        ui.setCommandOpen(!useUi.getState().commandOpen)
      } else if (key === 'n' && !e.shiftKey) {
        e.preventDefault()
        ui.openAppointmentForm()
      } else if (key === 'c' && e.shiftKey) {
        e.preventDefault()
        ui.openClientForm()
      } else if (key === 'p' && !e.shiftKey) {
        e.preventDefault()
        ui.openPayment()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui])
}

export function AppShell() {
  const page = useUi((s) => s.page)
  useGlobalShortcuts()
  usePrefetchPages()

  return (
    <div className="flex h-full flex-col bg-background">
      <Topbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-tl-xl border-t border-l border-border bg-panel">
          <ErrorBoundary resetKey={page}>
            <Suspense fallback={<PageFallback />}>
              {page === 'dashboard' && <DashboardPage />}
              {page === 'calendar' && <CalendarPage />}
              {page === 'clients' && <ClientsPage />}
              {page === 'services' && <ServicesPage />}
              {page === 'staff' && <StaffPage />}
              {page === 'payments' && <PaymentsPage />}
              {page === 'reports' && <ReportsPage />}
              {page === 'whatsapp' && <WhatsAppPage />}
              {page === 'settings' && <SettingsPage />}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <AppointmentFormDialog />
      <AppointmentDrawer />
      <ClientDrawer />
      <ClientFormDialog />
      <PaymentDialog />
      <ReceiptDialog />
      <WhatsAppComposer />
      <CommandPalette />
      <UpgradeDialog />
      <SeriesScopeHost />
    </div>
  )
}
