CREATE TABLE `user_api_keys` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`encrypted_key` text NOT NULL,
	`hint` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
