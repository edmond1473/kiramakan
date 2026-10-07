import { describe, expect, it } from "vitest";
import { pendingText, recordedText, reminderText, type ReminderData } from "../remind";

const empty: ReminderData = { debtors: [], unclaimed: [], pendingIncoming: 0, totalOwed: 0 };

const debtor = (name: string, owed: number, forgotTax = 0) => ({
  personId: name,
  name,
  owed,
  forgotTax,
  bills: [],
});

describe("reminderText", () => {
  it("没有东西要提醒 → 不发", () => {
    expect(reminderText(empty)).toBeNull();
  });

  it("谁欠、少给 tax、没人认领、待确认", () => {
    const t = reminderText({
      debtors: [debtor("Ali", 2340), debtor("Bob", 120, 120)],
      unclaimed: [
        { billId: "b", title: "x", billDate: "2026-10-01", owed: 1800, items: [{ name: "Satay", cents: 1000 }, { name: "Cendol", cents: 600 }], notPicked: [] },
      ],
      pendingIncoming: 1,
      totalOwed: 2460,
    })!;
    expect(t.title).toBe("2 个人还欠你 RM 24.60");
    expect(t.body).toBe("Ali RM 23.40、Bob RM 1.20（少给 tax）\n2 个 item 没人认领（RM 18.00）\n1 笔 TNG 进账不知道是谁转的");
  });

  it("超过 3 个人：后面的写「等 N 人」，少给 tax 另外一行", () => {
    const t = reminderText({
      ...empty,
      debtors: [debtor("A", 100), debtor("B", 100), debtor("C", 100), debtor("D", 50, 50)],
      totalOwed: 350,
    })!;
    expect(t.body).toBe("A RM 1.00、B RM 1.00、C RM 1.00 等 4 人\n少给 tax：D 差 RM 0.50");
  });

  it("只有没人认领的 item", () => {
    const t = reminderText({
      ...empty,
      unclaimed: [{ billId: "b", title: "x", billDate: "2026-10-01", owed: 500, items: [{ name: "Satay", cents: 450 }], notPicked: ["Chen"] }],
    })!;
    expect(t.title).toBe("有 item 还没人认领");
  });
});

describe("recordedText / pendingText", () => {
  it("还清、少给 tax", () => {
    expect(recordedText("Ali", 2340, { kind: "settles_all", message: "" }).title).toBe("Ali 还清了 ✓");
    const t = recordedText("Ali", 2000, { kind: "forgot_tax", short: 222, message: "" });
    expect(t.title).toBe("Ali 少给了 tax");
    expect(t.body).toContain("还差 RM 2.22");
  });
  it("不知道是谁", () => {
    const t = pendingText({ reason: "unknown_sender", amount: 1000, sender: "ALI BIN ABU", personName: null, owed: 0 });
    expect(t.title).toBe("收到 RM 10.00，是谁转的？");
    expect(t.body).toContain("ALI BIN ABU");
  });
  it("多给了", () => {
    const t = pendingText({ reason: "overpay", amount: 10000, sender: "ALI", personName: "Ali", owed: 2340 });
    expect(t.body).toContain("他只欠你 RM 23.40");
  });
});
