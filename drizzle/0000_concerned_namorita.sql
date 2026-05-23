CREATE TABLE `hpp_entries` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`sku` varchar(191) NOT NULL,
	`product_name` varchar(500) NOT NULL,
	`master_product_name` varchar(500),
	`master_sku` varchar(191),
	`cost` decimal(20,8) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hpp_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_reports` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(100) NOT NULL,
	`marketplace` varchar(20) NOT NULL,
	`store_name` varchar(191) NOT NULL,
	`label` varchar(191) NOT NULL,
	`report_json` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_configs` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`marketplace` varchar(20) NOT NULL,
	`config_json` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(40) NOT NULL,
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('superadmin','admin','finance') NOT NULL DEFAULT 'finance',
	`name` varchar(191) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `idx_hpp_user_sku` ON `hpp_entries` (`user_id`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_saved_reports_user_created` ON `saved_reports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_saved_reports_user_marketplace` ON `saved_reports` (`user_id`,`marketplace`);--> statement-breakpoint
CREATE INDEX `idx_user_configs_user_marketplace` ON `user_configs` (`user_id`,`marketplace`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);