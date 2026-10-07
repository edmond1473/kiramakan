"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-lg px-4 pt-20">
      <p className="label-mono text-label-2">出错了</p>
      <h1 className="display mt-3 text-[40px]">出了一点问题</h1>
      <p className="mt-4 text-[15px] leading-[22px] text-label-2">可能是网络或资料库暂时连不上。再试一次看看。</p>
      <button onClick={() => retry()} className={buttonClass("filled", "lg") + " mt-8"}>
        <RotateCw className="size-4" strokeWidth={2.5} /> 再试一次
      </button>
    </main>
  );
}
