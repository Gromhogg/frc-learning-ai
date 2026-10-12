ALTER TABLE `conversations` ADD `learned_through_message_id` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `prompt_versions` ADD `format` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_facts` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `team_facts` ADD `source_user_id` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `team_facts` ADD `source_conversation_id` integer REFERENCES conversations(id);--> statement-breakpoint
ALTER TABLE `team_facts` ADD `reviewed_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `team_facts` ADD `reviewed_at` text;--> statement-breakpoint
UPDATE `team_facts` SET `status` = 'approved';