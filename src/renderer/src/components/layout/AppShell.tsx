import { lazy, Suspense, useEffect } from 'react'
import { useUi } from '@/stores/ui'
import { useProGate } from '@/hooks/useApp'
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

// Les écrans secondaires sont chargés à la demande pour un démarrage plus rapide.
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const ClientsPage = lazy(() => import('@/features/clients/ClientsPage'))
const ServicesPage = lazy(() => import('@/features/services/ServicesPage'))
const StaffPage = lazy(() => import('@/features/staff/StaffPage'))
const PaymentsPage = lazy(() => import('@/features/payments/PaymentsPage'))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'))
const WhatsAppPage = lazy(() => import('@/features/whatsapp/WhatsAppPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

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
  const ui = useUi()
  const gate = useProGate()
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
  }, [ui, gate])
}

export function AppShell() {
  const page = useUi((s) => s.page)
  useGlobalShortcuts()

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
