import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { _db?: any };

async function createDb() {
  const pool = await mysql.createPool({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
  });
  return drizzle(pool, { schema, mode: "default" }) as any;
}

let dbPromise: Promise<any> | null = null;

export async function getDb() {
  if (process.env.NODE_ENV === "production") {
    return createDb();
  }
  // In development, reuse the same connection across hot-reloads
  if (!globalForDb._db) {
    dbPromise ??= createDb().then((db: any) => {
      globalForDb._db = db;
      return db;
    });
    return dbPromise;
  }
  return globalForDb._db;
}
