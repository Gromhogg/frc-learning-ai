CREATE TABLE `conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`images` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `team_facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`google_id` text,
	`avatar_url` text,
	`password_hash` text,
	`role` text DEFAULT 'student' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);