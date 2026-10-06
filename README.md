# KiraMakan

聚餐分账 + 追钱。拍 receipt → 两个 AI 一起拆 item、互相比对 → 朋友点自己吃的 → 自动摊 tax → 记录谁还了钱。

## 有什么功能

- **两个 AI 一起读 receipt**：Gemini 和 DeepSeek 同时读、互相比对，不会比只用一个慢。
  - 读的一样：显示 ✓。
  - 读的不一样：自动用「item + charges 加起来刚好等于总额」的那一个，把有出入的 item 标出来（例如「DeepSeek 读成 RM 6.50」「只有 Gemini 读到这个」）。另一个 AI 多读到的 item，按一下就能加进来。
  - 其中一个没回应：用另一个的结果，并告诉你只有它读到。
  - AI 只负责「看」，加减乘除全部用 code 算。
- **加起来要等于总额才能继续**：核对画面会检查 item + SST / service charge / rounding / 折扣是否刚好等于总额。只差几仙一按补 Rounding；差更多要对 receipt 改，或者一按把差额记成一行「其他」。server 也会再检查一次。
- **自动摊 tax**：用「总额 ÷ item 加起来」得出倍数，每人的 item 乘这个倍数，不用知道税率。每个人的金额加起来一定刚好等于总额。
- **对账**：账单页显示「大家要付的加起来 = 你付的总额 ✓」。有 item 没人认领时，直接写出你会少收多少，一按就能让大家平分。
- **朋友 link**：每餐一个 link 丢进 WhatsApp group。朋友选名字、点自己吃的（几个人分一个 item、选份数都可以），马上看到含 tax 的金额、你的收款 QR 和「复制金额」。
- **两个付钱的人（做法二）**：你和 B 各有帐号、各自的收款 QR。谁付的那餐，朋友就还给谁。你欠 B、B 欠你的可以一键互抵。
- **记录收款**：输入金额时自动判断「刚好付清 / 忘了给 tax，还差多少 / 还欠多少 / 多给了（记成 credit 下次扣）」。
- **专属 link**：每个朋友一个 link，看自己总共欠谁、每一餐的明细。
- 手机可以「加到主画面」当 app 用，支持深色模式。

## 部署（大约 15 分钟）

### 1. Supabase（资料库，免费方案就够）

1. 到 [supabase.com](https://supabase.com) 开一个新 project。Region 选 **Singapore**，记住你设的 Database password。
2. 在项目页面上方按 **Connect**，选 **Transaction pooler**，复制那串 URI（port 是 **6543**，用户名像 `postgres.xxxxxxxx`）。
3. 把里面的 `[YOUR-PASSWORD]` 换成你的资料库密码，这串就是 `DATABASE_URL`。

不用自己建表：第一次打开网站时会自动建好。

免费方案一个星期没人用会暂停。`vercel.json` 已经设定 Vercel 每天自动 ping 一次，所以不会停。

### 2. 读 receipt 的 AI key

- **Gemini（免费）**：到 [Google AI Studio](https://aistudio.google.com/apikey) → Create API key，这就是 `GEMINI_API_KEY`。免费版不用信用卡。
- **DeepSeek**：到 [platform.deepseek.com](https://platform.deepseek.com) → API keys → Create，这就是 `DEEPSEEK_API_KEY`。用你已经充值的余额，每张 receipt 不到 1 sen。
- OpenAI 可以不用。有设 `OPENAI_API_KEY` 的话会变成第三个一起比对。

只设其中一个也能用，只是没有另一个 AI 互相检查。一个都没设的话，读 receipt 会失败，要手动输入 item。

### 3. Vercel（网站，免费方案就够）

**方法 A：GitHub（推荐）**

1. 把这个文件夹推上一个 GitHub repo（private 就可以）。
2. 到 [vercel.com](https://vercel.com) → Add New → Project → Import 那个 repo。
3. 在 Environment Variables 加 `DATABASE_URL`、`GEMINI_API_KEY`、`DEEPSEEK_API_KEY`。
4. 按 Deploy。

**方法 B：Vercel CLI**

```bash
npm i -g vercel
cd kiramakan
vercel                                     # 第一次会叫你登入、建立 project
vercel env add DATABASE_URL production
vercel env add GEMINI_API_KEY production
vercel env add DEEPSEEK_API_KEY production
vercel --prod
```

### 4. 第一次打开

1. 打开 Vercel 给你的网址，会自动去「第一次设定」，建立你的帐号。
2. 到「设定」：上传 TNG 收款 QR 的截图（TNG → 收款 / Receive → 截图），填给朋友转账用的电话。
3. 到「设定」→「帮另一个付钱的人开帐号」，帮 B 开帐号，把登入名和临时密码给他。
4. 在手机浏览器按「分享 → 加到主画面」，以后就像 app 一样打开。
5. 拿 5–10 张以前的 receipt 照片试新增账单，看两个 AI 读得准不准。

## 怎么用

1. 「新增一餐」→ 拍 receipt → 看比对结果、改标出来的地方 → 加起来对得上总额 → 选谁付的、谁有吃 → 建立账单。
2. 按 WhatsApp 把 link 丢进 group（或者自己先帮大家分 item：先选人，再点他吃的）。
3. 看账单页的「对账」：显示 ✓ 就代表大家要付的加起来刚好等于你付的。
4. 朋友开 link → 选自己的名字 → 点吃的 → 去付款。
5. 收到钱后，在账单或朋友页面按「记录收款」。Phase 2 会改成自动。
6. 有人一直没还：到朋友页面按 WhatsApp，把他的专属 link 发给他。

## 环境变量

| 名称 | 必须 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Supabase 的 transaction pooler 连接字符串 |
| `GEMINI_API_KEY` | 建议 | Google AI Studio 的免费 key |
| `DEEPSEEK_API_KEY` | 建议 | DeepSeek 的 key |
| `OPENAI_API_KEY` | 否 | 有的话变成第三个一起比对 |
| `GEMINI_MODEL` / `DEEPSEEK_MODEL` / `OPENAI_MODEL` | 否 | 指定模型（可以用逗号列几个，按顺序试）。没设会用默认：Gemini `gemini-3.8-flash` → `gemini-3.5-flash` → `gemini-2.5-flash`；DeepSeek `deepseek-v4-flash-vision-exp` → `deepseek-flash`；OpenAI `gpt-6-luna` → `gpt-5.4-mini` → `gpt-5-mini` |
| `SESSION_SECRET` | 否 | 登入 cookie 的签名密钥。没设会自动产生并存在资料库 |
| `CRON_SECRET` | 否 | 设了的话，每天的自动 ping 要带这个密钥（Vercel 会自动带） |
| `OCR_MOCK` | 否 | 本机测试用假资料：`1` 两个 AI 读得不一样、`agree` 一样、`single` 只有一个读到、`extra` 另一个多读到一个 item |

## 要知道的限制

- **DeepSeek 读图还是实验功能**（`deepseek-v4-flash-vision-exp`），每张图片最多只用 384 个 token，长 receipt 的小字可能读不清楚。所以才让 Gemini 一起读，互相检查。
- **Gemini 免费版的资料 Google 可能拿去改进模型**。receipt 上只有餐厅和 item，一般没关系；介意的话可以在 Google AI Studio 开启付费。免费版每天的次数上限对几个人吃饭绰绰有余。
- 两个 AI 读得一样，也不代表一定对（例如两个都把 8 看成 3）。所以「加起来要等于总额」那一关一定要过，总额也请自己看一眼 receipt。
- **「QR 带金额」是实验功能**，默认关闭。TNG 不一定接受自己加进去的金额，请先叫一个朋友扫扫看，金额有自动出现才在设定里打开。
- 朋友的 link 不用登入：拿到 link 的人可以选任何名字点 item。朋友之间够用，但不要把 link 公开贴出去。
- 付款记录是「人对人」的余额，不是绑某一餐：还款会先还最早的一餐（FIFO）。删掉一张单不会删掉已记录的付款。
- Phase 2 还没做：TNG 进账通知自动对账、每星期上传 TNG 交易记录 PDF 补漏。

## 本机开发

```bash
npm install
cp .env.example .env.local   # 填 DATABASE_URL（本机 Postgres 或 Supabase 都可以）
npm run dev                  # http://localhost:3000
npm test                     # 金额计算、对账、两个 AI 比对、QR 的单元测试
```

## 技术

Next.js 16（App Router）、Postgres（postgres.js）、Gemini / DeepSeek / OpenAI 的 OpenAI 兼容 API（读图 + JSON）、Tailwind CSS v4。金额全部用 integer cents 计算，摊分用 largest remainder method，保证每个人的金额加起来刚好等于 receipt 总额。

主要程序：

- `src/lib/money.ts`：摊 tax、分 item、四舍五入
- `src/lib/receipt-compare.ts`：两个 AI 的结果比对、选哪一个、标出差异
- `src/lib/receipt.ts`：核对画面的检查（加起来要等于总额）
- `src/lib/ledger.ts`：欠款账本、FIFO、忘了 tax 的判断
- `src/lib/emvqr.ts`：DuitNow / EMV QR 解析和加金额
- `src/lib/server/ocr.ts`：读 receipt 的 prompt、各家 API 的接法
- `src/lib/server/db.ts`：资料表（第一次连线自动建立）
