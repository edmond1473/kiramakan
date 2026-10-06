import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-20 text-center">
      <h1 className="text-[22px] leading-7 font-semibold">找不到这一页</h1>
      <p className="mt-2 text-[15px] leading-[22px] text-label-2">link 可能打错了，或那张单已经删除。</p>
      <Link href="/" className="mt-6 inline-block text-[15px] font-semibold text-tint-text">
        回到账本
      </Link>
    </main>
  );
}
