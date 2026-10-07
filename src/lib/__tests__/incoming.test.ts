import { describe, expect, it } from "vitest";
import { analyze, describe as describeAnalysis } from "../server/incoming";
import { reminderData } from "../server/remind";
import { ledgerBetween } from "../server/world";
import { buildWorld, person, type FixtureBill } from "./world-fixture";

const me = { personId: "me" };
const people = [
  person("me", "我", null, { userId: "u-me" }),
  person("ali", "Ali", "ALI BIN ABU"),
  person("bob", "Bob"),
  person("chen", "Chen", "CHEN WEI"),
];
// 一餐 RM 50（含 tax），item 加起来 RM 45：Ali 吃 RM 20、Bob 吃 RM 20、Satay RM 5 没人认领，Chen 有来但还没点
const bill: FixtureBill = {
  id: "b1",
  title: "Nasi Lemak Corner",
  payer: "me",
  total: 5000,
  participants: ["ali", "bob", "chen"],
  items: [
    { id: "i1", name: "Nasi Lemak", cents: 1500, eaters: { ali: 1 } },
    { id: "i2", name: "Teh Tarik", cents: 500, eaters: { ali: 1 } },
    { id: "i3", name: "Mee Goreng", cents: 2000, eaters: { bob: 1 } },
    { id: "i4", name: "Satay", cents: 500 },
  ],
};
const w = buildWorld(people, [bill]);
const aliOwes = ledgerBetween(w, "ali", "me").balance;
const noAliases = new Map<string, string[]>();
const rm = (c: number) => (c / 100).toFixed(2);

describe("analyze：TNG 通知会怎么处理", () => {
  it("名字对上、金额刚好 → 自动记好", () => {
    expect(aliOwes).toBe(2222);
    const a = analyze(w, me, noAliases, `You've received RM${rm(aliOwes)} from ALI BIN ABU.`);
    expect(a).toMatchObject({ outcome: "record", personId: "ali", personName: "Ali" });
    expect(a.verdict?.kind).toBe("settles_all");
  });

  it("只给了 item 的钱 → 照样记好，但标出少给 tax", () => {
    const a = analyze(w, me, noAliases, "You've received RM20.00 from ALI BIN ABU.");
    expect(a.outcome).toBe("record");
    expect(a.verdict).toMatchObject({ kind: "forgot_tax", short: 222 });
  });

  it("用 app 里的名字也认得（Bob → BOB TAN）", () => {
    const a = analyze(w, me, noAliases, "You've received RM22.22 from BOB TAN");
    expect(a).toMatchObject({ outcome: "record", personId: "bob" });
  });

  it("以前确认过的 TNG 名字", () => {
    const aliases = new Map([["ali", ["ABU KECIL"]]]);
    expect(analyze(w, me, aliases, "You've received RM5.00 from ABU KECIL").personId).toBe("ali");
  });

  it("多给了 → 待确认（可能有别的事）", () => {
    const a = analyze(w, me, noAliases, "You've received RM100.00 from ALI BIN ABU.");
    expect(a).toMatchObject({ outcome: "pending", reason: "overpay", personId: "ali", owed: 2222 });
  });

  it("他没有欠你钱 → 待确认", () => {
    const a = analyze(w, me, noAliases, "You've received RM10.00 from CHEN WEI");
    expect(a).toMatchObject({ outcome: "pending", reason: "no_debt", personId: "chen" });
  });

  it("名字对不上 → 待确认", () => {
    const a = analyze(w, me, noAliases, "You've received RM10.00 from SOMEONE ELSE");
    expect(a).toMatchObject({ outcome: "pending", reason: "unknown_sender", personId: null, sender: "SOMEONE ELSE" });
    expect(describeAnalysis(a)).toContain("对不上朋友");
  });

  it("看不出是收钱还是付钱 → 待确认", () => {
    const a = analyze(w, me, noAliases, "DuitNow: RM22.22 from ALI BIN ABU");
    expect(a).toMatchObject({ outcome: "pending", reason: "unsure", personId: "ali" });
  });

  it("付钱出去、广告、没有金额 → 不记", () => {
    expect(analyze(w, me, noAliases, "You have paid RM10.00 to KFC").outcome).toBe("ignore");
    expect(analyze(w, me, noAliases, "You've received RM5.00 cashback!").outcome).toBe("ignore");
    expect(analyze(w, me, noAliases, "Hello from TNG").outcome).toBe("unparsed");
  });
});

describe("reminderData：提醒内容", () => {
  it("谁欠、吃了什么、没人认领的 item、还没点的人", () => {
    const d = reminderData(w, "me", 1);
    expect(d.debtors.map((x) => [x.name, x.owed])).toEqual([
      ["Ali", 2222],
      ["Bob", 2222],
    ]);
    expect(d.debtors[0].bills[0]).toMatchObject({ title: "Nasi Lemak Corner", items: ["Nasi Lemak", "Teh Tarik"], status: "unpaid" });
    expect(d.unclaimed).toHaveLength(1);
    expect(d.unclaimed[0]).toMatchObject({ owed: 556, items: [{ name: "Satay", cents: 500 }], notPicked: ["Chen"] });
    expect(d.pendingIncoming).toBe(1);
    expect(d.totalOwed).toBe(4444);
  });

  it("少给 tax 的人", () => {
    const paid = buildWorld(people, [bill], [{ from: "ali", to: "me", amount: 2000 }]);
    const d = reminderData(paid, "me", 0);
    const ali = d.debtors.find((x) => x.personId === "ali")!;
    expect(ali).toMatchObject({ owed: 222, forgotTax: 222 });
    expect(ali.bills[0].status).toBe("forgot_tax");
  });

  it("分享的 item 写出份数", () => {
    const shared = buildWorld(people, [
      {
        id: "b2",
        payer: "me",
        total: 3000,
        items: [{ id: "p1", name: "Pizza", cents: 3000, eaters: { ali: 1, bob: 1, chen: 1 } }],
      },
    ]);
    expect(reminderData(shared, "me", 0).debtors[0].bills[0].items).toEqual(["Pizza 1/3"]);
  });
});
