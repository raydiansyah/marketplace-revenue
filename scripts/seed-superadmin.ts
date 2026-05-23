import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import * as schema from "../src/lib/db/schema";
import { users } from "../src/lib/db/schema";
import { SUPERADMIN_EMAIL } from "../src/lib/auth/constants";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

(async () => {
  const pool = await mysql.createPool({
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT ?? 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DATABASE,
    ssl: { rejectUnauthorized: true },
  });

  const db = drizzle(pool, { schema, mode: "default" });

  const email = SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD ?? "changeme123!";
  const hash = await bcrypt.hash(password, 12);

  await db
    .insert(users)
    .values({
      id: randomUUID(),
      email,
      passwordHash: hash,
      role: "superadmin",
      name: "Raydiansyah",
    })
    .onDuplicateKeyUpdate({
      set: { role: "superadmin" },
    });

  console.log(`✓ Superadmin seeded: ${email}`);
  await pool.end();
  process.exit(0);
})();
