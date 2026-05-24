CREATE INDEX `chats_created_at_idx` ON `chats` (`created_at`);--> statement-breakpoint
CREATE INDEX `messages_chat_id_idx` ON `messages` (`chat_id`);