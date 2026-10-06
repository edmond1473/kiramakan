"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, QrCode as QrIcon } from "lucide-react";
import { api } from "@/lib/client/api";
import { decodeQrFromFile } from "@/lib/client/qr";
import { inspectEmv } from "@/lib/emvqr";
import { QrCode } from "@/components/QrCode";
import { Button, Group, Notice, PageHeader, Row } from "@/components/ui";
import { Field, Sheet, toast } from "@/components/ui-client";

export function Settings({
  me,
  friendsWithoutAccount,
  payers,
}: {
  me: {
    name: string;
    username: string;
    tngName: string | null;
    qrPayload: string | null;
    qrAmountEnabled: boolean;
    payPhone: string | null;
    isAdmin: boolean;
  };
  friendsWithoutAccount: { id: string; name: string }[];
  payers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me.name);
  const [tngName, setTngName] = useState(me.tngName ?? "");
  const [payPhone, setPayPhone] = useState(me.payPhone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [accOpen, setAccOpen] = useState(false);
  const info = me.qrPayload ? inspectEmv(me.qrPayload) : null;

  async function patch(body: Record<string, unknown>, ok = "已保存") {
    await api("/api/me", { method: "PATCH", body });
    toast(ok);
    router.refresh();
  }

  async function onQrFile(file: File | undefined) {
    if (!file) return;
    setQrBusy(true);
    try {
      const payload = await decodeQrFromFile(file);
      if (!payload) {
        toast("这张图读不到 QR，请截清楚一点（整个 QR 都要在图里）", "error");
        return;
      }
      await patch({ qrPayload: payload }, "收款 QR 已更新");
    } catch (e) {
      toast(e instanceof Error ? e.message : "出错了", "error");
    } finally {
      setQrBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <main>
      <PageHeader title="设定" />
      <div className="px-4">
        <Group title="我的资料">
          <div className="space-y-4 p-4">
            <Field label="名字（朋友看到的）" value={name} onChange={(e) => setName(e.target.value)} />
            <Field
              label="TNG 名字"
              value={tngName}
              onChange={(e) => setTngName(e.target.value)}
              placeholder="例如 EDMOND LEE"
              hint="你转钱给别人时 TNG 显示的名字。"
            />
            <Field
              label="给朋友转账用的电话"
              value={payPhone}
              onChange={(e) => setPayPhone(e.target.value)}
              inputMode="tel"
              placeholder="012-345 6789"
              hint="会显示在朋友的付款画面，方便他们在 TNG 搜你。"
            />
            <Button
              variant="tinted"
              full
              loading={savingProfile}
              onClick={async () => {
                setSavingProfile(true);
                try {
                  await patch({ name, tngName: tngName || null, payPhone: payPhone || null });
                } catch (e) {
                  toast(e instanceof Error ? e.message : "存不到", "error");
                } finally {
                  setSavingProfile(false);
                }
              }}
            >
              保存资料
            </Button>
          </div>
        </Group>

        <Group
          title="TNG 收款 QR"
          footer="在 TNG 打开「收款 / Receive」截图，上传那张截图就可以。朋友付款画面会显示这个 QR。"
        >
          <div className="flex flex-col items-center p-4">
            {me.qrPayload ? (
              <>
                <QrCode payload={me.qrPayload} size={168} label="你的收款 QR" />
                <p className="mt-2 text-[12px] leading-4 text-label-2">
                  {info?.isEmv ? (info.isDuitNow ? "DuitNow QR" : "EMV QR") : "QR 已读取"}
                  {info?.merchantName && ` · ${info.merchantName}`}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center py-4 text-label-3">
                <QrIcon className="size-11" strokeWidth={1.5} />
                <p className="mt-2 text-[14px] text-label-2">还没上传</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onQrFile(e.target.files?.[0])} />
            <Button className="mt-3" variant="filled" loading={qrBusy} onClick={() => fileRef.current?.click()}>
              {me.qrPayload ? "换一张 QR 截图" : "上传 QR 截图"}
            </Button>
          </div>
        </Group>

        {info?.isEmv && (
          <Group
            title="实验功能"
            footer="开了之后，朋友的 QR 会自动带金额。TNG 不一定接受自己加的金额，请先叫一个朋友扫扫看，金额有自动出现才开。"
          >
            <Row
              onClick={() => patch({ qrAmountEnabled: !me.qrAmountEnabled }, me.qrAmountEnabled ? "已关闭" : "已开启")}
              trailing={
                <span
                  role="switch"
                  aria-checked={me.qrAmountEnabled}
                  className={`relative inline-flex h-[31px] w-[51px] rounded-full transition-colors ${me.qrAmountEnabled ? "bg-green" : "bg-fill-2"}`}
                >
                  <span
                    className={`absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-transform ${me.qrAmountEnabled ? "translate-x-[22px]" : "translate-x-[2px]"}`}
                  />
                </span>
              }
            >
              <span className="text-[15px]">QR 带金额</span>
            </Row>
          </Group>
        )}

        <Group title="帐号" footer={`登入名：${me.username}`}>
          <Row onClick={() => setPwOpen(true)} chevron>
            <span className="text-[15px]">改密码</span>
          </Row>
          {me.isAdmin && (
            <Row onClick={() => setAccOpen(true)} chevron>
              <p className="text-[15px]">帮另一个付钱的人开帐号</p>
              <p className="text-[12px] leading-4 text-label-2">
                {payers.length > 1 ? `已有：${payers.map((p) => p.name).join("、")}` : "例如常常跟你轮流付钱的朋友"}
              </p>
            </Row>
          )}
          <Row
            onClick={async () => {
              await api("/api/auth/logout", { body: {} });
              router.replace("/login");
              router.refresh();
            }}
            leading={<LogOut className="size-5 text-red-text" strokeWidth={1.75} />}
          >
            <span className="text-[15px] text-red-text">登出</span>
          </Row>
        </Group>

        <Group title="快要来">
          <div className="p-4 text-[14px] leading-5 text-label-2">
            自动对账：TNG 收到钱的通知会自动打勾、抓出谁忘了给 tax；每星期上传 TNG 交易记录 PDF 补漏。
          </div>
        </Group>
        <div className="h-6" />
      </div>

      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
      <AccountSheet open={accOpen} onClose={() => setAccOpen(false)} friends={friendsWithoutAccount} />
    </main>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="改密码"
      footer={
        <Button
          variant="filled"
          size="lg"
          full
          loading={busy}
          disabled={!current || next.length < 6}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/api/me/password", { body: { current, next } });
              toast("密码已更新");
              setCurrent("");
              setNext("");
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "出错了");
            } finally {
              setBusy(false);
            }
          }}
        >
          更新密码
        </Button>
      }
    >
      <div className="space-y-4 pt-2">
        <Field label="现在的密码" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <Field label="新密码" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" hint="最少 6 个字" />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Sheet>
  );
}

function AccountSheet({
  open,
  onClose,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  friends: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="开帐号"
      footer={
        <Button
          variant="filled"
          size="lg"
          full
          loading={busy}
          disabled={(!personId && !name.trim()) || !username || password.length < 6}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/api/users", { body: { personId: personId || null, name: personId ? null : name, username, password } });
              toast("帐号开好了，把登入名和密码给他");
              onClose();
              router.refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "出错了");
            } finally {
              setBusy(false);
            }
          }}
        >
          开帐号
        </Button>
      }
    >
      <div className="space-y-4 pt-2">
        <p className="text-[14px] leading-5 text-label-2">
          他登入后可以自己新增他付的单、上传他的 TNG 收款 QR、记录朋友还他的钱。
        </p>
        {friends.length > 0 && (
          <label className="block">
            <span className="mb-1.5 block px-1 text-[13px] font-medium text-label-2">已经在朋友名单里？</span>
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className="h-11 w-full rounded-[10px] border border-separator bg-surface px-3 text-[16px]"
            >
              <option value="">不是，新的人</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!personId && <Field label="名字" value={name} onChange={(e) => setName(e.target.value)} />}
        <Field label="登入名" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" />
        <Field label="临时密码" value={password} onChange={(e) => setPassword(e.target.value)} hint="最少 6 个字，他登入后可以自己改" />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Sheet>
  );
}
