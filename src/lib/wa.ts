// WhatsApp 链接：电话号码转成国际格式（马来西亚 60）

export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return `6${d}`;
  return d;
}

export function waLink(phone: string | null, text: string): string {
  return `https://wa.me/${phone ? waNumber(phone) : ""}?text=${encodeURIComponent(text)}`;
}
