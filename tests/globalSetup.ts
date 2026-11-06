import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Fresh throwaway SQLite database for DB-backed tests (never touches dev.db).
export default function setup() {
  for (const f of ["test.db", "test.db-journal"]) {
    const p = path.join(process.cwd(), "prisma", f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  execSync("npx prisma db push --skip-generate", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: "file:./test.db", PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
}
