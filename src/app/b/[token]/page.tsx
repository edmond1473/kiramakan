import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import { billByToken, billView, loadWorld, type BillView } from "@/lib/server/world";
import { FriendBill } from "./FriendBill";
import { Empty } from "@/components/ui";
import { SetupProblem } from "@/components/SetupProblem";
import { formatRM } from "@/lib/money";

export const dynamic = "force-dynamic";
export const viewport: Viewport = { themeColor: "#fff100" };

export async function generateMetadata(props: PageProps<"/b/[token]">): Promise<Metadata> {
  try {
    const { token } = await props.params;
    const b = billByToken(await loadWorld(), token);
    if (!b) return { title: "找不到账单" };
    return {
      title: b.title,
      description: `总共 ${formatRM(b.totalCents)}，点自己吃的东西就算好含 tax 的金额。`,
      robots: { index: false, follow: false },
    };
  } catch {
    return { title: "账单" };
  }
}

export default async function FriendBillPage(props: PageProps<"/b/[token]">) {
  const { token } = await props.params;
  let view: BillView | null = null;
  let error: unknown = null;
  try {
    const w = await loadWorld();
    const b = billByToken(w, token);
    view = b ? billView(w, b.id) : null;
  } catch (e) {
    unstable_rethrow(e);
    error = e;
  }
  if (error) return <SetupProblem error={error} />;
  if (!view) {
    return (
      <main className="mx-auto max-w-lg px-4 pt-16">
        <Empty title="找不到这张单">link 可能复制不完整，请叫付钱的人再发一次。</Empty>
      </main>
    );
  }
  return <FriendBill token={token} initialView={view} />;
}
