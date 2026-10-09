import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BEGIN, END, renderGateSql, renderGateTestSql, toPg } from "./gate-sql";

const root = join(__dirname, "../../..");
const migrations = join(root, "supabase/migrations");
const testFile = join(root, "supabase/tests/message_gate_test.sql");

/** The newest migration that carries the generated gate. */
function gateMigration(): string {
  const file = readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .find((f) => readFileSync(join(migrations, f), "utf8").includes(BEGIN));
  if (!file) throw new Error(`No migration contains "${BEGIN}"`);
  return join(migrations, file);
}

function block(sql: string): string {
  const a = sql.indexOf(BEGIN);
  const b = sql.indexOf(END);
  return sql.slice(a, b + END.length);
}

describe("database message gate", () => {
  if (process.env.GATE_WRITE === "1") {
    it("writes the generated SQL", () => {
      const file = gateMigration();
      const sql = readFileSync(file, "utf8");
      writeFileSync(file, sql.replace(block(sql), () => renderGateSql()));
      writeFileSync(testFile, renderGateTestSql());
    });
    return;
  }

  it("the newest migration matches gate.ts (run GATE_WRITE=1 to regenerate)", () => {
    expect(block(readFileSync(gateMigration(), "utf8"))).toBe(renderGateSql());
  });

  it("the database test matches the corpus (run GATE_WRITE=1 to regenerate)", () => {
    expect(readFileSync(testFile, "utf8")).toBe(renderGateTestSql());
  });

  it("translates word boundaries and digits for Postgres", () => {
    expect(toPg("\\b[2-9]\\d{2}\\b")).toBe("\\y[2-9][0-9]{2}\\y");
  });
});
