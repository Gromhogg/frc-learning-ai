CREATE TABLE `prompt_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` integer NOT NULL,
	`text` text NOT NULL,
	`author_id` integer,
	`author_name` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_versions_version_unique` ON `prompt_versions` (`version`);