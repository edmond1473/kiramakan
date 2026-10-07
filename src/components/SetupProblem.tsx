import { Notice } from "./ui";

/** 资料库还没设定好时显示（第一次部署常见） */
export function SetupProblem({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  const noUrl = /DATABASE_URL/.test(msg);
  return (
    <main className="mx-auto max-w-lg px-4 py-14">
      <p className="label-mono text-label-2">设定还没完成</p>
      <h1 className="display mt-3 text-[40px]">还连不上资料库</h1>
      <p className="mt-4 text-[15px] leading-[22px] text-label-2">
        {noUrl
          ? "还没设定 DATABASE_URL。到 Vercel 的 Settings → Environment Variables 加上 Supabase 的连接字符串，再 Redeploy。"
          : "DATABASE_URL 设定了，但连不上。请检查连接字符串（密码、host、port 6543）是否正确。"}
      </p>
      <div className="mt-6">
        <Notice tone="error">
          <span className="font-mono text-[12px] break-all">{msg}</span>
        </Notice>
      </div>
    </main>
  );
}
