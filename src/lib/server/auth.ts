import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "km_session";
const SESSION_DAYS = 90;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64url"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

let cachedSecret: string | null = null;

/** SESSION_SECRET 没设定的话，第一次自动生成并存进资料库 */
async function sessionSecret(): Promise<string> {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  const sql = await db();
  const fresh = randomToken(32);
  await sql`insert into app_settings (key, value) values ('session_secret', ${fresh}) on conflict (key) do nothing`;
  const rows = await sql<{ value: string }[]>`select value from app_settings where key = 'session_secret'`;
  cachedSecret = rows[0].value;
  return cachedSecret;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export async function createSessionValue(userId: string): Promise<{ value: string; maxAge: number }> {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const data = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  return { value: `${data}.${sign(data, await sessionSecret())}`, maxAge: SESSION_DAYS * 86400 };
}

async function readSessionUserId(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const [data, sig] = value.split(".");
  if (!data || !sig) return null;
  const expected = sign(data, await sessionSecret());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString()) as { uid: string; exp: number };
    if (typeof parsed.uid !== "string" || parsed.exp < Date.now()) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  personId: string;
  username: string;
  name: string;
  isAdmin: boolean;
  qrPayload: string | null;
  qrAmountEnabled: boolean;
  payPhone: string | null;
  tngName: string | null;
}

export async function getUserById(id: string): Promise<SessionUser | null> {
  const sql = await db();
  const rows = await sql<SessionUser[]>`
    select u.id, u.person_id as "personId", u.username, p.name, u.is_admin as "isAdmin",
           u.qr_payload as "qrPayload", u.qr_amount_enabled as "qrAmountEnabled",
           u.pay_phone as "payPhone", p.tng_name as "tngName"
    from users u join people p on p.id = u.person_id
    where u.id = ${id}`;
  return rows[0] ?? null;
}

/** 目前登入的付款人（你或 B）；没登入返回 null */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const uid = await readSessionUserId(store.get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  return getUserById(uid);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "请先登入");
  return u;
}

/** 页面用：没登入就转去登入页（layout 跟 page 是同时 render 的，所以每一页都要自己检查） */
export async function pageUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function hasAnyUser(): Promise<boolean> {
  const sql = await db();
  const rows = await sql`select 1 from users limit 1`;
  return rows.length > 0;
}
