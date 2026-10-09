"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
import { api } from "@/lib/client/api";
import { canRecord, startRecording, type Recording } from "@/lib/client/audio";
import { Button, Notice, Spinner } from "@/components/ui";

const MAX_SECONDS = 60;
const noopSubscribe = () => () => {};
const EXAMPLE = "总共 66 块半。Nasi lemak 两个 24 块，teh tarik 三杯每杯 3 块，加一，SST 6%。";

/** 没有 receipt：讲出来（或打字），AI 整理成 item / tax / 总额，交给核对画面 */
export function VoiceInput<T>({ onResult, onBack }: { onResult: (r: T) => void; onBack: () => void }) {
  const [phase, setPhase] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 这个浏览器能不能录音（server render 时先当作可以）
  const micOk = useSyncExternalStore(noopSubscribe, canRecord, () => true);
  const rec = useRef<Recording | null>(null);

  // 离开这个画面时把麦克风关掉
  useEffect(() => () => rec.current?.cancel(), []);

  async function send(body: { audio: string } | { text: string }) {
    setPhase("working");
    setError(null);
    try {
      onResult(await api<T>("/api/receipt/voice", { body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "整理不到，再试一次");
      setPhase("idle");
    }
  }

  async function stop() {
    const r = rec.current;
    rec.current = null;
    if (!r) return;
    setPhase("working");
    try {
      const { base64, seconds: s } = await r.stop();
      if (s < 1) {
        setError("太短了，按一下开始讲，讲完再按一下");
        setPhase("idle");
        return;
      }
      await send({ audio: base64 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "录音读不到，再录一次试试");
      setPhase("idle");
    }
  }

  // 录音中：每秒更新时间，超过一分钟自动停
  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) void stop();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function toggle() {
    if (phase === "recording") return stop();
    setError(null);
    try {
      rec.current = await startRecording();
      setSeconds(0);
      setPhase("recording");
    } catch (e) {
      setError(e instanceof Error ? e.message : "开不到麦克风，可以改用打字");
    }
  }

  const working = phase === "working";
  return (
    <div className="px-4">
      {micOk && (
        <button
          type="button"
          onClick={toggle}
          disabled={working}
          aria-pressed={phase === "recording"}
          className="press grid-lines on-color mt-6 flex w-full flex-col items-center rounded-[32px] px-6 pt-12 pb-11 text-center disabled:opacity-100"
        >
          <span className="relative flex size-20 items-center justify-center rounded-full bg-ink text-volt">
            {phase === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-magenta/40 motion-reduce:animate-none" />}
            {working ? (
              <Spinner className="size-8 text-volt" />
            ) : phase === "recording" ? (
              <Square className="relative size-8 fill-current" strokeWidth={0} aria-hidden />
            ) : (
              <Mic className="size-9" strokeWidth={2} aria-hidden />
            )}
          </span>
          <span className="display mt-6 text-[36px]" aria-live="polite">
            {working ? "正在听…" : phase === "recording" ? `0:${String(seconds).padStart(2, "0")}` : "按一下开始讲"}
          </span>
          <span className="mt-2 text-[14px] leading-5">
            {working ? "AI 在整理 item 和价钱，大概 5–15 秒" : phase === "recording" ? "讲完再按一下" : "每样吃的和价钱、有没有 tax、总共多少"}
          </span>
        </button>
      )}

      <p className="mt-4 px-1 text-[13px] leading-[19px] text-label-2">
        例如：「{EXAMPLE}」中文、English、Melayu 混着讲都可以。
      </p>

      <div className="mt-8">
        <label htmlFor="voice-text" className="label-mono mb-2 block px-1 text-label-2">
          {micOk ? "或者打字" : "打字（这个浏览器不能录音）"}
        </label>
        <textarea
          id="voice-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={EXAMPLE}
          disabled={working || phase === "recording"}
          className="w-full resize-none rounded-[12px] border-[1.5px] border-transparent bg-field px-4 py-3 text-[16px] leading-6 text-label outline-none transition-colors placeholder:text-label-3 focus:border-label"
        />
        <Button
          variant="filled"
          size="lg"
          full
          className="mt-3"
          loading={working && !!text.trim()}
          disabled={text.trim().length < 2 || working || phase === "recording"}
          onClick={() => send({ text: text.trim() })}
        >
          整理
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <Button variant="plain" onClick={onBack} disabled={working}>
          回去拍 receipt
        </Button>
      </div>
    </div>
  );
}
