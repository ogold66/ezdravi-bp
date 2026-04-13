ALTER TABLE `medications` ADD `disease_id` integer REFERENCES diseases(disease_id);--> statement-breakpoint
ALTER TABLE `medications` ADD `visit_id` integer REFERENCES visits(visit_id);--> statement-breakpoint
ALTER TABLE `medications` ADD `is_sos` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `medications` ADD `interval_hint` text;--> statement-breakpoint
ALTER TABLE `medications` ADD `start_date` text;--> statement-breakpoint
ALTER TABLE `medications` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `medications` DROP COLUMN `days_of_week`;