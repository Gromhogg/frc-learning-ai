CREATE TABLE `admin_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` integer,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target` text,
	`summary` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `email_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 1 NOT NULL,
	`last_sent_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_codes_email_unique` ON `email_codes` (`email`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`stated_focus` text,
	`suggestions` text DEFAULT '[]' NOT NULL,
	`suggestions_generated_at` text,
	`suggestions_dirty` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `team_facts` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `admin_since` text;--> statement-breakpoint
UPDATE `users` SET `admin_since` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `role` = 'admin';--> statement-breakpoint
UPDATE `users` SET `email_verified_at` = COALESCE(`created_at`, CURRENT_TIMESTAMP) WHERE `google_id` IS NOT NULL;
