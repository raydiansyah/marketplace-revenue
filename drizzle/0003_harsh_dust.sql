CREATE TABLE `hpp_sku_aliases` (
	`id` varchar(40) NOT NULL,
	`user_id` varchar(40) NOT NULL,
	`order_sku` varchar(191) NOT NULL,
	`master_entry_id` varchar(40) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `hpp_sku_aliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `hpp_marketplace_entries` MODIFY COLUMN `marketplace` enum('shopee','tokopedia','lazada');--> statement-breakpoint
CREATE INDEX `idx_hpp_aliases_user_sku` ON `hpp_sku_aliases` (`user_id`,`order_sku`);