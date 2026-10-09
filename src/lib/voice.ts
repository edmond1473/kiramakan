// 用说的（或打字）记一餐：AI 只把听到的数字原样抄下来，item 小计、tax、总额全部在这里用 code 算。
// 纯函数，前后端都能用、可以单元测试。
import { rmToCents } from "./money";

/** AI 回传的样子（已经过 zod 检查） */
export interface VoiceRaw {
  transcript: string;
  title: string;
  items: { name: string; qty: number; amount: number; amountIsEach: boolean }[];
  charges: { label: string; percent: number; amount: number }[];
  /** 说了「有 tax」但没说税率也没说多少钱 */
  hasTax: boolean;
  /** 说的总额，0 = 没说 */
  total: number;
  notes: string;
}

export interface VoiceBill {
  title: string | null;
  items: { name: string; qty: number; lineCents: number }[];
  charges: { label: string; amountCents: number }[];
  totalCents: number;
  notes: string | null;
}

const SERVICE = /service|服务|服務|加一|perkhidmatan/i;
const DISCOUNT = /discount|diskaun|voucher|\boff\b|\bless\b|折|优惠|優惠/i;

export function voiceToBill(raw: VoiceRaw): VoiceBill {
  const items = raw.items.map((i) => {
    const qty = i.qty > 0 ? i.qty : 1;
    const each = rmToCents(Math.max(0, i.amount));
    // 「每个 6 块」要乘份数；「两个共 12 块」就是这一行的价钱
    return { name: i.name.trim() || "Item", qty, lineCents: i.amountIsEach ? Math.round(each * qty) : each };
  });
  const subtotal = items.reduce((s, i) => s + i.lineCents, 0);

  // 先算 service charge（按 item 小计），SST / tax 再按「小计 + service charge」算，跟马来西亚 receipt 一样
  const sign = (label: string, cents: number) => (DISCOUNT.test(label) ? -Math.abs(cents) : cents);
  const labeled = raw.charges.map((c) => ({ ...c, label: c.label.trim() || "Charge" }));
  const services = labeled.filter((c) => SERVICE.test(c.label));
  const others = labeled.filter((c) => !SERVICE.test(c.label));
  const charges: { label: string; amountCents: number }[] = [];
  for (const c of services) {
    const cents = c.percent > 0 ? Math.round((subtotal * c.percent) / 100) : rmToCents(c.amount);
    charges.push({ label: c.label, amountCents: sign(c.label, cents) });
  }
  const serviceSum = charges.reduce((s, c) => s + c.amountCents, 0);
  for (const c of others) {
    const base = DISCOUNT.test(c.label) ? subtotal : subtotal + serviceSum;
    const cents = c.percent > 0 ? Math.round((base * c.percent) / 100) : rmToCents(c.amount);
    charges.push({ label: c.label, amountCents: sign(c.label, cents) });
  }
  const nonZero = charges.filter((c) => c.amountCents !== 0);

  const saidTotal = raw.total > 0 ? rmToCents(raw.total) : 0;
  const notes: string[] = raw.notes.trim() ? [raw.notes.trim()] : [];
  // 只说「有 tax」：有说总额的话，总额减掉 item 就是 tax
  if (raw.hasTax && nonZero.length === 0) {
    if (saidTotal > subtotal) nonZero.push({ label: "Tax", amountCents: saidTotal - subtotal });
    else notes.push("有说 tax，但没说税率或总额，请自己补上 tax 那一行");
  }
  const totalCents = saidTotal > 0 ? saidTotal : subtotal + nonZero.reduce((s, c) => s + c.amountCents, 0);

  return {
    title: raw.title.trim() || null,
    items,
    charges: nonZero,
    totalCents,
    notes: notes.length ? notes.join("；") : null,
  };
}
