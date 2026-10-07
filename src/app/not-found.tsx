import { ArrowLeft } from "lucide-react";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-20">
      <p className="display text-[96px] leading-[0.85] text-label-3">404</p>
      <h1 className="display mt-6 text-[40px]">找不到这一页</h1>
      <p className="mt-4 text-[15px] leading-[22px] text-label-2">link 可能打错了，或那张单已经删除。</p>
      <LinkButton href="/" variant="tinted" size="lg" className="mt-8">
        <ArrowLeft className="size-4" strokeWidth={2.5} /> 回到账本
      </LinkButton>
    </main>
  );
}
