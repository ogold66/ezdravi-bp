CREATE TABLE `diseases` (
	`disease_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`disease_name` text NOT NULL,
	`type` text NOT NULL,
	`note` text,
	`start_date` text,
	`end_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medication_logs` (
	`medication_logs_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medication_id` integer NOT NULL,
	`taken_at` text,
	`scheduled_for` text,
	`status` text,
	FOREIGN KEY (`medication_id`) REFERENCES `medications`(`medication_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medications` (
	`medication_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`disease_id` integer,
	`visit_id` integer,
	`medication_name` text NOT NULL,
	`form` text,
	`unit` text,
	`is_sos` integer DEFAULT false,
	`morning` integer DEFAULT false,
	`noon` integer DEFAULT false,
	`evening` integer DEFAULT false,
	`interval_hint` text,
	`start_date` text,
	`end_date` text,
	`total_qty` integer,
	`remaining_qty` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`disease_id`) REFERENCES `diseases`(`disease_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`visit_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`user_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar` text
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`visit_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`disease_id` integer,
	`hospital` text,
	`department` text,
	`date` text,
	`doctor` text,
	`note` text,
	`medical_report` text,
	`status` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`disease_id`) REFERENCES `diseases`(`disease_id`) ON UPDATE no action ON DELETE no action
);
