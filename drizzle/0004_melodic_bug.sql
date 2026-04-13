CREATE TABLE `inventory` (
	`inventory_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`medication_name` text NOT NULL,
	`form` text NOT NULL,
	`unit` text NOT NULL,
	`total_qty` real NOT NULL,
	`remaining_qty` real NOT NULL,
	`expiration_date` text,
	`status` text DEFAULT 'ACTIVE',
	`created_at` text NOT NULL,
	`depleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medication_plans` (
	`plan_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`inventory_id` integer NOT NULL,
	`disease_id` integer,
	`is_sos` integer DEFAULT false,
	`interval_hint` text,
	`doses_config` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inventory_id`) REFERENCES `inventory`(`inventory_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`disease_id`) REFERENCES `diseases`(`disease_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `medications`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_medication_logs` (
	`log_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`scheduled_date` text,
	`scheduled_time` text,
	`taken_at` text,
	`amount` real NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `medication_plans`(`plan_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_medication_logs`("log_id", "plan_id", "scheduled_date", "scheduled_time", "taken_at", "amount", "status") SELECT "log_id", "plan_id", "scheduled_date", "scheduled_time", "taken_at", "amount", "status" FROM `medication_logs`;--> statement-breakpoint
DROP TABLE `medication_logs`;--> statement-breakpoint
ALTER TABLE `__new_medication_logs` RENAME TO `medication_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;