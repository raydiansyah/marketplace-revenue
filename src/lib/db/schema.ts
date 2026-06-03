/**
 * Module: Database Schema
 * Purpose: Drizzle ORM table definitions for TiDB (MySQL-compatible)
 * Used by: src/lib/db/client.ts, all API routes via query helpers
 * Dependencies: drizzle-orm/mysql-core
 * Tables: users, savedReports, hppEntries, userConfigs, passwordResetTokens, stores, monthlyUploads, hppMarketplaceEntries, adsEntries, cashflowEntries, aiProviders, aiRequestLogs, refreshTokens, accessTokenBlacklist, loginEvents, aiAgentPersonas, ragDocuments, ragChunks
 * Side effects: Schema changes require npm run db:generate then db:migrate
 * Phase 2: savedReports extended with storeId, periodYear, periodMonth
 * Phase 3: hppMarketplaceEntries added for per-marketplace HPP management
 * Phase 4: adsEntries + cashflowEntries added for Ads & Cashflow modules
 * Phase 5: aiProviders + aiRequestLogs added for AI features
 * Phase 6: refreshTokens + accessTokenBlacklist + loginEvents added for JWT hardening
 * Phase 7: aiAgentPersonas + ragDocuments + ragChunks added for RAG + persona management
 */

import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  json,
  index,
  uniqueIndex,
  mysqlEnum,
  decimal,
  tinyint,
  smallint,
  int,
  date,
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
    // Phase 2: multi-toko + monthly period tracking
    storeId: varchar("store_id", { length: 40 }),
    periodYear: smallint("period_year", { unsigned: true }),
    periodMonth: tinyint("period_month", { unsigned: true }),
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
    storePeriodIdx: index("idx_sr_store_period").on(
      table.storeId,
      table.periodYear,
      table.periodMonth
    ),
    userPeriodIdx: index("idx_sr_user_period").on(
      table.userId,
      table.periodYear,
      table.periodMonth
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

// ============================================================
// HPP MARKETPLACE ENTRIES
// ============================================================

export const hppMarketplaceEntries = mysqlTable(
  "hpp_marketplace_entries",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: varchar("user_id", { length: 40 }).notNull(),
    marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]).notNull(),
    sku: varchar("sku", { length: 191 }).notNull().default(""),
    productName: varchar("product_name", { length: 500 }).notNull(),
    masterSku: varchar("master_sku", { length: 191 }),
    masterProductName: varchar("master_product_name", { length: 500 }),
    cost: decimal("cost", { precision: 20, scale: 8 }).notNull().default("0"),
    sourceFileName: varchar("source_file_name", { length: 255 }),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (t) => ({
    userMpSkuIdx: index("idx_hpp_mp_user_mp_sku").on(t.userId, t.marketplace, t.sku),
    userMasterSkuIdx: index("idx_hpp_mp_user_master_sku").on(t.userId, t.masterSku),
  })
);

export type HppMarketplaceEntryRow = typeof hppMarketplaceEntries.$inferSelect;
export type NewHppMarketplaceEntryRow = typeof hppMarketplaceEntries.$inferInsert;

// ============================================================
// ADS ENTRIES
// ============================================================

export const adsEntries = mysqlTable("ads_entries", {
  id: varchar("id", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 40 }).notNull(),
  storeId: varchar("store_id", { length: 40 }).notNull(),
  marketplace: mysqlEnum("marketplace", ["shopee", "tokopedia", "lazada"]).notNull(),
  periodYear: smallint("period_year", { unsigned: true }).notNull(),
  periodMonth: tinyint("period_month", { unsigned: true }).notNull(),
  campaignName: varchar("campaign_name", { length: 255 }).notNull().default(""),
  sku: varchar("sku", { length: 191 }).default(""),
  spend: decimal("spend", { precision: 20, scale: 8 }).notNull().default("0"),
  impressions: int("impressions", { unsigned: true }).default(0).notNull(),
  clicks: int("clicks", { unsigned: true }).default(0).notNull(),
  conversions: int("conversions", { unsigned: true }).default(0).notNull(),
  revenue: decimal("revenue", { precision: 20, scale: 8 }).notNull().default("0"),
  sourceFileName: varchar("source_file_name", { length: 255 }).default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  storePeriodIdx: index("idx_ads_store_period").on(t.storeId, t.periodYear, t.periodMonth),
  userPeriodIdx: index("idx_ads_user_period").on(t.userId, t.periodYear, t.periodMonth),
  skuIdx: index("idx_ads_sku").on(t.userId, t.sku),
}));

export type AdsEntryRow = typeof adsEntries.$inferSelect;
export type NewAdsEntryRow = typeof adsEntries.$inferInsert;

// ============================================================
// CASHFLOW ENTRIES
// ============================================================

export const cashflowEntries = mysqlTable("cashflow_entries", {
  id: varchar("id", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 40 }).notNull(),
  storeId: varchar("store_id", { length: 40 }).notNull(),
  periodYear: smallint("period_year", { unsigned: true }).notNull(),
  periodMonth: tinyint("period_month", { unsigned: true }).notNull(),
  category: mysqlEnum("category", ["income", "expense"]).notNull(),
  subCategory: varchar("sub_category", { length: 100 }).notNull().default(""),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull().default("0"),
  description: varchar("description", { length: 500 }).notNull().default(""),
  txnDate: date("txn_date").notNull(),
  sourceFileName: varchar("source_file_name", { length: 255 }).default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  storePeriodCatIdx: index("idx_cf_store_period_cat").on(t.storeId, t.periodYear, t.periodMonth, t.category),
  userDateIdx: index("idx_cf_user_date").on(t.userId, t.txnDate),
}));

export type CashflowEntryRow = typeof cashflowEntries.$inferSelect;
export type NewCashflowEntryRow = typeof cashflowEntries.$inferInsert;

// ============================================================
// AI PROVIDERS
// ============================================================

export const aiProviders = mysqlTable("ai_providers", {
  id: varchar("id", { length: 40 }).primaryKey(),
  provider: mysqlEnum("provider", ["anthropic", "openai"]).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  baseUrl: varchar("base_url", { length: 255 }),
  encryptedApiKey: varchar("encrypted_api_key", { length: 2048 }).notNull(),
  defaultModel: varchar("default_model", { length: 100 }),
  isActive: tinyint("is_active").default(1).notNull(),
  lastTestAt: timestamp("last_test_at"),
  createdByUserId: varchar("created_by_user_id", { length: 40 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  activeIdx: index("idx_ai_active").on(t.isActive),
  providerLabelUq: uniqueIndex("uq_ai_provider_label").on(t.provider, t.label),
}));

export type AiProviderRow = typeof aiProviders.$inferSelect;
export type NewAiProviderRow = typeof aiProviders.$inferInsert;

// ============================================================
// AI REQUEST LOGS
// ============================================================

export const aiRequestLogs = mysqlTable("ai_request_logs", {
  id: varchar("id", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 40 }).notNull(),
  providerId: varchar("provider_id", { length: 40 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  promptSummary: varchar("prompt_summary", { length: 500 }).default(""),
  tokensIn: int("tokens_in", { unsigned: true }).default(0).notNull(),
  tokensOut: int("tokens_out", { unsigned: true }).default(0).notNull(),
  cacheCreationTokens: int("cache_creation_tokens", { unsigned: true }).default(0).notNull(),
  cacheReadTokens: int("cache_read_tokens", { unsigned: true }).default(0).notNull(),
  durationMs: int("duration_ms", { unsigned: true }).default(0).notNull(),
  success: tinyint("success").default(1).notNull(),
  errorMessage: varchar("error_message", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userCreatedIdx: index("idx_ai_logs_user_created").on(t.userId, t.createdAt),
  providerIdx: index("idx_ai_logs_provider").on(t.providerId),
}));

export type AiRequestLogRow = typeof aiRequestLogs.$inferSelect;
export type NewAiRequestLogRow = typeof aiRequestLogs.$inferInsert;

// ============================================================
// REFRESH TOKENS (Phase 6: JWT hardening)
// ============================================================

export const refreshTokens = mysqlTable("refresh_tokens", {
  id: varchar("id", { length: 40 }).primaryKey(), // jti of refresh token
  userId: varchar("user_id", { length: 40 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(), // sha256 of raw token
  parentId: varchar("parent_id", { length: 40 }), // previous jti in rotation chain
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  userAgent: varchar("user_agent", { length: 255 }).default(""),
  ip: varchar("ip", { length: 45 }).default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userIdx: index("idx_rt_user").on(t.userId),
  tokenHashIdx: index("idx_rt_token_hash").on(t.tokenHash),
  expiresIdx: index("idx_rt_expires").on(t.expiresAt),
}));

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;

// ============================================================
// ACCESS TOKEN BLACKLIST (Phase 6: JWT hardening)
// ============================================================

export const accessTokenBlacklist = mysqlTable("access_token_blacklist", {
  jti: varchar("jti", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 40 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  reason: varchar("reason", { length: 40 }).default("logout"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  expiresIdx: index("idx_blacklist_expires").on(t.expiresAt),
}));

export type AccessTokenBlacklistRow = typeof accessTokenBlacklist.$inferSelect;

// ============================================================
// LOGIN EVENTS (Phase 6: JWT hardening — audit trail)
// ============================================================

export const loginEvents = mysqlTable("login_events", {
  id: varchar("id", { length: 40 }).primaryKey(),
  userId: varchar("user_id", { length: 40 }).notNull(),
  event: mysqlEnum("event", ["login", "logout", "refresh", "failure"]).notNull(),
  ip: varchar("ip", { length: 45 }).default(""),
  userAgent: varchar("user_agent", { length: 255 }).default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  userCreatedIdx: index("idx_login_user_created").on(t.userId, t.createdAt),
}));

export type LoginEventRow = typeof loginEvents.$inferSelect;

// ============================================================
// AI AGENT PERSONAS (Phase 7)
// ============================================================

export const aiAgentPersonas = mysqlTable("ai_agent_personas", {
  id: varchar("id", { length: 40 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  systemPrompt: text("system_prompt").notNull(),
  tone: mysqlEnum("tone", ["formal", "casual", "expert", "friendly"]).default("formal").notNull(),
  isDefault: tinyint("is_default").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  defaultIdx: index("idx_persona_default").on(t.isDefault),
}));

export type AiAgentPersonaRow = typeof aiAgentPersonas.$inferSelect;

// ============================================================
// RAG DOCUMENTS (Phase 7)
// ============================================================

export const ragDocuments = mysqlTable("rag_documents", {
  id: varchar("id", { length: 40 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  charCount: int("char_count").default(0).notNull(),
  chunkCount: int("chunk_count").default(0).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type RagDocumentRow = typeof ragDocuments.$inferSelect;

// ============================================================
// RAG CHUNKS (Phase 7)
// ============================================================

export const ragChunks = mysqlTable("rag_chunks", {
  id: varchar("id", { length: 40 }).primaryKey(),
  documentId: varchar("document_id", { length: 40 }).notNull(),
  chunkIndex: int("chunk_index").notNull(),
  content: text("content").notNull(),
}, (t) => ({
  docIdx: index("idx_rag_chunks_doc").on(t.documentId),
}));

export type RagChunkRow = typeof ragChunks.$inferSelect;
