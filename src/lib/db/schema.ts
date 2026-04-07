import {
  mysqlTable,
  varchar,
  timestamp,
  json,
  index,
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
