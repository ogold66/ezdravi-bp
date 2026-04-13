ALTER TABLE `medications` ADD `doses_times` text;--> statement-breakpoint
ALTER TABLE `medications` DROP COLUMN `morning`;--> statement-breakpoint
ALTER TABLE `medications` DROP COLUMN `noon`;--> statement-breakpoint
ALTER TABLE `medications` DROP COLUMN `evening`;