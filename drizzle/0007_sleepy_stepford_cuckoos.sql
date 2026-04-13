CREATE TABLE `visit_documents` (
	`document_id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`visit_id` integer NOT NULL,
	`uri` text NOT NULL,
	`type` text DEFAULT 'IMAGE',
	`created_at` text NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`visit_id`) ON UPDATE no action ON DELETE no action
);
