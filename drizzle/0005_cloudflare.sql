CREATE TABLE `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_start` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slack_channel_buffer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`channel_name` text,
	`ts` text NOT NULL,
	`slack_user_id` text,
	`text` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `slack_events_seen` (
	`event_id` text PRIMARY KEY NOT NULL,
	`seen_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `slack_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`ts` text NOT NULL,
	`message_id` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_messages_channel_ts` ON `slack_messages` (`channel_id`,`ts`);--> statement-breakpoint
CREATE TABLE `slack_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel_id` text NOT NULL,
	`thread_ts` text NOT NULL,
	`conversation_id` integer NOT NULL,
	`last_activity_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `slack_threads_channel_thread` ON `slack_threads` (`channel_id`,`thread_ts`);--> statement-breakpoint
CREATE TABLE `slack_users` (
	`slack_user_id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`slack_team_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`key` text NOT NULL,
	`day` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`key`, `day`)
);
--> statement-breakpoint
ALTER TABLE `team_facts` ADD `source_label` text;