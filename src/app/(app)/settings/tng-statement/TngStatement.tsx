"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button, Group, Notice, PageHeader } from "@/components/ui";
import { CopyButton, Field, useOrigin } from "@/components/ui-client";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="card rounded-[24px] bg-surface p-5">
      <div className="flex items-start gap-4">
        <span
          className={`display flex size-10 shrink-0 items-center justify-center rounded-full text-[20px] ${done ? "bg-forest text-white" : "bg-volt text-ink"}`}
        >
          {done ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[17px] leading-[23px] font-semibold">{title}</p>
          <div className="mt-2 space-y-2 text-[14px] leading-[21px] text-label-2">{children}</div>
        </div>
      </div>
    </li>
  );
}

/** 贴到 script.google.com 的代码：每 15 分钟看一次 Gmail，有新的 TNG 交易记录就把 PDF 送去 KiraMakan */
function appsScript(url: string): string {
  return `// KiraMakan：每 15 分钟看一次 Gmail，有新的 TNG 交易记录（PDF）就送去 KiraMakan 对账
const KIRAMAKAN_URL = "${url}";
const DONE_LABEL = "kiramakan-done";

// 第一次按一下「执行」跑这个：设定每 15 分钟自动跑一次
function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendTngStatements").timeBased().everyMinutes(15).create();
  sendTngStatements();
}

function sendTngStatements() {
  const done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = GmailApp.search("has:attachment filename:pdf newer_than:2d -label:" + DONE_LABEL);
  threads.forEach((thread) => {
    let sent = 0;
    let failed = false;
    thread.getMessages().forEach((msg) => {
      msg.getAttachments().forEach((file) => {
        if (!/^tng_ewallet_transactions.*\\.pdf$/i.test(file.getName())) return;
        const res = UrlFetchApp.fetch(KIRAMAKAN_URL, {
          method: "post",
          contentType: "application/pdf",
          payload: file.getBytes(),
          muteHttpExceptions: true,
        });
        console.log(file.getName(), res.getResponseCode(), res.getContentText().slice(0, 300));
        if (res.getResponseCode() === 200) sent++;
        else failed = true; // 没成功：不贴标签，15 分钟后再试
      });
    });
    if (sent > 0 && !failed) thread.addLabel(done);
  });
}
`;
}

interface Result {
  message: string;
  recorded: number;
  pending: number;
}

export function TngStatement({
  hookKey,
  passwordSet,
  since,
  count,
  lastDate,
}: {
  hookKey: string;
  passwordSet: boolean;
  since: string | null;
  count: number;
  lastDate: string | null;
}) {
  const router = useRouter();
  const origin = useOrigin();
  const url = origin ? `${origin}/api/hook/tng-statement/${hookKey}` : "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const pdf = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
        r.onerror = () => reject(new Error("读不到这个文件"));
        r.readAsDataURL(file);
      });
      const r = await api<Result>("/api/statement", { body: { pdf, password: password || undefined } });
      setResult({ tone: "ok", text: r.message });
      router.refresh();
    } catch (e) {
      setResult({ tone: "error", text: e instanceof Error ? e.message : "出错了" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="TNG 交易记录对账"
        back={{ href: "/settings", label: "设定" }}
        subtitle="每晚在 TNG 导出交易记录寄到 Gmail，KiraMakan 自动对一次：朋友转来的钱自动记好，iPhone 漏掉的也补回来。"
      />
      <div className="px-4">
        <div className="mt-6 space-y-2">
          <Notice tone={count > 0 ? "ok" : "info"}>
            {count > 0 ? `已经对过 ${count} 笔进账 ✓ 最近一笔是 ${lastDate}` : "还没对过。可以先在下面手动上传一份试试。"}
          </Notice>
          {!passwordSet && <Notice tone="warn">还没设定 PDF 密码（第 1 步）。Gmail 自动对账要先设定；手动上传时可以直接填密码。</Notice>}
        </div>

        <Group
          title="现在上传一份"
          footer={
            since
              ? `只处理 ${since} 之后的进账（第一次用的时候定的），之前的当作你已经自己处理过。同一笔不会记两次。`
              : "第一次上传时，只处理最近两天的进账，之前的当作你已经自己处理过。同一笔不会记两次。"
          }
        >
          <div className="space-y-4 p-5">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
            <div>
              <Button full onClick={() => fileRef.current?.click()}>
                <FileUp className="size-[18px]" strokeWidth={2} /> {file ? "换一个 PDF" : "选 TNG 交易记录 PDF"}
              </Button>
              {file && <p className="mt-2 truncate px-1 text-[13px] leading-[18px] text-label-2">{file.name}</p>}
            </div>
            <Field
              label="PDF 密码（可以不填）"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={passwordSet ? "不填就用已经设定的密码" : "TNG 导出时的 PDF 密码"}
            />
            <Button variant="filled" size="lg" full loading={busy} disabled={!file} onClick={upload}>
              对账
            </Button>
            {result && <Notice tone={result.tone}>{result.text}</Notice>}
          </div>
        </Group>

        <h2 className="label-mono mt-10 mb-2.5 px-1 text-label-2">Gmail 自动对账（做一次就好）</h2>
        <ol className="space-y-3">
          <Step n={1} title="在 Vercel 存 PDF 密码" done={passwordSet}>
            {passwordSet ? (
              <p>已经设定好了。</p>
            ) : (
              <p>
                Vercel → kiramakan → Settings → Environment Variables → 加一个 <span className="font-mono text-label">TNG_PDF_PASSWORD</span>，值是 TNG
                PDF 的密码 → Save → Deployments → Redeploy。
              </p>
            )}
          </Step>
          <Step n={2} title="开 Google Apps Script">
            <p>
              用收 TNG email 的那个 Gmail 帐号打开 <span className="font-mono text-label">script.google.com</span> → 新项目 → 把原本的内容删掉，贴上这段：
            </p>
            <CopyButton text={url ? appsScript(url) : ""} label="复制代码" full />
            <p className="text-[12px] leading-[17px]">代码里有你的专属网址，就像密码，不要分享给别人。</p>
          </Step>
          <Step n={3} title="跑一次 setup">
            <p>
              上面选 <span className="font-mono text-label">setup</span> → 按「执行 / Run」→ 允许 Gmail 的权限。Google 会说「这个 app
              未经验证」：按「高级 / Advanced」→「前往…（不安全）」，因为这是你自己的 script。之后每 15 分钟会自动看一次 Gmail。
            </p>
          </Step>
          <Step n={4} title="每晚在 TNG 导出">
            <p>TNG → Transaction History → 导出 → 选最近几天 → 寄到你的 Gmail。大约 15 分钟内对好，手机会收到通知。</p>
          </Step>
        </ol>
        <div className="h-6" />
      </div>
    </main>
  );
}
