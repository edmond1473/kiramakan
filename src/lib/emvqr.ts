// EMVCo（DuitNow 用的格式）QR 解析与加金额。
// 注意：TNG / 银行 app 认不认「自己加进去的金额」要实测，所以这功能默认关闭。

export interface Tlv {
  id: string;
  value: string;
}

/** CRC-16/CCITT-FALSE（poly 0x1021, init 0xFFFF），EMVCo tag 63 用的就是这个 */
export function crc16(input: string): string {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function parseTlv(payload: string): Tlv[] | null {
  const out: Tlv[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) return null;
    const id = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenStr)) return null;
    const len = Number(lenStr);
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    out.push({ id, value });
    i += 4 + len;
  }
  return out;
}

export function serializeTlv(tlvs: Tlv[]): string {
  return tlvs
    .map((t) => {
      if (t.value.length > 99) throw new Error(`tag ${t.id} 太长`);
      return `${t.id}${String(t.value.length).padStart(2, "0")}${t.value}`;
    })
    .join("");
}

export interface EmvInfo {
  isEmv: boolean;
  crcValid: boolean;
  isDuitNow: boolean;
  merchantName: string | null;
  amount: string | null;
}

export function inspectEmv(payload: string): EmvInfo {
  const none: EmvInfo = { isEmv: false, crcValid: false, isDuitNow: false, merchantName: null, amount: null };
  if (!payload.startsWith("000201") && !payload.startsWith("000202")) return none;
  const tlvs = parseTlv(payload);
  if (!tlvs || tlvs.length === 0) return none;
  const last = tlvs[tlvs.length - 1];
  const crcValid =
    last.id === "63" &&
    last.value.toUpperCase() === crc16(payload.slice(0, payload.length - 4));
  const isDuitNow = tlvs.some(
    (t) => Number(t.id) >= 26 && Number(t.id) <= 51 && t.value.includes("A000000615"),
  );
  return {
    isEmv: true,
    crcValid,
    isDuitNow,
    merchantName: tlvs.find((t) => t.id === "59")?.value ?? null,
    amount: tlvs.find((t) => t.id === "54")?.value ?? null,
  };
}

/**
 * 在 EMV QR 里放入金额（tag 54），point of initiation 改成 12（dynamic），重算 CRC。
 * 不是 EMV 格式就返回 null（只能显示原本的 QR）。
 */
export function withAmount(payload: string, amountCents: number): string | null {
  const info = inspectEmv(payload);
  if (!info.isEmv) return null;
  const tlvs = parseTlv(payload);
  if (!tlvs) return null;
  const body = tlvs.filter((t) => t.id !== "63" && t.id !== "54");
  const amount = `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`;
  const poi = body.find((t) => t.id === "01");
  if (poi) poi.value = "12";
  else body.splice(1, 0, { id: "01", value: "12" });
  // tag 54 放在 53（currency）后面；没有 53 就按数字顺序插入
  const idx53 = body.findIndex((t) => t.id === "53");
  const insertAt =
    idx53 >= 0 ? idx53 + 1 : body.findIndex((t) => Number(t.id) > 54) === -1 ? body.length : body.findIndex((t) => Number(t.id) > 54);
  body.splice(insertAt, 0, { id: "54", value: amount });
  const withoutCrc = serializeTlv(body) + "6304";
  return withoutCrc + crc16(withoutCrc);
}
