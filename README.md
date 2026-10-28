# Solana Gem Radar: research and paper trading only
No wallets, keys, swaps or real-money trading. Scores are rule-based research aids, not predictions.

## Data sources and verification status (rechecked 2026-10-27)
| Source | Endpoint | Docs status |
|---|---|---|
| DexScreener | `/token-profiles/latest/v1`, `/token-boosts/latest/v1`, `/token-boosts/top/v1` (60 req/min each); `/tokens/v1/solana/{addrs}` (300 req/min, up to 30 addresses) | Limits and batch size confirmed on docs.dexscreener.com/api. Response schemas for profiles and Pair confirmed. No attribution requirement found; check their terms. Versioned by `/v1` path. |
| GeckoTerminal | `GET api.geckoterminal.com/api/v2/networks/solana/new_pools` | Exists (CoinGecko docs). **Rate limit conflict:** the current keyless page says ~10 calls/min shared per IP and "not suitable for scheduled polling"; the older GeckoTerminal guide says 30/min. We assume 10. Response shape (`data[].relationships.base_token.data.id`) not confirmed against an official schema. API is Beta; they recommend a version header (`GECKO_API_VERSION`, default value from memory, **unverified**). **Attribution requested:** a link to GeckoTerminal (shown in the dashboard footer text). |
| RugCheck | `GET api.rugcheck.xyz/v1/tokens/{mint}/report` | **UNVERIFIED.** No official docs reachable. Base URL and path are consistent across independent third-party wrappers, but they disagree on where `mintAuthority`/`freezeAuthority` live (top-level vs `token.*`). Code accepts either; absent in both = UNKNOWN (never PASS). Rate limit unknown. Validate with the probe below. |

## Environment variables (match `.env.example`)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `BASIC_AUTH_PASSWORD` (all required in production); optional `GECKO_MAX_PER_MIN`, `GECKO_API_VERSION`. Never use `NEXT_PUBLIC_` prefixes.

## Request budgets
Per scan: DexScreener max 60 requests (retries included, sequential); GeckoTerminal exactly 1 call, never retried (429 = source failed), plus an in-process rolling-minute cap. Caveat: the cap is per server instance; on Vercel's shared egress IPs other tenants can still exhaust the keyless pool, which will show up as a failed GeckoTerminal source. Risk checks stop after ~35 s to fit the 60 s function limit.

## Scan statuses
`success` (all sources OK) · `partial` (some source/check failed: dashboard shows an INCOMPLETE SCAN banner) · `failed` (no pairs) · `running`. A failed source is never shown as a clean scan.

## Deploy sequence
1. **Supabase:** new project > SQL editor > run in order: `supabase/migrations/001_init.sql`, `002_integrity.sql`, `003_diagnostics.sql`. Settings > API: copy URL and `service_role` key. RLS is on with no policies, so only the service-role key can read or write.
2. **GitHub + Vercel:** push repo, import in Vercel, add the four required env vars (Production), deploy. Changing env vars requires a redeploy.
3. `vercel.json` registers one daily cron (`/api/scan`, 06:00 UTC). Vercel sends `Authorization: Bearer $CRON_SECRET` automatically. Hobby = daily only. For hourly, use an external scheduler to `GET /api/scan` with that header. Hourly is not active by default.
4. Auth: every route except `/api/scan` requires HTTP Basic auth with password `BASIC_AUTH_PASSWORD` (any username). `/api/scan` requires the bearer secret. Without the password configured, production returns 401 everywhere.

## Smoke test (nothing below has been run against live services by the developer)
1. `curl -i https://<app>/api/scan` > **401**. `curl -i https://<app>/` > **401**.
2. `curl -u me:$PW "https://<app>/api/diagnostics?probe=1"` > JSON with `envConfigured` (all true), `probe.verified` (list of sources that returned HTTP 200 AND passed schema checks), `probe.rugcheck.topKeys` and `authorityAt` (`top-level` or `token.*`; `absent` means every token will show UNKNOWN and `lib/risk.ts` must be adjusted). Expected good result: `verified` contains `token-profiles/latest`, `geckoterminal/new_pools`, `rugcheck`.
3. Trigger a scan: `curl -i -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/scan`. **Expected success:** `{"ok":true,"status":"success"}`; dashboard Scan History shows `success`, Sources JSON shows numbers for 4 sources, Requests ≤ 60, Error empty. Wait 3+ minutes between scans (duplicate guard returns `{"ok":false,"error":"A scan started in the last 3 minutes..."}`).
4. **Expected failed-source behaviour:** if a source fails, e.g. GeckoTerminal 429: response `{"ok":false,"status":"partial"}`; dashboard shows the INCOMPLETE SCAN banner; Sources shows `"geckoterminal/new_pools":"error"`; Error column reads `GeckoTerminal HTTP 429 (rate limited; not retried)`; `/api/diagnostics` shows that request with `status:429`. If every source fails: status `failed`, no candidates stored.
5. Spot check one candidate's price, liquidity and age against its DexScreener link; open a paper trade, reload (persists), try a duplicate (rejected with message), close it, check balance.
6. Failed-request diagnosis: `/api/diagnostics` `lastScanBySource[source]` gives `status`, `ms`, `schemaOk`. `schemaOk:false` = vendor changed response shape; `status:429` = rate limited; `status:null` = network/timeout.

## Tests
`npm test`: 32 vitest tests, all with MOCKED fetch (parsing, schema errors, retries/429/timeouts, budgets, GeckoTerminal cap, RugCheck UNKNOWN states, scoring/hard exclusions, paper-trade math, auth fail-closed, diagnostics auth and secret redaction, stale detection, follow-up outcomes). Duplicate-scan/trade protection relies on DB unique indexes and is not unit-tested. Mocked tests are not live integration tests.

## Known limitations
Daily cron makes 1h/6h follow-ups mostly "Insufficient history". Stops and targets are evaluated at scan time only. No creator-wallet or LP-lock analysis. No settings UI (edit `strategy_settings.settings` JSON; see `lib/score.ts` DEFAULTS). Keyless GeckoTerminal is officially unsuited to scheduled polling; a free CoinGecko Demo key is the documented upgrade path (not implemented).
