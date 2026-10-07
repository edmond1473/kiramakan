"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button, Group, LinkButton, Notice, PageHeader, formatWhen } from "@/components/ui";
import { CopyButton, toast, useOrigin } from "@/components/ui-client";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="card rounded-[24px] bg-surface p-5">
      <div className="flex items-start gap-4">
        <span className="display flex size-10 shrink-0 items-center justify-center rounded-full bg-volt text-[20px] text-ink">
          {n}
        </span>
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[17px] leading-[23px] font-semibold">{title}</p>
          <div className="mt-2 space-y-2 text-[14px] leading-[21px] text-label-2">{children}</div>
        </div>
      </div>
    </li>
  );
}

/** 「」里面是 iPhone 上的字；中文 / 英文介面都写 */
function Ui({ zh, en }: { zh: string; en: string }) {
  return (
    <span className="font-semibold text-label">
      「{zh}」<span className="font-normal text-label-2">({en})</span>
    </span>
  );
}

export function TngSetup({
  hookKey,
  lastNoticeAt,
  lastEmptyAt,
}: {
  hookKey: string;
  lastNoticeAt: string | null;
  /** 捷径有打来、但内容是空的（第 6 步没设好） */
  lastEmptyAt: string | null;
}) {
  const router = useRouter();
  const origin = useOrigin();
  const [rotating, setRotating] = useState(false);
  const url = origin ? `${origin}/api/hook/tng/${hookKey}` : "";

  async function rotate() {
    if (!window.confirm("换一个新网址？旧的网址马上不能用，iPhone 捷径里的网址要改成新的。")) return;
    setRotating(true);
    try {
      await api("/api/me/webhook-key", { body: {} });
      toast("换好了，记得改 iPhone 捷径里的网址");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    } finally {
      setRotating(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="iPhone 设定"
        back={{ href: "/settings", label: "设定" }}
        subtitle="做一次就好，大约 3 分钟。之后朋友用 TNG 转钱给你，iPhone 一收到 TNG 的通知，就会自动传来这里记账。"
      />
      <div className="px-4">
        <div className="mt-6 space-y-2">
          {lastEmptyAt ? (
            <Notice tone="warn">
              {formatWhen(lastEmptyAt)} 有收到 iPhone 传来的请求，但里面没有通知的内容。请检查第 6 步：「请求体」选 JSON，字段的右边要选「快捷指令输入」。
            </Notice>
          ) : (
            <Notice tone={lastNoticeAt ? "ok" : "info"}>
              {lastNoticeAt ? `已经连上了 ✓ 最近收到通知：${formatWhen(lastNoticeAt)}` : "还没收到过通知。照下面做完，再叫朋友转 RM 0.10 试试。"}
            </Notice>
          )}
        </div>

        <Group title="开始之前">
          <ul className="space-y-2 p-5 text-[14px] leading-[21px]">
            <li>
              · iPhone 要更新到 <b>iOS 27</b> 或更新（设定 → 一般 → 软件更新）。
            </li>
            <li>· TNG eWallet 的通知要开着（设定 → 通知 → TNG eWallet → 允许通知）。</li>
            <li>· 每个付钱的人用自己的帐号、自己的网址，设定自己的 iPhone。</li>
          </ul>
        </Group>

        <ol className="mt-8 space-y-3">
          <Step n={1} title="复制你的专属网址">
            <p className="rounded-[12px] bg-field px-3.5 py-3 font-mono text-[12px] leading-[18px] break-all text-label">
              {url || "…"}
            </p>
            <CopyButton text={url} label="复制网址" variant="tinted" full />
            <p>这个网址就像密码，不要发给别人。</p>
          </Step>

          <Step n={2} title="在「快捷指令」开一个新的自动化">
            <p>
              打开 <Ui zh="快捷指令" en="Shortcuts" /> app → 下面的 <Ui zh="自动化" en="Automation" /> → 右上角的「+」。
            </p>
          </Step>

          <Step n={3} title="选「收到 TNG 的通知时」">
            <p>
              找 <Ui zh="通知" en="Notification" /> 点进去 → <Ui zh="App" en="App" /> 选 <b className="text-label">TNG eWallet</b>。
            </p>
            <p>不要加标题或内容的筛选：全部通知都传过来就好，KiraMakan 会自己分出哪些是朋友转账、哪些是广告。</p>
          </Step>

          <Step n={4} title="设成自动跑、不用问">
            <p>
              选 <Ui zh="立即运行" en="Run Immediately" />，把 <Ui zh="运行时通知" en="Notify When Run" /> 关掉 → 按{" "}
              <Ui zh="下一步" en="Next" /> → <Ui zh="新建空白自动化" en="New Blank Automation" />。
            </p>
          </Step>

          <Step n={5} title="加「获取 URL 内容」">
            <p>
              按 <Ui zh="添加操作" en="Add Action" />，搜 <Ui zh="获取 URL 内容" en="Get Contents of URL" /> 点它。
            </p>
            <p>把蓝色的「URL」换成第 1 步复制的网址（点一下 → 粘贴）。</p>
          </Step>

          <Step n={6} title="把通知内容一起传过来">
            <p>
              点那个动作的箭头（<Ui zh="显示更多" en="Show More" />）：
            </p>
            <ul className="space-y-1.5 pl-1">
              <li>
                · <Ui zh="方法" en="Method" /> 选 <b className="text-label">POST</b>
              </li>
              <li>
                · <Ui zh="请求体" en="Request Body" /> 选 <b className="text-label">JSON</b>
              </li>
              <li>
                · 按 <Ui zh="添加新字段" en="Add new field" /> → <Ui zh="文本" en="Text" />：左边打{" "}
                <code className="rounded bg-field px-1.5 py-0.5 font-mono text-[12px] text-label">text</code>，右边按一下选{" "}
                <Ui zh="快捷指令输入" en="Shortcut Input" />。
              </li>
            </ul>
            <p>可以选通知的「标题」「内容」的话，再加两个字段 title、body 分别选它们会更准（不加也可以）。</p>
          </Step>

          <Step n={7} title="完成，然后试一次">
            <p>
              按 <Ui zh="完成" en="Done" />。叫一个朋友用 TNG 转 RM 0.10 给你。几秒后回来这一页，上面会显示「已经连上了 ✓」，
              「TNG 进账记录」会出现那一笔。
            </p>
            <p>名字对不上的会先放「待确认」，选一次是谁之后，下次就会自动记。</p>
          </Step>
        </ol>

        <Group title="没反应的话">
          <ul className="space-y-2 p-5 text-[14px] leading-[21px] text-label-2">
            <li>· 锁屏有没有跳出 TNG 的通知？没有的话先打开 TNG 的通知。</li>
            <li>· 「快捷指令 → 自动化」里面那个自动化要是开着的。</li>
            <li>· 网址要贴完整；换过网址的话要贴新的。</li>
            <li>· 开了专注模式（Focus）挡住 TNG 通知的话，自动化可能不会跑。</li>
            <li>· 还是不行：到「设定 → TNG 进账自动记录 → 试一试」贴通知的文字，看 KiraMakan 读不读得懂。</li>
          </ul>
        </Group>

        <Group title="Android 手机" footer="例如另一个付钱的人用 Android。">
          <p className="p-5 text-[14px] leading-[21px] text-label-2">
            用 MacroDroid（免费）：触发器选「收到通知」→ App 选 TNG eWallet；动作选「HTTP 请求」→ POST 到同一个网址，内容放通知的标题和文字。
          </p>
        </Group>

        <Group title="网址外泄了？" footer="换了之后旧的网址马上不能用，要把 iPhone 捷径里的网址改成新的。">
          <div className="p-5">
            <Button variant="danger" full loading={rotating} onClick={rotate}>
              {!rotating && <RefreshCw className="size-4" strokeWidth={2.25} />} 换一个新网址
            </Button>
          </div>
        </Group>

        <div className="mt-8">
          <LinkButton href="/inbox" variant="gray" full>
            看 TNG 进账记录
          </LinkButton>
        </div>
        <div className="h-6" />
      </div>
    </main>
  );
}
