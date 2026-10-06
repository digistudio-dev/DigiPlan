// Types de domaine partagés entre le processus principal et l'interface.
// Les montants sont exprimés en centimes (entiers). Les instants sont des timestamps en millisecondes.

export type CategoryId =
  | 'barber'
  | 'hair_salon'
  | 'beauty_salon'
  | 'dentist'
  | 'doctor'
  | 'physio'
  | 'spa'
  | 'coach'
  | 'consultant'
  | 'other'

export type Edition = 'free' | 'pro'

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export type Gender = 'male' | 'female'

export type ThemePreference = 'light' | 'dark' | 'system'

export type CalendarColorMode = 'status' | 'service' | 'staff'

export interface TimeRange {
  /** Minutes depuis minuit (heure locale). */
  start: number
  end: number
}

export interface DaySchedule {
  /** 1 = lundi … 7 = dimanche (ISO). */
  weekday: number
  open: boolean
  start: number
  end: number
  breaks: TimeRange[]
}

export interface TerminologyOverrides {
  clientSingular?: string
  clientPlural?: string
  clientFeminine?: boolean
  staffSingular?: string
  staffPlural?: string
  staffFeminine?: boolean
  serviceSingular?: string
  servicePlural?: string
  serviceFeminine?: boolean
}

export interface BusinessProfile {
  name: string
  ownerName: string
  phone: string
  whatsapp: string
  email: string
  address: string
  city: string
  logoDataUrl: string | null
  currency: string
  timezone: string
  categoryId: CategoryId
  terminology: TerminologyOverrides
  onboardedAt: number | null
}

export interface AppSettings {
  theme: ThemePreference
  calendarColorMode: CalendarColorMode
  calendarSlotMin: number
  calendarStartHour: number
  calendarEndHour: number
  defaultCalendarView: 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek'
  allowOverlap: boolean
  resourcesEnabled: boolean
  defaultAppointmentStatus: 'pending' | 'confirmed'
  receiptFooter: string
  receiptShowLogo: boolean
  receiptAccentColor: string
  remindersEnabledByDefault: boolean
  defaultReminderOffsetMin: number
  /** Délai minimum avant le rendez-vous pour envoyer un rappel en retard (minutes). */
  lateReminderMinLeadMin: number
  sendConfirmationOnCreate: boolean
  backupAutoEnabled: boolean
  backupRetention: number
  backupDirectory: string
  googleSyncEnabled: boolean
  notifyUpcomingMinutes: number
  sidebarCollapsed: boolean
}

export interface ServiceCategoryDto {
  id: string
  name: string
  sortOrder: number
}

export interface ServiceDto {
  id: string
  categoryId: string | null
  name: string
  description: string
  durationMin: number
  price: number
  color: string | null
  active: boolean
  bufferBeforeMin: number
  bufferAfterMin: number
  /** Liste vide = proposé par tous les membres de l'équipe. */
  staffIds: string[]
  sortOrder: number
}

export interface StaffDto {
  id: string
  name: string
  role: string
  phone: string
  email: string
  avatarDataUrl: string | null
  color: string
  active: boolean
  commissionRate: number | null
  useBusinessHours: boolean
  schedule: DaySchedule[]
  /** Liste vide = toutes les prestations. */
  serviceIds: string[]
  sortOrder: number
  createdAt: number
}

export interface ResourceDto {
  id: string
  name: string
  active: boolean
  sortOrder: number
}

export interface ClientDto {
  id: string
  firstName: string
  lastName: string
  phone: string
  whatsappPhone: string
  email: string
  birthDate: string | null
  gender: Gender | null
  address: string
  insurance: string
  notes: string
  tags: string[]
  createdAt: number
  updatedAt: number
  archivedAt: number | null
}

export interface ClientStats {
  appointmentCount: number
  lastAppointmentAt: number | null
  nextAppointmentAt: number | null
  totalSpent: number
  balance: number
  cancellationCount: number
  noShowCount: number
}

export interface ClientListItem extends ClientDto, ClientStats {}

export interface AppointmentServiceLine {
  serviceId: string | null
  name: string
  durationMin: number
  price: number
  color: string | null
}

export type ReminderStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled'

export interface AppointmentDto {
  id: string
  clientId: string
  clientName: string
  clientPhone: string
  clientWhatsapp: string
  staffId: string | null
  staffName: string | null
  staffColor: string | null
  resourceId: string | null
  resourceName: string | null
  startAt: number
  endAt: number
  status: AppointmentStatus
  services: AppointmentServiceLine[]
  subtotal: number
  discount: number
  total: number
  paid: number
  balance: number
  notes: string
  reminderEnabled: boolean
  reminderOffsetMin: number
  reminderStatus: ReminderStatus | null
  seriesId: string | null
  googleSyncStatus: 'pending' | 'synced' | 'error' | null
  googleSyncError: string | null
  createdAt: number
  updatedAt: number
}

export interface PaymentDto {
  id: string
  appointmentId: string | null
  clientId: string | null
  clientName: string | null
  amount: number
  method: PaymentMethod
  paidAt: number
  note: string
  receiptNumber: string
  voidedAt: number | null
  appointmentStartAt: number | null
  appointmentLabel: string | null
  createdAt: number
}

export interface ExpenseDto {
  id: string
  category: string
  amount: number
  description: string
  date: string
  method: PaymentMethod
  notes: string
  createdAt: number
}

export interface MessageTemplateDto {
  id: string
  key: string
  name: string
  body: string
  isSystem: boolean
  updatedAt: number
}

export interface ReminderDto {
  id: string
  appointmentId: string
  clientName: string
  appointmentStartAt: number
  kind: 'reminder' | 'confirmation' | 'manual'
  scheduledAt: number
  status: ReminderStatus
  sentAt: number | null
  error: string | null
  attempts: number
  updatedAt: number
}

export interface LicenseState {
  edition: Edition
  activatedAt: number | null
}

export interface BackupInfo {
  fileName: string
  filePath: string
  createdAt: number
  sizeBytes: number
  kind: 'auto' | 'manual' | 'pre-restore'
}

export interface BackupVerification {
  ok: boolean
  message: string
  createdAt: number | null
  businessName: string | null
  counts: { clients: number; appointments: number; payments: number } | null
}

export type WhatsAppConnectionStatus =
  | 'disabled'
  | 'idle'
  | 'initializing'
  | 'qr'
  | 'authenticated'
  | 'ready'
  | 'disconnected'
  | 'error'

export interface WhatsAppState {
  status: WhatsAppConnectionStatus
  qrDataUrl: string | null
  accountName: string | null
  accountNumber: string | null
  error: string | null
  browserFound: boolean
  updatedAt: number
}

export interface GoogleCalendarState {
  configured: boolean
  connected: boolean
  accountEmail: string | null
  calendarId: string | null
  calendarName: string | null
  syncEnabled: boolean
  lastSyncAt: number | null
  lastError: string | null
  pendingCount: number
  credentialsSource: 'bundled' | 'custom' | 'none'
}

export interface GoogleCalendarListItem {
  id: string
  summary: string
  primary: boolean
}

export type NotificationKind =
  | 'upcoming'
  | 'unpaid'
  | 'reminder_failed'
  | 'google_error'
  | 'backup_error'
  | 'whatsapp_disconnected'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  description: string
  at: number
  severity: 'info' | 'warning' | 'error'
  appointmentId?: string
  clientId?: string
}

export interface SearchResults {
  clients: Array<{ id: string; name: string; phone: string }>
  appointments: Array<{ id: string; clientName: string; startAt: number; serviceLabel: string; status: AppointmentStatus }>
  services: Array<{ id: string; name: string; price: number; durationMin: number }>
  staff: Array<{ id: string; name: string; role: string; color: string }>
}

export interface DashboardData {
  now: number
  todayAppointments: AppointmentDto[]
  nextAppointment: AppointmentDto | null
  kpis: {
    todayCount: number
    todayCompleted: number
    todayUpcoming: number
    todayCancelled: number
    todayNoShow: number
    todayRevenue: number
    waitingCount: number
    outstandingBalance: number
    outstandingCount: number
    noShowRate30d: number | null
    weekRevenue: number
    monthRevenue: number
    newClients30d: number
  }
  topService: { name: string; count: number } | null
  topStaff: { name: string; count: number; color: string } | null
  revenueTrend: Array<{ date: string; amount: number }>
}

export interface ReportFilters {
  from: string
  to: string
  staffId?: string | null
}

export interface ReportData {
  range: { from: string; to: string }
  revenue: number
  previousRevenue: number
  appointmentCount: number
  completedCount: number
  cancelledCount: number
  noShowCount: number
  averageTicket: number
  noShowRate: number | null
  revenueByDay: Array<{ date: string; amount: number }>
  paymentMethods: Array<{ method: PaymentMethod; amount: number; count: number }>
  byStaff: Array<{ staffId: string | null; name: string; color: string; count: number; value: number; commission: number }>
  byService: Array<{ name: string; count: number; value: number }>
  recurringClients: number
  newClients: number
  unpaid: Array<{ appointmentId: string; clientName: string; startAt: number; total: number; balance: number }>
  unpaidTotal: number
  expensesTotal: number
  expensesByCategory: Array<{ category: string; amount: number }>
  net: number
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  dataPath: string
  databasePath: string
  logsPath: string
  isDev: boolean
}
