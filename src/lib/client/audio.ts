"use client";

// 录音 → 16kHz 单声道 WAV（base64）。
// iPhone 录出来是 AAC（mp4），电脑 Chrome 是 WebM，AI 不一定都收；统一转成 WAV 最稳，讲话用 16kHz 就够清楚。

const RATE = 16_000;

export interface Recording {
  /** 停止，拿到 WAV 的 base64 和秒数 */
  stop: () => Promise<{ base64: string; seconds: number }>;
  /** 不要了（关掉麦克风） */
  cancel: () => void;
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export async function startRecording(): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("没有麦克风权限。到 iPhone「设定 → Safari → 麦克风」（主画面的 app 在「设定 → KiraMakan」）打开，再按一次。");
    }
    throw new Error("开不到麦克风，可以改用打字");
  }
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    async stop() {
      if (rec.state !== "inactive") rec.stop();
      await stopped;
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || chunks[0]?.type || "audio/mp4" });
      const pcm = await toMono16k(blob);
      return { base64: bytesToBase64(encodeWav(pcm)), seconds: pcm.length / RATE };
    },
    cancel() {
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error("录音读不到，再录一次试试");
  } finally {
    void ctx.close();
  }
  // 交给 OfflineAudioContext 混成单声道、换成 16kHz
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

/** 16-bit PCM WAV */
function encodeWav(samples: Float32Array): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk 大小
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 单声道
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true); // 每秒 bytes
  v.setUint16(32, 2, true); // 每个 sample 的 bytes
  v.setUint16(34, 16, true); // 16-bit
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
