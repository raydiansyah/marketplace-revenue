/**
 * Module: Database Schema
 * Purpose: Drizzle ORM table definitions for TiDB (MySQL-compatible)
 * Used by: src/lib/db/client.ts, all API routes via query helpers
 * Dependencies: drizzle-orm/mysql-core
 * Tables: users, savedReports, hppEntries, userConfigs, passwordResetTokens, stores, monthlyUploads
 * Side effects: Schema changes require npm run db:generate then db:migrate
 */

import {
  mysqlTable,
  varchar,
  timestamp,
  json,
  index,
  uniqueIndex,
  mysqlEnum,
  decimal,
  tinyint,
  smallint,
  int,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import type { RevenueReport } from "@/lib/types";

export const savedReports = mysqlTable(
  "saved_reports",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 100 }).notNull(),
    marketplace: varchar("marketplace", { length: 20 }).notNull(),
    storeName: varchar("store_name", { length: 191 }).notNull(),
    label: varchar("label", { length: 191 }).notNull(),
    reportJson: json("report_json").$type<RevenueReport>().notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index("idx_saved_reports_user_created").on(
      table.userId,
      table.createdAt
    ),
    userMarketplaceIdx: index("idx_saved_reports_user_marketplace").on(
      table.userId,
      table.marketplace
    ),
  })
);

export type SavedReportRow = typeof savedReports.$inferSelect;
export type NewSavedReportRow = typeof savedReports.$inferInsert;

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    email: varchar("email", { length: 191 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["superadmin", "admin", "finance"])
      .notNull()
      .default("finance"),
    name: varchar("name", { length: 191 }).notNull(),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    emailIdx: index("idx_users_email").on(table.email),
  })
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    userIdx: index("idx_password_reset_user").on(table.userId),
    tokenIdx: index("idx_password_reset_token").on(table.tokenHash),
    expiresIdx: index("idx_password_reset_expires").on(table.expiresAt),
  })
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;

export const hppEntries = mysqlTable(
  "hpp_entries",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    sku: varchar("sku", { length: 191 }).notNull(),
    productName: varchar("product_name", { length: 500 }).notNull(),
    masterProductName: varchar("master_product_name", { length: 500 }),
    masterSku: varchar("master_sku", { length: 191 }),
    cost: decimal("cost", { precision: 20, scale: 8 }).notNull().default("0"),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    userSkuIdx: index("idx_hpp_user_sku").on(table.userId, table.sku),
  })
);

export type HppEntryRow = typeof hppEntries.$inferSelect;
export type NewHppEntryRow = typeof hppEntries.$inferInsert;

export const userConfigs = mysqlTable(
  "user_configs",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    marketplace: varchar("marketplace", { length: 20 }).notNull(),
    configJson: json("config_json").notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    userMarketplaceIdx: index("idx_user_configs_user_marketplace").on(
      table.userId,
      table.marketplace
    ),
  })
);

export type UserConfigRow = typeof userConfigs.$inferSelect;
export type NewUserConfigRow = typeof userConfigs.$inferInsert;

// ============================================================
// STORES
// ============================================================

export const stores = mysqlTable(
  "stores",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]).notNull(),
    storeName: varchar("store_name", { length: 191 }).notNull(),
    externalShopId: varchar("external_shop_id", { length: 191 }),
    isActive: tinyint("is_active").default(1).notNull(),
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .onUpdateNow()
      .notNull(),
  },
  (table) => ({
    uqUserMpName: uniqueIndex("uq_stores_user_mp_name").on(
      table.userId,
      table.marketplace,
      table.storeName
    ),
    userIdx: index("idx_stores_user").on(table.userId),
  })
);

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;

// ============================================================
// MONTHLY UPLOADS
// ============================================================

export const monthlyUploads = mysqlTable(
  "monthly_uploads",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    storeId: varchar("store_id", { length: 40 }).notNull(),
    marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]).notNull(),
    periodYear: smallint("period_year", { unsigned: true }).notNull(),
    periodMonth: tinyint("period_month", { unsigned: true }).notNull(),
    fileType: mysqlEnum("file_type", [
      "order",
      "income",
      "return",
      "cancel",
      "failed",
      "ads",
      "cashflow",
    ]).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    parsedJson: json("parsed_json").notNull(),
    rawRowCount: int("raw_row_count", { unsigned: true }).default(0).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    uploadedAt: timestamp("uploaded_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    storeperiodtypeIdx: index("idx_mu_store_period_type").on(
      table.storeId,
      table.periodYear,
      table.periodMonth,
      table.fileType
    ),
    userPeriodIdx: index("idx_mu_user_period").on(
      table.userId,
      table.periodYear,
      table.periodMonth
    ),
    uqDedupe: uniqueIndex("uq_mu_dedupe").on(
      table.storeId,
      table.periodYear,
      table.periodMonth,
      table.fileType,
      table.checksumSha256
    ),
  })
);

export type MonthlyUploadRow = typeof monthlyUploads.$inferSelect;
export type NewMonthlyUploadRow = typeof monthlyUploads.$inferInsert;
