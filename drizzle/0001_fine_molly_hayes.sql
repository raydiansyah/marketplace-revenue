CREATE TABLE `monthly_uploads` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`store_id` varchar(40) NOT NULL,
	`marketplace` enum('shopee','tokopedia','lazada') NOT NULL,
	`period_year` smallint unsigned NOT NULL,
	`period_month` tinyint unsigned NOT NULL,
	`file_type` enum('order','income','return','cancel','failed','ads','cashflow') NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`parsed_json` json NOT NULL,
	`raw_row_count` int unsigned NOT NULL DEFAULT 0,
	`checksum_sha256` varchar(64) NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_uploads_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_mu_dedupe` UNIQUE(`store_id`,`period_year`,`period_month`,`file_type`,`checksum_sha256`)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`marketplace` enum('shopee','tokopedia','lazada') NOT NULL,
	`store_name` varchar(191) NOT NULL,
	`external_shop_id` varchar(191),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_stores_user_mp_name` UNIQUE(`user_id`,`marketplace`,`store_name`)
);
--> statement-breakpoint
CREATE INDEX `idx_mu_store_period_type` ON `monthly_uploads` (`store_id`,`period_year`,`period_month`,`file_type`);--> statement-breakpoint
CREATE INDEX `idx_mu_user_period` ON `monthly_uploads` (`user_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_user` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_token` ON `password_reset_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_password_reset_expires` ON `password_reset_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_stores_user` ON `stores` (`user_id`);