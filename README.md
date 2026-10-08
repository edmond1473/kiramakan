# KiraMakan

聚餐分账 + 追钱。拍 receipt → 两个 AI 一起拆 item、互相比对 → 朋友点自己吃的 → 自动摊 tax → 朋友用 TNG 转钱时自动记账 → 每隔一天提醒你谁还没还。

## 有什么功能

- **两个 AI 一起读 receipt**：Gemini 和 DeepSeek 同时读、互相比对，不会比只用一个慢。
  - 读的一样：显示 ✓。
  - 读的不一样：自动用「item + charges 加起来刚好等于总额」的那一个，把有出入的 item 标出来（例如「DeepSeek 读成 RM 6.50」「只有 Gemini 读到这个」）。另一个 AI 多读到的 item，按一下就能加进来。
  - 其中一个没回应：用另一个的结果，并告诉你只有它读到。
  - AI 只负责「看」，加减乘除全部用 code 算。
- **加起来要等于总额才能继续**：核对画面会检查 item + SST / service charge / rounding / 折扣是否刚好等于总额。只差几仙一按补 Rounding；差更多要对 receipt 改，或者一按把差额记成一行「其他」。server 也会再检查一次。
- **自动摊 tax**：用「总额 ÷ item 加起来」得出倍数，每人的 item 乘这个倍数，不用知道税率。每个人的金额加起来一定刚好等于总额。
- **对账**：账单页显示「大家要付的加起来 = 你付的总额 ✓」。有 item 没人认领时，直接写出你会少收多少，一按就能让大家平分。
- **朋友 link**：每餐一个 link 丢进 WhatsApp group。朋友选名字、点自己吃的（几个人分一个 item、选份数都可以），马上看到含 tax 的金额。按「去付款」会自动复制金额、打开 TNG app，朋友在 TNG 按 Transfer → 选你 → 贴上金额 → PIN；回到网页还有你的收款 QR 和电话。
- **两个付钱的人（做法二）**：你和 B 各有帐号、各自的收款 QR。谁付的那餐，朋友就还给谁。你欠 B、B 欠你的可以一键互抵。
- **记录收款**：输入金额时自动判断「刚好付清 / 忘了给 tax，还差多少 / 还欠多少 / 多给了（记成 credit 下次扣）」。
- **专属 link**：每个朋友一个 link，看自己总共欠谁、每一餐的明细。
- **TNG 进账自动记账**：iPhone 收到 TNG「收到钱」的通知时，「快捷指令」自动把通知内容传给 KiraMakan。
  - 认得出是哪个朋友、金额不超过他欠的 → 直接记好（少给 tax 也会照记，并标出还差多少）。
  - 名字对不上、他没欠钱、或多给了 → 放在「TNG 进账」的「待确认」，一按就记；选过一次的 TNG 名字下次自动认得。
  - 你付钱出去、cashback、reload、广告的通知不会记。记错了可以按「撤销」。
- **手机通知 + 提醒**：每笔自动记好、少给 tax、不知道是谁转的，都会通知你。每天或每隔一天（可以选）晚上提醒：谁还没还（吃了什么）、谁少给 tax、哪些 item 没人认领。按通知会打开「谁还没还」页面，可以一按 WhatsApp 催他。
- 手机可以「加到主画面」当 app 用，支持深色模式。

## 部署（大约 15 分钟）

### 1. Supabase（资料库，免费方案就够）

1. 到 [supabase.com](https://supabase.com) 开一个新 project。Region 选 **Singapore**，记住你设的 Database password。
2. 在项目页面上方按 **Connect**，选 **Transaction pooler**，复制那串 URI（port 是 **6543**，用户名像 `postgres.xxxxxxxx`）。
3. 把里面的 `[YOUR-PASSWORD]` 换成你的资料库密码，这串就是 `DATABASE_URL`。

不用自己建表：第一次打开网站时会自动建好。

免费方案一个星期没人用会暂停。`vercel.json` 已经设定 Vercel 每天自动 ping 一次，所以不会停（同一个设定也负责每天晚上发「谁还没还」的提醒）。

### 2. 读 receipt 的 AI key

- **Gemini（免费）**：到 [Google AI Studio](https://aistudio.google.com/apikey) → Create API key，这就是 `GEMINI_API_KEY`。免费版不用信用卡。先用 `gemini-3.8-flash`（最准，但免费版每天次数很少），次数用完会自动换 `gemini-3.5-flash-lite`（免费次数多很多）。
- **DeepSeek**：到 [platform.deepseek.com](https://platform.deepseek.com) → API keys → Create，这就是 `DEEPSEEK_API_KEY`。**key 一定要在有余额的那个帐号开**，不然会显示「帐号没有余额」。每张 receipt 不到 1 sen。
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
4. 在 iPhone 的 Safari 按「分享 → 加入主画面」，以后从主画面打开（手机通知一定要这样才能开）。
5. 从主画面打开 →「设定」→「手机通知」按「开启通知」，跳出来时按「允许」。
6. 「设定」→「TNG 进账自动记录」→「iPhone 设定」，照着做一次（大约 3 分钟），再叫朋友转 RM 0.10 试试。
7. 拿 5–10 张以前的 receipt 照片试新增账单，看两个 AI 读得准不准。

## 怎么用

1. 「新增一餐」→ 拍 receipt → 看比对结果、改标出来的地方 → 加起来对得上总额 → 选谁付的、谁有吃 → 建立账单。
2. 按 WhatsApp 把 link 丢进 group（或者自己先帮大家分 item：先选人，再点他吃的）。
3. 看账单页的「对账」：显示 ✓ 就代表大家要付的加起来刚好等于你付的。
4. 朋友开 link → 选自己的名字 → 点吃的 → 去付款。
5. 朋友用 TNG 转钱给你：自动记好，手机会通知你。「首页」出现橘色的「要你确认」时，按进去选是谁就好。
6. 不是用 TNG 转的（例如现金）：在账单或朋友页面按「记录收款」。
7. 有人一直没还：按提醒通知（或首页「谁吃了什么」）打开「谁还没还」，按「催他」用 WhatsApp 发给他，会写出他欠多少、吃了什么，还有他的专属 link。

## 环境变量

| 名称 | 必须 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | Supabase 的 transaction pooler 连接字符串 |
| `GEMINI_API_KEY` | 建议 | Google AI Studio 的免费 key |
| `DEEPSEEK_API_KEY` | 建议 | DeepSeek 的 key |
| `OPENAI_API_KEY` | 否 | 有的话变成第三个一起比对 |
| `GEMINI_MODEL` / `DEEPSEEK_MODEL` / `OPENAI_MODEL` | 否 | 指定模型（可以用逗号列几个，按顺序试）。没设会用默认：Gemini `gemini-3.8-flash` → `gemini-3.5-flash-lite`；DeepSeek `deepseek-flash` → `deepseek-v4-flash-vision-exp`；OpenAI `gpt-6-luna` → `gpt-5.4-mini` → `gpt-5-mini` |
| `SESSION_SECRET` | 否 | 登入 cookie 的签名密钥。没设会自动产生并存在资料库 |
| `CRON_SECRET` | 否 | 设了的话，每天的 cron（ping 资料库、发提醒）要带这个密钥（Vercel 会自动带） |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 否 | 手机通知的金钥。没设会自动产生并存在资料库；之后换金钥的话，每部手机要重新按一次「开启通知」 |
| `VAPID_SUBJECT` | 否 | 手机通知的联络方式（`mailto:` 或 `https://`）。没设会用 Vercel 的网址 |
| `OCR_MOCK` | 否 | 本机测试用假资料：`1` 两个 AI 读得不一样、`agree` 一样、`single` 只有一个读到、`extra` 另一个多读到一个 item |
| `PUSH_MOCK` | 否 | 本机测试：`1` 的话手机通知不真的发，印在 log（`[push:mock]`） |

## 要知道的限制

- **DeepSeek 读图**（`deepseek-flash`）每张图片用的 token 有上限，长 receipt 的小字可能读不清楚。所以才让 Gemini 一起读，互相检查。
- **Gemini 免费版有每日次数**：3.8 Flash 每天只有很少次，用完会自动换 3.5 Flash-Lite；两个都用完就要等第二天，或在 Google AI Studio 开启付费。
- **Gemini 免费版的资料 Google 可能拿去改进模型**。receipt 上只有餐厅和 item，一般没关系；介意的话可以在 Google AI Studio 开启付费。免费版每天的次数上限对几个人吃饭绰绰有余。
- 两个 AI 读得一样，也不代表一定对（例如两个都把 8 看成 3）。所以「加起来要等于总额」那一关一定要过，总额也请自己看一眼 receipt。
- **「QR 带金额」是实验功能**，默认关闭。TNG 不一定接受自己加进去的金额，请先叫一个朋友扫扫看，金额有自动出现才在设定里打开。
- 朋友的 link 不用登入：拿到 link 的人可以选任何名字点 item。朋友之间够用，但不要把 link 公开贴出去。
- 付款记录是「人对人」的余额，不是绑某一餐：还款会先还最早的一餐（FIFO）。删掉一张单不会删掉已记录的付款。
- **TNG 进账自动记账要 iPhone 的 iOS 27 以上**（「快捷指令」才有「收到通知时」的自动化）。手机关机、没网络、或专注模式挡住 TNG 通知时，那一笔不会传过来：每天的提醒还是会显示他没还，手动「记录收款」就好。
- TNG 没有公开通知的格式，KiraMakan 用规则读金额和名字（英文、马来文、中文都试着读）。读不懂的会放在「待确认」或「其他 TNG 通知」，你可以看到收到的原文。
- 专属网址（`/api/hook/tng/...`）就像密码：拿到的人可以假装 TNG 通知。外泄的话到「iPhone 设定」最下面按「换一个新网址」。
- 手机通知：iPhone 要 iOS 16.4 以上，而且一定要从主画面打开 KiraMakan 才能开。每部手机要各自开一次。
- Vercel 免费版的 cron 每天只能跑一次，而且是在那一个小时里任何时间，所以提醒大约在晚上 9 点到 10 点之间。
- **「去付款」打开 TNG** 用的是 TNG 官方的 `tngdwallet://` 链接（Android 用 Chrome 的 intent 链接，打不开会去 Play Store 的 TNG 页面）。只能打开 TNG，不能帮朋友选好收款人或填好金额（TNG 没有开放个人转账给外面的网站），所以金额会先复制好。iPhone 会先问「在 TNG eWallet 中打开？」。电脑上不会去打开。
- 还没做：每星期上传 TNG 交易记录 PDF，补回 iPhone 没传到的进账。

## 读不到 receipt 怎么办

先到「设定」→「读 receipt 的 AI」按「检查 AI」，会显示两个 key 有没有效、每个模型能不能用、DeepSeek 余额。每个模型失败的原因也会写进 Vercel 的 log（Vercel → 项目 → Logs，搜 `[ocr]`）。

| 显示 | 原因 | 怎么办 |
| --- | --- | --- |
| 帐号没有余额 | DeepSeek 这个 key 所在的帐号没钱（HTTP 402） | 到 platform.deepseek.com 看余额、充值；钱充在别的帐号的话，用那个帐号开 key |
| 次数到上限了 | Gemini 免费版今天的次数用完（HTTP 429） | 等明天，或在 Google AI Studio 开启付费 |
| 这个模型不能用 | 模型已停用或名字不对（HTTP 404） | 不用理，会自动跳过；全部不能用的话在 Vercel 设 `GEMINI_MODEL` / `DEEPSEEK_MODEL` 换模型 |
| API key 无效或没有权限 | key 贴错、多了空格，或被删掉 | 重新复制 key，到 Vercel → Settings → Environment Variables 改好，再 Redeploy |

改了 Vercel 的环境变数一定要 **Redeploy** 才会生效。

## 本机开发

```bash
npm install
cp .env.example .env.local   # 填 DATABASE_URL（本机 Postgres 或 Supabase 都可以）
npm run dev                  # http://localhost:3000
npm test                     # 金额计算、对账、两个 AI 比对、AI 出错处理、QR、TNG 通知、提醒的单元测试
```

## 技术

Next.js 16（App Router）、Postgres（postgres.js）、Gemini / DeepSeek / OpenAI 的 OpenAI 兼容 API（读图 + JSON）、Tailwind CSS v4。金额全部用 integer cents 计算，摊分用 largest remainder method，保证每个人的金额加起来刚好等于 receipt 总额。

介面风格参考 ManyChat：白底配近黑字，重点用整块的亮黄 / 洋红 / 靛蓝 / 深绿，胶囊按钮、大圆角卡片、没有阴影，小标签用全大写等宽字。颜色和字体 token 都在 `src/app/globals.css`，基本组件在 `src/components/ui.tsx`。字体全部免费、自己 host（npm `@fontsource`）：Bricolage Grotesque（大标题）、Instrument Sans（正文）、DM Mono（小标签）、Noto Sans SC Black（中文大标题，只会下载用到的字）。

主要程序：

- `src/lib/money.ts`：摊 tax、分 item、四舍五入
- `src/lib/receipt-compare.ts`：两个 AI 的结果比对、选哪一个、标出差异
- `src/lib/receipt.ts`：核对画面的检查（加起来要等于总额）
- `src/lib/ledger.ts`：欠款账本、FIFO、忘了 tax 的判断
- `src/lib/emvqr.ts`：DuitNow / EMV QR 解析和加金额
- `src/lib/server/ocr.ts`：读 receipt 的 prompt、各家 API 的接法、「检查 AI」
- `src/lib/ai-errors.ts`：把各家 API 的错误变成看得懂的原因
- `src/lib/tng-notify.ts`：读 TNG 通知（金额、谁转的、收钱还是付钱）、名字对上哪个朋友
- `src/lib/server/incoming.ts`：通知 → 自动记账 / 待确认 / 撤销；`src/app/api/hook/tng/[key]` 是 iPhone 捷径打的网址
- `src/lib/remind.ts`、`src/lib/server/remind.ts`：「谁还没还」的内容、提醒文字、每天的 cron（`/api/cron/remind`）
- `src/lib/server/push.ts`、`public/sw.js`：手机通知（Web Push）
- `src/lib/tng-link.ts`、`src/lib/client/tng.ts`：朋友按「去付款」时复制金额、打开 TNG app
- `src/lib/server/db.ts`：资料表（第一次连线自动建立，新版本的栏位也会自动加上）
