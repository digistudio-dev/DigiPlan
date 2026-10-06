// Contrat IPC typé entre l'interface (renderer) et le processus principal.
// Chaque canal déclare un schéma Zod d'entrée (validé côté principal) et un type de sortie.

import { z } from 'zod'
import { CATEGORY_ORDER } from './categories'
import { APPOINTMENT_STATUSES, PAYMENT_METHODS } from './status'
import type {
  AppInfo,
  AppSettings,
  AppointmentDto,
  AppointmentStatus,
  CategoryId,
  PaymentMethod,
  BackupInfo,
  BackupVerification,
  BusinessProfile,
  ClientDto,
  ClientListItem,
  DashboardData,
  DaySchedule,
  ExpenseDto,
  GoogleCalendarListItem,
  GoogleCalendarState,
  LicenseState,
  MessageTemplateDto,
  NotificationItem,
  PaymentDto,
  ReminderDto,
  ReportData,
  ResourceDto,
  SearchResults,
  ServiceCategoryDto,
  ServiceDto,
  StaffDto,
  WhatsAppState
} from './types'
import type { Conflict } from './domain/availability'

// ---------- Schémas communs ----------

const id = z.string().min(1).max(64)
const optionalId = id.nullable().optional()
const text = (max = 200) => z.string().trim().max(max)
const money = z.number().int().min(0).max(1_000_000_000)
const minutesOfDay = z.number().int().min(0).max(24 * 60)
const timestamp = z.number().int().min(0)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const dataUrl = z
  .string()
  .max(3_000_000)
  .regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/)
  .nullable()

export const categoryIdSchema = z.enum(CATEGORY_ORDER as [CategoryId, ...CategoryId[]])
export const statusSchema = z.enum(APPOINTMENT_STATUSES as [AppointmentStatus, ...AppointmentStatus[]])
export const paymentMethodSchema = z.enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]])

export const timeRangeSchema = z
  .object({ start: minutesOfDay, end: minutesOfDay })
  .refine((r) => r.end > r.start, { message: 'La fin doit être après le début.' })

export const dayScheduleSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  open: z.boolean(),
  start: minutesOfDay,
  end: minutesOfDay,
  breaks: z.array(timeRangeSchema).max(6)
})

export const weekScheduleSchema = z.array(dayScheduleSchema).length(7)

export const terminologySchema = z.object({
  clientSingular: text(40).optional(),
  clientPlural: text(40).optional(),
  clientFeminine: z.boolean().optional(),
  staffSingular: text(40).optional(),
  staffPlural: text(40).optional(),
  staffFeminine: z.boolean().optional(),
  serviceSingular: text(40).optional(),
  servicePlural: text(40).optional(),
  serviceFeminine: z.boolean().optional()
})

export const businessProfileInputSchema = z.object({
  name: text(120).min(1),
  ownerName: text(120),
  phone: text(40),
  whatsapp: text(40),
  email: text(160),
  address: text(300),
  city: text(80),
  logoDataUrl: dataUrl,
  currency: text(8).min(1),
  timezone: text(64).min(1)
})

export const staffInputSchema = z.object({
  id: id.optional(),
  name: text(120).min(1),
  role: text(80),
  phone: text(40),
  email: text(160),
  avatarDataUrl: dataUrl,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.boolean(),
  commissionRate: z.number().min(0).max(100).nullable(),
  useBusinessHours: z.boolean(),
  schedule: weekScheduleSchema,
  serviceIds: z.array(id).max(500)
})

export const serviceInputSchema = z.object({
  id: id.optional(),
  categoryId: optionalId,
  name: text(120).min(1),
  description: text(1000),
  durationMin: z.number().int().min(5).max(24 * 60),
  price: money,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  active: z.boolean(),
  bufferBeforeMin: z.number().int().min(0).max(240),
  bufferAfterMin: z.number().int().min(0).max(240),
  staffIds: z.array(id).max(500)
})

export const clientInputSchema = z.object({
  id: id.optional(),
  firstName: text(80).min(1),
  lastName: text(80),
  phone: text(40),
  whatsappPhone: text(40),
  email: text(160),
  birthDate: isoDate.nullable(),
  gender: z.enum(['male', 'female']).nullable(),
  address: text(300),
  insurance: text(120),
  notes: text(5000),
  tags: z.array(text(40).min(1)).max(30)
})

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['weekly', 'biweekly', 'monthly']),
    count: z.number().int().min(2).max(104).nullable().optional(),
    until: isoDate.nullable().optional()
  })
  .refine((r) => Boolean(r.count) || Boolean(r.until), { message: 'Indiquez un nombre de séances ou une date de fin.' })

export const seriesScopeSchema = z.enum(['single', 'following', 'series'])

export const appointmentInputSchema = z.object({
  id: id.optional(),
  clientId: optionalId,
  newClient: clientInputSchema.omit({ id: true }).optional(),
  staffId: id,
  resourceId: optionalId,
  startAt: timestamp,
  services: z
    .array(
      z.object({
        serviceId: id.nullable(),
        name: text(120).min(1),
        durationMin: z.number().int().min(5).max(24 * 60),
        price: money
      })
    )
    .min(1)
    .max(20),
  discount: money,
  status: statusSchema,
  notes: text(5000),
  reminderEnabled: z.boolean(),
  reminderOffsetMin: z.number().int().min(10).max(7 * 24 * 60),
  recurrence: recurrenceSchema.nullable().optional(),
  scope: seriesScopeSchema.optional(),
  /** Confirme l'enregistrement malgré des avertissements non bloquants. */
  acknowledgeWarnings: z.boolean().optional(),
  /** Envoie une confirmation WhatsApp après l'enregistrement (Pro, choix explicite de l'utilisateur). */
  sendConfirmation: z.boolean().optional(),
  /** Encaissement immédiat optionnel à la création. */
  initialPayment: z.object({ amount: money, method: paymentMethodSchema }).nullable().optional()
})

export const settingsPatchSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    calendarColorMode: z.enum(['status', 'service', 'staff']),
    calendarSlotMin: z.number().int().refine((v) => [10, 15, 20, 30, 60].includes(v), { message: 'Durée de créneau invalide.' }),
    calendarStartHour: z.number().int().min(0).max(23),
    calendarEndHour: z.number().int().min(1).max(24),
    defaultCalendarView: z.enum(['timeGridDay', 'timeGridWeek', 'dayGridMonth', 'listWeek']),
    allowOverlap: z.boolean(),
    resourcesEnabled: z.boolean(),
    defaultAppointmentStatus: z.enum(['pending', 'confirmed']),
    receiptFooter: text(300),
    receiptShowLogo: z.boolean(),
    receiptAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    remindersEnabledByDefault: z.boolean(),
    defaultReminderOffsetMin: z.number().int().min(10).max(7 * 24 * 60),
    lateReminderMinLeadMin: z.number().int().min(0).max(24 * 60),
    sendConfirmationOnCreate: z.boolean(),
    backupAutoEnabled: z.boolean(),
    backupRetention: z.number().int().min(3).max(365),
    backupDirectory: text(500).min(1),
    googleSyncEnabled: z.boolean(),
    notifyUpcomingMinutes: z.number().int().min(5).max(240),
    sidebarCollapsed: z.boolean()
  })
  .partial()

const listPage = {
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50)
}

// ---------- Contrat ----------

/** Type « fantôme » : ne sert qu'au typage des sorties. */
const out = <T>() => undefined as unknown as T

const none = z.undefined()

export const contract = {
  'app.info': { input: none, output: out<AppInfo>() },
  'app.openExternal': { input: z.object({ url: z.string().url() }), output: out<void>() },
  'app.openFolder': { input: z.object({ target: z.enum(['data', 'logs', 'backups']) }), output: out<void>() },
  'app.relaunch': { input: none, output: out<void>() },

  'bootstrap.get': {
    input: none,
    output: out<{
      business: BusinessProfile | null
      settings: AppSettings
      license: LicenseState
      hours: DaySchedule[]
    }>()
  },

  'onboarding.complete': {
    input: z.object({
      categoryId: categoryIdSchema,
      business: businessProfileInputSchema,
      hours: weekScheduleSchema,
      staff: z.object({ name: text(120).min(1), role: text(80), phone: text(40), email: text(160), color: z.string() }),
      services: z
        .array(z.object({ name: text(120).min(1), category: text(80), durationMin: z.number().int().min(5), price: money }))
        .max(100),
      resources: z.array(text(80).min(1)).max(20)
    }),
    output: out<void>()
  },

  'business.update': {
    input: businessProfileInputSchema.partial().extend({
      categoryId: categoryIdSchema.optional(),
      terminology: terminologySchema.optional()
    }),
    output: out<BusinessProfile>()
  },
  'business.setHours': { input: weekScheduleSchema, output: out<DaySchedule[]>() },

  'settings.update': { input: settingsPatchSchema, output: out<AppSettings>() },

  'staff.list': { input: z.object({ includeInactive: z.boolean().optional() }).optional(), output: out<StaffDto[]>() },
  'staff.save': { input: staffInputSchema, output: out<StaffDto>() },
  'staff.delete': { input: z.object({ id }), output: out<{ archived: boolean }>() },

  'services.list': {
    input: z.object({ includeInactive: z.boolean().optional() }).optional(),
    output: out<{ categories: ServiceCategoryDto[]; services: ServiceDto[] }>()
  },
  'services.save': { input: serviceInputSchema, output: out<ServiceDto>() },
  'services.delete': { input: z.object({ id }), output: out<{ archived: boolean }>() },
  'serviceCategories.save': { input: z.object({ id: id.optional(), name: text(80).min(1) }), output: out<ServiceCategoryDto>() },
  'serviceCategories.delete': { input: z.object({ id }), output: out<void>() },

  'resources.list': { input: none, output: out<ResourceDto[]>() },
  'resources.save': {
    input: z.object({ id: id.optional(), name: text(80).min(1), active: z.boolean() }),
    output: out<ResourceDto>()
  },
  'resources.delete': { input: z.object({ id }), output: out<{ archived: boolean }>() },

  'clients.list': {
    input: z.object({
      search: text(120).optional(),
      filter: z.enum(['active', 'balance', 'archived']).default('active'),
      sort: z.enum(['name', 'recent', 'lastVisit', 'spent']).default('name'),
      tag: text(40).optional(),
      ...listPage
    }),
    output: out<{ items: ClientListItem[]; total: number }>()
  },
  'clients.get': { input: z.object({ id }), output: out<ClientListItem>() },
  'clients.save': { input: clientInputSchema, output: out<ClientDto>() },
  'clients.findDuplicates': {
    input: z.object({ phone: text(40), excludeId: id.optional() }),
    output: out<Array<{ id: string; name: string; phone: string }>>()
  },
  'clients.archive': { input: z.object({ id, archived: z.boolean() }), output: out<void>() },
  'clients.deletionImpact': { input: z.object({ id }), output: out<{ appointments: number; payments: number }>() },
  'clients.delete': { input: z.object({ id }), output: out<void>() },
  'clients.history': {
    input: z.object({ id }),
    output: out<{ appointments: AppointmentDto[]; payments: PaymentDto[] }>()
  },
  'clients.tags': { input: none, output: out<string[]>() },

  'appointments.range': {
    input: z.object({ from: timestamp, to: timestamp }),
    output: out<AppointmentDto[]>()
  },
  'appointments.get': { input: z.object({ id }), output: out<AppointmentDto>() },
  'appointments.check': {
    input: z.object({
      excludeId: id.optional(),
      staffId: id,
      resourceId: optionalId,
      startAt: timestamp,
      durationMin: z.number().int().min(1),
      serviceIds: z.array(id).max(20)
    }),
    output: out<Conflict[]>()
  },
  'appointments.slots': {
    input: z.object({
      date: isoDate,
      staffId: id,
      resourceId: optionalId,
      durationMin: z.number().int().min(1),
      serviceIds: z.array(id).max(20),
      excludeId: id.optional()
    }),
    output: out<number[]>()
  },
  'appointments.save': {
    input: appointmentInputSchema,
    output: out<
      | { ok: true; appointment: AppointmentDto; createdCount: number }
      | { ok: false; conflicts: Conflict[]; occurrence?: number }
    >()
  },
  'appointments.move': {
    input: z.object({
      id,
      startAt: timestamp,
      endAt: timestamp,
      staffId: id.optional(),
      acknowledgeWarnings: z.boolean().optional()
    }),
    output: out<{ ok: true; appointment: AppointmentDto } | { ok: false; conflicts: Conflict[] }>()
  },
  'appointments.setStatus': {
    input: z.object({ id, status: statusSchema }),
    output: out<AppointmentDto>()
  },
  'appointments.delete': { input: z.object({ id, scope: seriesScopeSchema.default('single') }), output: out<number>() },
  'appointments.seriesInfo': {
    input: z.object({ id }),
    output: out<{ total: number; following: number; index: number } | null>()
  },

  'payments.list': {
    input: z.object({
      from: timestamp.optional(),
      to: timestamp.optional(),
      method: paymentMethodSchema.optional(),
      search: text(120).optional(),
      includeVoided: z.boolean().default(false),
      ...listPage
    }),
    output: out<{ items: PaymentDto[]; total: number; sum: number }>()
  },
  'payments.create': {
    input: z.object({
      appointmentId: optionalId,
      clientId: optionalId,
      amount: money.min(1),
      method: paymentMethodSchema,
      paidAt: timestamp.optional(),
      note: text(500)
    }),
    output: out<PaymentDto>()
  },
  'payments.forAppointment': { input: z.object({ appointmentId: id }), output: out<PaymentDto[]>() },
  'payments.void': { input: z.object({ id, reason: text(300) }), output: out<void>() },
  'receipts.html': { input: z.object({ paymentId: id }), output: out<string>() },
  'receipts.print': { input: z.object({ paymentId: id }), output: out<boolean>() },
  'receipts.pdf': { input: z.object({ paymentId: id }), output: out<{ saved: boolean; path?: string }>() },

  'expenses.list': { input: z.object({ from: isoDate, to: isoDate }), output: out<ExpenseDto[]>() },
  'expenses.save': {
    input: z.object({
      id: id.optional(),
      category: text(80).min(1),
      amount: money.min(1),
      description: text(300),
      date: isoDate,
      method: paymentMethodSchema,
      notes: text(2000)
    }),
    output: out<ExpenseDto>()
  },
  'expenses.delete': { input: z.object({ id }), output: out<void>() },

  'dashboard.get': { input: none, output: out<DashboardData>() },
  'reports.get': {
    input: z.object({ from: isoDate, to: isoDate, staffId: id.nullable().optional() }),
    output: out<ReportData>()
  },

  'templates.list': { input: none, output: out<MessageTemplateDto[]>() },
  'templates.save': {
    input: z.object({ id: id.optional(), name: text(80).min(1), body: text(2000).min(1) }),
    output: out<MessageTemplateDto>()
  },
  'templates.delete': { input: z.object({ id }), output: out<void>() },
  'templates.reset': { input: z.object({ id }), output: out<MessageTemplateDto>() },

  'whatsapp.state': { input: none, output: out<WhatsAppState>() },
  'whatsapp.connect': { input: none, output: out<WhatsAppState>() },
  'whatsapp.disconnect': { input: none, output: out<WhatsAppState>() },
  'whatsapp.compose': {
    input: z.object({ appointmentId: id.optional(), clientId: id.optional(), templateId: id.optional() }),
    output: out<{ phone: string; message: string; clientName: string }>()
  },
  'whatsapp.send': {
    input: z.object({
      phone: text(40).min(4),
      message: text(4000).min(1),
      appointmentId: id.optional(),
      clientId: id.optional()
    }),
    output: out<void>()
  },
  'reminders.list': {
    input: z.object({ status: z.enum(['scheduled', 'sent', 'failed', 'skipped', 'all']).default('all'), limit: z.number().int().min(1).max(500).default(100) }),
    output: out<ReminderDto[]>()
  },
  'reminders.retry': { input: z.object({ id }), output: out<void>() },

  'google.state': { input: none, output: out<GoogleCalendarState>() },
  'google.setCredentials': {
    input: z.object({ clientId: text(300), clientSecret: text(300) }),
    output: out<GoogleCalendarState>()
  },
  'google.connect': { input: none, output: out<GoogleCalendarState>() },
  'google.cancelConnect': { input: none, output: out<void>() },
  'google.disconnect': { input: none, output: out<GoogleCalendarState>() },
  'google.calendars': { input: none, output: out<GoogleCalendarListItem[]>() },
  'google.selectCalendar': { input: z.object({ id: text(300).min(1), name: text(300) }), output: out<GoogleCalendarState>() },
  'google.setSync': { input: z.object({ enabled: z.boolean() }), output: out<GoogleCalendarState>() },
  'google.syncNow': { input: none, output: out<GoogleCalendarState>() },

  'backup.list': { input: none, output: out<BackupInfo[]>() },
  'backup.status': { input: none, output: out<{ lastBackupAt: number | null; lastError: string | null; directory: string }>() },
  'backup.create': { input: none, output: out<BackupInfo>() },
  'backup.verify': { input: z.object({ filePath: text(1000).min(1) }), output: out<BackupVerification>() },
  'backup.pickFile': { input: none, output: out<{ filePath: string; verification: BackupVerification } | null>() },
  'backup.restore': { input: z.object({ filePath: text(1000).min(1) }), output: out<void>() },
  'backup.chooseDirectory': { input: none, output: out<string | null>() },

  'license.get': { input: none, output: out<LicenseState>() },
  'license.activate': { input: z.object({ code: text(64).min(1) }), output: out<LicenseState>() },

  'export.csv': {
    input: z.object({
      kind: z.enum(['clients', 'appointments', 'payments', 'expenses', 'report']),
      from: isoDate.optional(),
      to: isoDate.optional()
    }),
    output: out<{ saved: boolean; path?: string; rows?: number }>()
  },

  'search.global': { input: z.object({ query: text(120) }), output: out<SearchResults>() },

  'notifications.list': { input: none, output: out<NotificationItem[]>() },
  'notifications.dismiss': { input: z.object({ id: text(200) }), output: out<void>() },

  'logo.pick': { input: none, output: out<string | null>() }
} as const

export type Contract = typeof contract
export type Channel = keyof Contract
export type ChannelInput<C extends Channel> = z.input<Contract[C]['input']>
export type ChannelParsedInput<C extends Channel> = z.output<Contract[C]['input']>
export type ChannelOutput<C extends Channel> = Contract[C]['output']

export const CHANNELS = Object.keys(contract) as Channel[]

export interface IpcError {
  code: string
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

// ---------- Événements principal → interface ----------

export interface EventMap {
  'whatsapp:state': WhatsAppState
  'google:state': GoogleCalendarState
  'data:changed': { entities: DataEntity[] }
  'license:changed': LicenseState
}

export type DataEntity =
  | 'appointments'
  | 'clients'
  | 'services'
  | 'staff'
  | 'payments'
  | 'expenses'
  | 'settings'
  | 'business'
  | 'resources'
  | 'templates'
  | 'reminders'
  | 'backups'
  | 'notifications'

export type EventName = keyof EventMap
export const EVENTS: EventName[] = ['whatsapp:state', 'google:state', 'data:changed', 'license:changed']

export type { ClientInput, StaffInput, ServiceInput, AppointmentInput }
type ClientInput = z.input<typeof clientInputSchema>
type StaffInput = z.input<typeof staffInputSchema>
type ServiceInput = z.input<typeof serviceInputSchema>
type AppointmentInput = z.input<typeof appointmentInputSchema>
