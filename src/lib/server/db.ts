import "server-only";
import postgres from "postgres";

// 一个 process 只开一个连接池（next dev 热更新时也不要一直开新的）
const g = globalThis as unknown as {
  __kmSql?: postgres.Sql;
  __kmSchema?: Promise<void>;
};

type PgOptions = NonNullable<Parameters<typeof postgres>[1]>;

function makeClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("还没设定 DATABASE_URL（Supabase 的 Postgres 连接字符串）");
  }
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const local = host === "localhost" || host === "127.0.0.1" || host === "";
  const options: PgOptions = {
    max: local ? 5 : 3,
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // Supabase pooler（transaction mode）不支持 prepared statements
    ssl: local ? false : "require",
    onnotice: () => {},
    transform: { undefined: null },
  };
  // 平常的查询：一条连接一次只跑一个，不连发（pipelining）。
  // 经过 Supabase pooler（transaction mode）时，连发的查询结果会送错给别的查询，剩下的永远等不到回应。
  // （max_pipeline 是 postgres.js 有的选项，只是 type 没写进去）
  const sql = postgres(url, { ...options, max_pipeline: 0 } as PgOptions);
  // 交易另外用一个照常设定的 client：postgres.js 的 begin 要靠连发那段逻辑把连接留给交易，
  // max_pipeline: 0 会让它报 UNSAFE_TRANSACTION。交易里 pooler 一直用同一个资料库连接，连发没问题。
  const txSql = postgres(url, options);
  sql.begin = txSql.begin;
  return sql;
}

export function rawSql(): postgres.Sql {
  if (!g.__kmSql) g.__kmSql = makeClient();
  return g.__kmSql;
}

/** 拿到 sql 之前先确保资料表存在（第一次部署时自动建表，不用手动跑 migration） */
export async function db(): Promise<postgres.Sql> {
  const sql = rawSql();
  if (!g.__kmSchema) {
    g.__kmSchema = ensureSchema(sql).catch((e) => {
      g.__kmSchema = undefined;
      throw e;
    });
  }
  await g.__kmSchema;
  return sql;
}

const SCHEMA = /* sql */ `
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tng_name text,
  phone text,
  token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references people(id),
  username text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  qr_payload text,
  qr_amount_enabled boolean not null default false,
  pay_phone text,
  webhook_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  bill_date date not null default current_date,
  payer_person_id uuid not null references people(id),
  total_cents integer not null,
  printed_subtotal_cents integer,
  receipt_image bytea,
  receipt_mime text,
  ocr_raw jsonb,
  share_token text not null unique,
  locked boolean not null default false,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bills_payer_idx on bills (payer_person_id);

create table if not exists bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  position integer not null,
  name text not null,
  qty numeric(10,3) not null default 1,
  line_cents integer not null
);
create index if not exists bill_items_bill_idx on bill_items (bill_id);

create table if not exists bill_charges (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  position integer not null,
  label text not null,
  amount_cents integer not null
);
create index if not exists bill_charges_bill_idx on bill_charges (bill_id);

create table if not exists bill_participants (
  bill_id uuid not null references bills(id) on delete cascade,
  person_id uuid not null references people(id),
  added_at timestamptz not null default now(),
  primary key (bill_id, person_id)
);

create table if not exists item_shares (
  item_id uuid not null references bill_items(id) on delete cascade,
  person_id uuid not null references people(id),
  units integer not null default 1 check (units > 0),
  primary key (item_id, person_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  from_person_id uuid not null references people(id),
  to_person_id uuid not null references people(id),
  amount_cents integer not null check (amount_cents > 0),
  paid_at timestamptz not null default now(),
  source text not null default 'manual',
  note text,
  raw text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index if not exists payments_pair_idx on payments (from_person_id, to_person_id);

create table if not exists app_settings (
  key text primary key,
  value text not null
);

-- Phase 2：TNG 进账通知自动记账 + 手机通知
alter table users add column if not exists remind_every integer not null default 2;
alter table users add column if not exists notify_payments boolean not null default true;
alter table users add column if not exists remind_last_at timestamptz;

-- 确认过的 TNG 名字（大写、去符号）→ 哪个朋友
create table if not exists tng_aliases (
  alias text primary key,
  person_id uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- iPhone 捷径传来的每一个 TNG 通知
create table if not exists incoming_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  raw_text text not null,
  sender_name text,
  amount_cents integer,
  direction text not null default 'unknown',
  status text not null default 'pending',
  reason text,
  from_person_id uuid references people(id),
  payment_id uuid references payments(id) on delete set null,
  verdict text,
  verdict_kind text,
  received_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists incoming_user_idx on incoming_payments (user_id, received_at desc);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count integer not null default 0
);
`;

async function ensureSchema(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(727101)`;
    await tx.unsafe(SCHEMA);
  });
}
