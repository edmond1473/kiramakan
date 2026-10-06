"use client";

import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-lg px-4 pt-20 text-center">
      <h1 className="text-[22px] leading-7 font-semibold">出了一点问题</h1>
      <p className="mt-2 text-[15px] leading-[22px] text-label-2">可能是网络或资料库暂时连不上。再试一次看看。</p>
      <button
        onClick={() => retry()}
        className="press mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-tint-fill px-5 text-[15px] font-semibold text-white"
      >
        再试一次
      </button>
    </main>
  );
}
