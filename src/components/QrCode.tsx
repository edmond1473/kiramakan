"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 用 <img>（PNG）显示，iPhone 才可以长按「存到照片」 */
export function QrCode({ payload, size = 216, label }: { payload: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, { margin: 2, width: 640, errorCorrectionLevel: "M", color: { dark: "#0f0f0f", light: "#ffffff" } })
      .then((s) => alive && setSrc(s))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [payload]);
  return (
    <div className="overflow-hidden rounded-[16px] bg-white ring-1 ring-black/10" style={{ width: size, height: size }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} width={size} height={size} className="block size-full" />
      )}
    </div>
  );
}
