// Schéma SQLite de DigiPlan (Drizzle ORM).
// Conventions : identifiants UUID (texte), montants en centimes, instants en millisecondes (UTC epoch).

import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}

/** Profil de l'établissement (ligne unique id = 1). */
export const businessSettings = sqliteTable('business_settings', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  ownerName: text('owner_name').notNull().default(''),
  phone: text('phone').notNull().default(''),
  whatsapp: text('whatsapp').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  city: text('city').notNull().default(''),
  logoDataUrl: text('logo_data_url'),
  currency: text('currency').notNull().default('MAD'),
  timezone: text('timezone').notNull().default('Africa/Casablanca'),
  categoryId: text('category_id').notNull(),
  terminology: text('terminology', { mode: 'json' }).notNull().default(sql`'{}'`),
  onboardedAt: integer('onboarded_at'),
  ...timestamps
})

/** Paramètres clé/valeur (JSON). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const staff = sqliteTable(
  'staff',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    avatarDataUrl: text('avatar_data_url'),
    color: text('color').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    commissionRate: real('commission_rate'),
    useBusinessHours: integer('use_business_hours', { mode: 'boolean' }).notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at'),
    ...timestamps
  },
  (t) => [index('staff_active_idx').on(t.active)]
)

/** Horaires hebdomadaires : staff_id NULL = horaires de l'établissement. */
export const workingHours = sqliteTable(
  'working_hours',
  {
    id: text('id').primaryKey(),
    staffId: text('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    isOpen: integer('is_open', { mode: 'boolean' }).notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull()
  },
  (t) => [index('working_hours_staff_idx').on(t.staffId, t.weekday)]
)

/** Pauses hebdomadaires : staff_id NULL = pause de l'établissement. */
export const staffBreaks = sqliteTable(
  'staff_breaks',
  {
    id: text('id').primaryKey(),
    staffId: text('staff_id').references(() => staff.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    startMin: integer('start_min').notNull(),
    endMin: integer('end_min').notNull()
  },
  (t) => [index('staff_breaks_staff_idx').on(t.staffId, t.weekday)]
)

export const clients = sqliteTable(
  'clients',
  {
    id: text('id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    whatsappPhone: text('whatsapp_phone').notNull().default(''),
    email: text('email').notNull().default(''),
    birthDate: text('birth_date'),
    gender: text('gender'),
    address: text('address').notNull().default(''),
    insurance: text('insurance').notNull().default(''),
    notes: text('notes').notNull().default(''),
    /** Texte normalisé pour la recherche (nom, prénom, téléphone, email). */
    searchText: text('search_text').notNull().default(''),
    archivedAt: integer('archived_at'),
    ...timestamps
  },
  (t) => [
    index('clients_phone_idx').on(t.phone),
    index('clients_name_idx').on(t.firstName, t.lastName),
    index('clients_archived_idx').on(t.archivedAt)
  ]
)

export const clientTags = sqliteTable(
  'client_tags',
  {
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull()
  },
  (t) => [primaryKey({ columns: [t.clientId, t.tag] }), index('client_tags_tag_idx').on(t.tag)]
)

export const serviceCategories = sqliteTable('service_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps
})

export const services = sqliteTable(
  'services',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id').references(() => serviceCategories.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    durationMin: integer('duration_min').notNull(),
    price: integer('price').notNull(),
    color: text('color'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
    bufferAfterMin: integer('buffer_after_min').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: integer('archived_at'),
    ...timestamps
  },
  (t) => [index('services_category_idx').on(t.categoryId)]
)

export const staffServices = sqliteTable(
  'staff_services',
  {
    staffId: text('staff_id')
      .notNull()
      .references(() => staff.id, { onDelete: 'cascade' }),
    serviceId: text('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.staffId, t.serviceId] })]
)

export const resources = sqliteTable('resources', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  archivedAt: integer('archived_at'),
  ...timestamps
})

export const appointmentSeries = sqliteTable('appointment_series', {
  id: text('id').primaryKey(),
  frequency: text('frequency').notNull(),
  count: integer('count'),
  until: text('until'),
  createdAt: integer('created_at').notNull()
})

export const appointments = sqliteTable(
  'appointments',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    staffId: text('staff_id').references(() => staff.id, { onDelete: 'set null' }),
    resourceId: text('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    startAt: integer('start_at').notNull(),
    endAt: integer('end_at').notNull(),
    bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
    bufferAfterMin: integer('buffer_after_min').notNull().default(0),
    status: text('status').notNull(),
    subtotal: integer('subtotal').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    total: integer('total').notNull().default(0),
    notes: text('notes').notNull().default(''),
    reminderEnabled: integer('reminder_enabled', { mode: 'boolean' }).notNull().default(false),
    reminderOffsetMin: integer('reminder_offset_min').notNull().default(1440),
    seriesId: text('series_id').references(() => appointmentSeries.id, { onDelete: 'set null' }),
    seriesIndex: integer('series_index'),
    googleEventId: text('google_event_id'),
    googleSyncStatus: text('google_sync_status'),
    googleSyncError: text('google_sync_error'),
    googleSyncedAt: integer('google_synced_at'),
    statusChangedAt: integer('status_changed_at'),
    deletedAt: integer('deleted_at'),
    ...timestamps
  },
  (t) => [
    index('appointments_start_idx').on(t.startAt),
    index('appointments_staff_start_idx').on(t.staffId, t.startAt),
    index('appointments_client_idx').on(t.clientId),
    index('appointments_resource_idx').on(t.resourceId, t.startAt),
    index('appointments_series_idx').on(t.seriesId),
    index('appointments_google_idx').on(t.googleSyncStatus)
  ]
)

export const appointmentServices = sqliteTable(
  'appointment_services',
  {
    id: text('id').primaryKey(),
    appointmentId: text('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    serviceId: text('service_id').references(() => services.id, { onDelete: 'set null' }),
    /** Copie du nom au moment de la réservation (historique fiable). */
    name: text('name').notNull(),
    durationMin: integer('duration_min').notNull(),
    price: integer('price').notNull(),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (t) => [index('appointment_services_appt_idx').on(t.appointmentId), index('appointment_services_service_idx').on(t.serviceId)]
)

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    appointmentId: text('appointment_id').references(() => appointments.id, { onDelete: 'set null' }),
    clientId: text('client_id').references(() => clients.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    method: text('method').notNull(),
    paidAt: integer('paid_at').notNull(),
    note: text('note').notNull().default(''),
    receiptNumber: text('receipt_number').notNull(),
    voidedAt: integer('voided_at'),
    voidReason: text('void_reason'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('payments_receipt_number_idx').on(t.receiptNumber),
    index('payments_paid_at_idx').on(t.paidAt),
    index('payments_appointment_idx').on(t.appointmentId),
    index('payments_client_idx').on(t.clientId)
  ]
)

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    appointmentId: text('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('whatsapp'),
    kind: text('kind').notNull(),
    /** Clé d'unicité : empêche de planifier deux fois le même rappel pour le même horaire. */
    dedupeKey: text('dedupe_key').notNull(),
    scheduledAt: integer('scheduled_at').notNull(),
    nextAttemptAt: integer('next_attempt_at'),
    status: text('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    sentAt: integer('sent_at'),
    message: text('message'),
    error: text('error'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('reminders_dedupe_idx').on(t.dedupeKey),
    index('reminders_status_idx').on(t.status, t.scheduledAt),
    index('reminders_appointment_idx').on(t.appointmentId)
  ]
)

export const messageTemplates = sqliteTable('message_templates', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
})

export const expenses = sqliteTable(
  'expenses',
  {
    id: text('id').primaryKey(),
    category: text('category').notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull().default(''),
    date: text('date').notNull(),
    method: text('method').notNull(),
    notes: text('notes').notNull().default(''),
    deletedAt: integer('deleted_at'),
    ...timestamps
  },
  (t) => [index('expenses_date_idx').on(t.date)]
)

export const licenses = sqliteTable('licenses', {
  id: integer('id').primaryKey(),
  edition: text('edition').notNull(),
  codeFingerprint: text('code_fingerprint').notNull(),
  activatedAt: integer('activated_at').notNull(),
  signature: text('signature').notNull()
})

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: integer('at').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    details: text('details')
  },
  (t) => [index('activity_logs_at_idx').on(t.at)]
)
