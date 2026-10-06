CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`details` text
);
--> statement-breakpoint
CREATE INDEX `activity_logs_at_idx` ON `activity_logs` (`at`);--> statement-breakpoint
CREATE TABLE `appointment_series` (
	`id` text PRIMARY KEY NOT NULL,
	`frequency` text NOT NULL,
	`count` integer,
	`until` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `appointment_services` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`service_id` text,
	`name` text NOT NULL,
	`duration_min` integer NOT NULL,
	`price` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `appointment_services_appt_idx` ON `appointment_services` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `appointment_services_service_idx` ON `appointment_services` (`service_id`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`staff_id` text,
	`resource_id` text,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`buffer_before_min` integer DEFAULT 0 NOT NULL,
	`buffer_after_min` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`reminder_enabled` integer DEFAULT false NOT NULL,
	`reminder_offset_min` integer DEFAULT 1440 NOT NULL,
	`series_id` text,
	`series_index` integer,
	`google_event_id` text,
	`google_sync_status` text,
	`google_sync_error` text,
	`google_synced_at` integer,
	`status_changed_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`series_id`) REFERENCES `appointment_series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `appointments_start_idx` ON `appointments` (`start_at`);--> statement-breakpoint
CREATE INDEX `appointments_staff_start_idx` ON `appointments` (`staff_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `appointments_client_idx` ON `appointments` (`client_id`);--> statement-breakpoint
CREATE INDEX `appointments_resource_idx` ON `appointments` (`resource_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `appointments_series_idx` ON `appointments` (`series_id`);--> statement-breakpoint
CREATE INDEX `appointments_google_idx` ON `appointments` (`google_sync_status`);--> statement-breakpoint
CREATE TABLE `business_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`whatsapp` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`logo_data_url` text,
	`currency` text DEFAULT 'MAD' NOT NULL,
	`timezone` text DEFAULT 'Africa/Casablanca' NOT NULL,
	`category_id` text NOT NULL,
	`terminology` text DEFAULT '{}' NOT NULL,
	`onboarded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `client_tags` (
	`client_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`client_id`, `tag`),
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_tags_tag_idx` ON `client_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`whatsapp_phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`birth_date` text,
	`gender` text,
	`address` text DEFAULT '' NOT NULL,
	`insurance` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clients_phone_idx` ON `clients` (`phone`);--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `clients_archived_idx` ON `clients` (`archived_at`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`date` text NOT NULL,
	`method` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`date`);--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` integer PRIMARY KEY NOT NULL,
	`edition` text NOT NULL,
	`code_fingerprint` text NOT NULL,
	`activated_at` integer NOT NULL,
	`signature` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text,
	`client_id` text,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`paid_at` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`receipt_number` text NOT NULL,
	`voided_at` integer,
	`void_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_number_idx` ON `payments` (`receipt_number`);--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paid_at`);--> statement-breakpoint
CREATE INDEX `payments_appointment_idx` ON `payments` (`appointment_id`);--> statement-breakpoint
CREATE INDEX `payments_client_idx` ON `payments` (`client_id`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`appointment_id` text NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`kind` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`next_attempt_at` integer,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`message` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reminders_dedupe_idx` ON `reminders` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `reminders_status_idx` ON `reminders` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `reminders_appointment_idx` ON `reminders` (`appointment_id`);--> statement-breakpoint
CREATE TABLE `resources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`duration_min` integer NOT NULL,
	`price` integer NOT NULL,
	`color` text,
	`active` integer DEFAULT true NOT NULL,
	`buffer_before_min` integer DEFAULT 0 NOT NULL,
	`buffer_after_min` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `services_category_idx` ON `services` (`category_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`avatar_data_url` text,
	`color` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`commission_rate` real,
	`use_business_hours` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `staff_active_idx` ON `staff` (`active`);--> statement-breakpoint
CREATE TABLE `staff_breaks` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`weekday` integer NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `staff_breaks_staff_idx` ON `staff_breaks` (`staff_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `staff_services` (
	`staff_id` text NOT NULL,
	`service_id` text NOT NULL,
	PRIMARY KEY(`staff_id`, `service_id`),
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `working_hours` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`weekday` integer NOT NULL,
	`is_open` integer NOT NULL,
	`start_min` integer NOT NULL,
	`end_min` integer NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `working_hours_staff_idx` ON `working_hours` (`staff_id`,`weekday`);