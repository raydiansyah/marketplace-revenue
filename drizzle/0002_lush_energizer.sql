CREATE TABLE `access_token_blacklist` (
	`jti` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`reason` varchar(40) DEFAULT 'logout',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_token_blacklist_jti` PRIMARY KEY(`jti`)
);
--> statement-breakpoint
CREATE TABLE `ads_entries` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`store_id` varchar(40) NOT NULL,
	`marketplace` enum('shopee','tokopedia','lazada') NOT NULL,
	`period_year` smallint unsigned NOT NULL,
	`period_month` tinyint unsigned NOT NULL,
	`campaign_name` varchar(255) NOT NULL DEFAULT '',
	`sku` varchar(191) DEFAULT '',
	`spend` decimal(20,8) NOT NULL DEFAULT '0',
	`impressions` int unsigned NOT NULL DEFAULT 0,
	`clicks` int unsigned NOT NULL DEFAULT 0,
	`conversions` int unsigned NOT NULL DEFAULT 0,
	`revenue` decimal(20,8) NOT NULL DEFAULT '0',
	`source_file_name` varchar(255) DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ads_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_agent_personas` (
	`id` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(500),
	`system_prompt` text NOT NULL,
	`tone` enum('formal','casual','expert','friendly') NOT NULL DEFAULT 'formal',
	`is_default` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_agent_personas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_providers` (
	`id` varchar(40) NOT NULL,
	`provider` enum('anthropic','openai') NOT NULL,
	`label` varchar(100) NOT NULL,
	`base_url` varchar(255),
	`encrypted_api_key` varchar(2048) NOT NULL,
	`default_model` varchar(100),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`last_test_at` timestamp,
	`created_by_user_id` varchar(40),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ai_provider_label` UNIQUE(`provider`,`label`)
);
--> statement-breakpoint
CREATE TABLE `ai_request_logs` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`provider_id` varchar(40) NOT NULL,
	`model` varchar(100) NOT NULL,
	`kind` varchar(40) NOT NULL,
	`prompt_summary` varchar(500) DEFAULT '',
	`tokens_in` int unsigned NOT NULL DEFAULT 0,
	`tokens_out` int unsigned NOT NULL DEFAULT 0,
	`cache_creation_tokens` int unsigned NOT NULL DEFAULT 0,
	`cache_read_tokens` int unsigned NOT NULL DEFAULT 0,
	`duration_ms` int unsigned NOT NULL DEFAULT 0,
	`success` tinyint NOT NULL DEFAULT 1,
	`error_message` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_request_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cashflow_entries` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`store_id` varchar(40) NOT NULL,
	`period_year` smallint unsigned NOT NULL,
	`period_month` tinyint unsigned NOT NULL,
	`category` enum('income','expense') NOT NULL,
	`sub_category` varchar(100) NOT NULL DEFAULT '',
	`amount` decimal(20,8) NOT NULL DEFAULT '0',
	`description` varchar(500) NOT NULL DEFAULT '',
	`txn_date` date NOT NULL,
	`source_file_name` varchar(255) DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cashflow_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hpp_marketplace_entries` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`marketplace` enum('shopee','tokopedia','lazada') NOT NULL,
	`sku` varchar(191) NOT NULL DEFAULT '',
	`product_name` varchar(500) NOT NULL,
	`master_sku` varchar(191),
	`master_product_name` varchar(500),
	`cost` decimal(20,8) NOT NULL DEFAULT '0',
	`source_file_name` varchar(255),
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hpp_marketplace_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_events` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`event` enum('login','logout','refresh','failure') NOT NULL,
	`ip` varchar(45) DEFAULT '',
	`user_agent` varchar(255) DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rag_chunks` (
	`id` varchar(40) NOT NULL,
	`document_id` varchar(40) NOT NULL,
	`chunk_index` int NOT NULL,
	`content` text NOT NULL,
	CONSTRAINT `rag_chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rag_documents` (
	`id` varchar(40) NOT NULL,
	`title` varchar(255) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`char_count` int NOT NULL DEFAULT 0,
	`chunk_count` int NOT NULL DEFAULT 0,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rag_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`parent_id` varchar(40),
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`user_agent` varchar(255) DEFAULT '',
	`ip` varchar(45) DEFAULT '',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `saved_reports` ADD `store_id` varchar(40);--> statement-breakpoint
ALTER TABLE `saved_reports` ADD `period_year` smallint unsigned;--> statement-breakpoint
ALTER TABLE `saved_reports` ADD `period_month` tinyint unsigned;--> statement-breakpoint
CREATE INDEX `idx_blacklist_expires` ON `access_token_blacklist` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_ads_store_period` ON `ads_entries` (`store_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_ads_user_period` ON `ads_entries` (`user_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_ads_sku` ON `ads_entries` (`user_id`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_persona_default` ON `ai_agent_personas` (`is_default`);--> statement-breakpoint
CREATE INDEX `idx_ai_active` ON `ai_providers` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_ai_logs_user_created` ON `ai_request_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_logs_provider` ON `ai_request_logs` (`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_cf_store_period_cat` ON `cashflow_entries` (`store_id`,`period_year`,`period_month`,`category`);--> statement-breakpoint
CREATE INDEX `idx_cf_user_date` ON `cashflow_entries` (`user_id`,`txn_date`);--> statement-breakpoint
CREATE INDEX `idx_hpp_mp_user_mp_sku` ON `hpp_marketplace_entries` (`user_id`,`marketplace`,`sku`);--> statement-breakpoint
CREATE INDEX `idx_hpp_mp_user_master_sku` ON `hpp_marketplace_entries` (`user_id`,`master_sku`);--> statement-breakpoint
CREATE INDEX `idx_login_user_created` ON `login_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_rag_chunks_doc` ON `rag_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `idx_rt_user` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_rt_token_hash` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_rt_expires` ON `refresh_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_mu_user_uploaded_at` ON `monthly_uploads` (`user_id`,`uploaded_at`);--> statement-breakpoint
CREATE INDEX `idx_sr_store_period` ON `saved_reports` (`store_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_sr_user_period` ON `saved_reports` (`user_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_stores_user_mp` ON `stores` (`user_id`,`marketplace`);