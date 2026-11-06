# PromiSure AI

**Every campaign, verified against live store facts.**
Shopify Campaign Integrity & Commerce Assurance, by **NousGen**.

PromiSure AI checks a Shopify merchant's promotional campaigns against live store data before launch and while they run. It catches wrong prices, unavailable products, expired offers, unsupported product claims, delivery promises that break policy, and broken landing pages. When something is wrong, it drafts corrected copy and routes the campaign through human review.

---

## Quick start (demo mode, no credentials needed)

```bash
npm install
cp .env.example .env          # demo mode works with the defaults
npx prisma migrate deploy     # create the SQLite database
npm run db:seed               # load DEMO DATA and verify every campaign
npm run dev                   # http://localhost:3000
```

Tests:

```bash
npm test                      # Vitest unit + integration (separate throwaway prisma/test.db)
npx playwright install chromium
npm run build && npm start    # in another terminal
npm run test:e2e              # Playwright end-to-end against http://localhost:3000 (resets DEMO DATA)
```

## What's included

| Area | Status |
|---|---|
| Campaign Guardian: intake, drafts, edits, submission | ✅ |
| Deterministic verification engine (price, inventory, status, promotion, claims, shipping, destination) | ✅ |
| PASS / REVIEW / BLOCK classification with a transparent 0–100 risk score | ✅ |
| Evidence-backed findings and printable verification reports (plus JSON at `/api/reports/:id`) | ✅ |
| Claim analysis: deterministic rules, with optional Ollama or Anthropic on top (Zod-validated, grounded) | ✅ |
| Corrected headline, text, description and CTA, with a grounding guard | ✅ |
| Product Intelligence, with fact provenance (Verified / Merchant-entered / Unverified / AI suggestion) | ✅ |
| Merchant policies (dispatch, delivery, free shipping, geography, restrictions, promotions) | ✅ |
| Monitoring: scheduled polling, change detection, re-verification, notifications, corrected drafts | ✅ |
| Shopify webhooks (HMAC verification, de-duplication) | ✅ |
| Human approval workflow and full audit log | ✅ |
| Shopify Admin GraphQL sync (pagination, throttling, retries) | ✅ implemented, **not yet run against a live store** |
| Prospects (CRM), CSV import with a downloadable template, lead qualification; sales charts in Analytics | ✅ |
| Outreach: LinkedIn search builder (any country), drafts, manual activity tracking | ✅ |
| Analytics, keeping actual and demo data separate | ✅ |

## Architecture

```
src/
  app/                    Next.js App Router (UI pages, server actions, API routes)
    (app)/…               Overview, Shopify, Products, Campaigns, History, Reports,
                          Sales, Prospects, Outreach, Analytics, Settings
    api/webhooks/shopify  HMAC-verified webhook receiver
    api/monitor/run       External cron trigger (Bearer CRON_SECRET)
    api/reports/[id]      Machine-readable report (integration / n8n hook)
  lib/
    verification/         Pure engine: checks.ts, risk.ts, engine.ts, destination.ts (SSRF-safe)
                          service.ts wires the engine to the DB
    ai/                   claimRules.ts (deterministic), providers.ts (rules | Ollama | Anthropic),
                          correctedCopy.ts (template generator + grounding guard), schemas.ts (Zod)
    shopify/              client.ts (GraphQL, retries, throttling), sync.ts, webhooks.ts
    monitoring/           monitor.ts: change detection, re-checks, demo store simulator
    sales/                scoring.ts, outreach.ts, service.ts
  instrumentation.ts      In-process scheduled polling
prisma/schema.prisma      Data model (SQLite now, PostgreSQL-ready)
tests/                    Vitest suites
```

Design principles:

- **Deterministic first.** Prices use `decimal.js`. Stock, status, dates and URLs never use an LLM.
- **Evidence or REVIEW.** A claim passes only when an approved Verified or Merchant-entered fact supports it. AI suggestions never count as evidence. When AI is enabled, its verdicts must cite real approved fact IDs, and it can never overrule a rule-detected contradiction.
- **The score never overrides status.** Any BLOCK finding blocks the campaign, whatever the score.
- **Human in the loop.** PromiSure AI never changes prices or inventory, publishes posts, launches or funds ads, issues refunds, or sends messages. The Shopify integration uses read-only scopes.
- **Modular.** The engine is pure functions, and the services are plain async functions, so an n8n or queue-based orchestration can call them later.

### Risk score

Each non-passing finding adds points by severity: LOW 5, MEDIUM 12, HIGH 25, CRITICAL 40. The total is capped at 100. Status comes from the worst finding outcome:

- any BLOCK finding → **BLOCK**
- otherwise, any REVIEW finding → **REVIEW**
- otherwise → **PASS**

## Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file (`file:./dev.db`) |
| `SHOPIFY_SHOP_DOMAIN` | `your-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Token from an existing admin-created custom app, **or** … |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | … a Dev Dashboard app on your own store (client credentials grant; the token is refreshed every 24h) |
| `SHOPIFY_API_VERSION` | Default `2026-10` |
| `SHOPIFY_WEBHOOK_SECRET` | HMAC key (defaults to the client secret, which Shopify uses to sign webhooks) |
| `AI_PROVIDER` | `rules` (default), `ollama` or `anthropic`. Can also be changed in Settings |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local inference |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional. Requires an Anthropic **API** account, billed separately from a Claude Pro subscription |
| `MONITOR_INTERVAL_MINUTES` | In-process polling interval (0 = off) |
| `CRON_SECRET` | Enables `POST /api/monitor/run` for an external scheduler |

**Required Shopify scopes:** `read_products` and `read_inventory`. No write scopes are requested.

**Approved facts from Shopify:** product metafields in the `promisure` namespace (for example `promisure.material`) are synced as Verified facts. Facts can also be added on a product page (**Products**) as Merchant-entered.

## Testing a complete campaign verification scenario

1. Open **Campaign Guardian → New campaign**.
2. Select **Ridgeline Rain Jacket**, variant **M / Storm Blue**. The form shows the live price ($189.00, compare-at $249.00, 12 in stock).
3. Enter:
   - **Headline:** `100% waterproof jacket, 40% off!`
   - **Promotional text:** `Now only $169. Next-day delivery Australia-wide.`
   - **Advertised price:** `169`
   - **Discount:** Percentage `40`
   - **Expiry:** next week
   - **Claim:** `100% waterproof outdoor jacket`
4. Click **Submit for verification**. Expected result: **BLOCK**, with these findings:
   - price mismatch ($169 vs $189)
   - discount mismatch (40% vs 24.10%), and 40% exceeds the approved 30% promotion
   - claim CONTRADICTED ("waterproof" vs the approved "water-resistant" fact)
   - delivery promise only partly covered by policy
   - Australia-wide claim subject to remote-area restrictions
5. Review the **Corrected campaign draft**. Click **Apply as new draft** to copy the grounded copy into the campaign and re-verify it.
6. Try **Approve**. It is refused while BLOCK findings remain. Once the campaign is at PASS or REVIEW (REVIEW needs a note), the approval is recorded in the audit log.
7. Test monitoring: open **Products → Ridgeline Rain Jacket**, choose **Sell out** on variant M, and apply. The simulated change runs a monitoring cycle. The live "Spring Rain Jacket – Instagram" campaign moves PASS → BLOCK, a CRITICAL notification appears on the Overview, and a corrected draft is prepared.

The demo dataset has 8 campaigns with deliberate problems: wrong price, invalid discount, expired offer, contradicted material claim, out-of-stock variant, archived product with a redirect to a different handle, unsafe age and battery claims, unconditional free shipping, backorder stock, and untracked inventory.

## Webhooks (live stores)

Subscribe your app to `products/create`, `products/update`, `products/delete` and `inventory_levels/update`, pointing at `https://<public-host>/api/webhooks/shopify`. During development, use a tunnel (cloudflared or ngrok).

- Signatures are verified with HMAC-SHA256 over the raw body, using a timing-safe comparison.
- Duplicate deliveries are acknowledged without reprocessing, keyed on `X-Shopify-Webhook-Id`.

## Production OAuth (external merchants)

The env-token approach is for a merchant's **own** store only. To onboard other merchants, distribute PromiSure AI as a Shopify app using the **authorization code grant**:

1. Create the app in the Shopify Dev Dashboard. Configure the redirect URL and request `read_products,read_inventory`.
2. `/auth/install?shop=` → redirect to `https://{shop}/admin/oauth/authorize` with a signed `state`.
3. On the callback, verify the HMAC, `state` and shop hostname. Exchange the code for an **offline** token and store it **encrypted**, per `MerchantStore`.
4. Register webhooks per shop. Also handle `app/uninstalled` and the mandatory customer-privacy topics.
5. Scope every query by `storeId` (the schema is already multi-tenant: every business record belongs to a `MerchantStore`), and add authentication with per-user store membership.

## Deployment

- **Single server or VM:** `npm run build && npx prisma migrate deploy && npm start`. In-process polling runs every `MONITOR_INTERVAL_MINUTES`.
- **Docker:** `docker build -t promisure . && docker run -p 3000:3000 --env-file .env -v promisure-data:/app/data promisure`. Set `DATABASE_URL=file:/app/data/prod.db` and run `npm run db:seed` once inside the container if you want demo data.
- **Serverless or multi-instance:** switch the datasource to PostgreSQL (`provider = "postgresql"`, then re-generate migrations). Set `MONITOR_INTERVAL_MINUTES=0` and call `POST /api/monitor/run` with `Authorization: Bearer $CRON_SECRET` from a scheduler.

## Known limitations

- **No user authentication yet.** The local MVP is single-user, and actions are attributed to `demo@promisure.local` in the audit log. Add auth (NextAuth or Shopify session tokens) before exposing it publicly.
- **Live Shopify sync is unproven.** It is implemented against the documented 2026-10 Admin GraphQL schema but has not been run against a real store in this build. Run **Test & connect** on the Shopify page to validate it with your credentials.
- **Sales-channel publication.** Beyond the Online Store (Google, Meta, TikTok channel publications) this is not yet checked. It needs `read_publications`.
- **Inventory webhooks.** `inventory_levels/update` triggers a full catalogue re-sync rather than a targeted variant update.
- **Claim rules are lexical.** They cover common contradiction pairs (waterproof, solid wood, leather, care instructions, BPA, pure materials), age ranges and measurements. Anything else is UNVERIFIABLE (REVIEW) unless an approved fact clearly matches, or the optional AI provider cites one.
- **Demo landing pages are simulated** against the local catalogue (and labelled as such). Live stores get real, SSRF-protected HTTP checks.
- **Outreach is manual by design.** There is no LinkedIn automation, scraping or sending.
- **The e2e suite writes to the configured database.** It resets the demo data (and deletes the test prospect it creates). Run it against a dev database only.
