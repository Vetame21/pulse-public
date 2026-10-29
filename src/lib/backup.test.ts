import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BackupSchema } from "./backup";

const entry = { id: "8f2b9a52-4f3e-4d43-9a4e-2f1f7f3c9a10", txn_date: "2026-10-01", kind: "received", amount_fen: 100000 };
const backup = (family: object[]) => ({ format: BACKUP_FORMAT, schema_version: 1, app_version: "1", exported_at: "2026-10-22", tables: { family_transactions: family } });

describe("backup", () => {
  it("keeps who Family Money is from", () => {
    const b = BackupSchema.parse(backup([{ ...entry, from_person: "Alex" }]));
    expect(b.tables.family_transactions[0]).toMatchObject({ from_person: "Alex" });
  });
  it("rejects a Family Money entry without a name", () => {
    expect(BackupSchema.safeParse(backup([entry])).success).toBe(false);
    expect(BackupSchema.safeParse(backup([{ ...entry, from_person: " " }])).success).toBe(false);
  });
});
