PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_medications` (
	`medication_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`medication_name` text NOT NULL,
	`form` text NOT NULL,
	`unit` text NOT NULL,
	`days_of_week` text DEFAULT '1,2,3,4,5,6,7',
	`doses_config` text NOT NULL,
	`total_qty` real NOT NULL,
	`remaining_qty` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_medications`("medication_id", "user_id", "medication_name", "form", "unit", "days_of_week", "doses_config", "total_qty", "remaining_qty", "created_at") SELECT "medication_id", "user_id", "medication_name", "form", "unit", "days_of_week", "doses_config", "total_qty", "remaining_qty", "created_at" FROM `medications`;--> statement-breakpoint
DROP TABLE `medications`;--> statement-breakpoint
ALTER TABLE `__new_medications` RENAME TO `medications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_medication_logs` (
	`log_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medication_id` integer,
	`taken_at` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`medication_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_medication_logs`("log_id", "medication_id", "taken_at", "scheduled_for", "status") SELECT "log_id", "medication_id", "taken_at", "scheduled_for", "status" FROM `medication_logs`;--> statement-breakpoint
DROP TABLE `medication_logs`;--> statement-breakpoint
ALTER TABLE `__new_medication_logs` RENAME TO `medication_logs`;--> statement-breakpoint
ALTER TABLE `users` ADD `created_at` text NOT NULL;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `avatar`;