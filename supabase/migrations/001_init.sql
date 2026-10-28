create extension if not exists pgcrypto;
create table tokens(mint text primary key,symbol text,name text,first_seen timestamptz not null default now());
create table token_pairs(pair_address text primary key,mint text not null references tokens(mint),dex_id text,pair_created_at timestamptz,url text,first_seen timestamptz not null default now());
create index on token_pairs(mint);
create table scan_runs(id uuid primary key default gen_random_uuid(),trigger text,status text not null default 'running',started_at timestamptz not null default now(),finished_at timestamptz,discovered int,passed_filters int,passed_safety int,requests_used int,source_counts jsonb,error text);
create index on scan_runs(started_at desc);
create table token_snapshots(id bigserial primary key,scan_id uuid references scan_runs(id),mint text not null references tokens(mint),pair_address text,observed_at timestamptz not null default now(),source text,price numeric,liquidity_usd numeric,market_cap numeric,fdv numeric,vol_1h numeric,vol_24h numeric,buys_1h int,sells_1h int,chg_5m numeric,chg_1h numeric,chg_6h numeric,chg_24h numeric,pair_created_at timestamptz,score numeric,status text,safety text,evaluation jsonb,name text,symbol text,url text,is_synthetic boolean not null default false);
create index on token_snapshots(scan_id,score desc);create index on token_snapshots(mint,observed_at desc);
create table risk_checks(id bigserial primary key,mint text not null references tokens(mint),scan_id uuid references scan_runs(id),checked_at timestamptz not null default now(),provider text,status text,details jsonb);
create index on risk_checks(mint,checked_at desc);
create table watchlist(mint text primary key references tokens(mint),added_at timestamptz not null default now(),note text);
create table paper_trades(id uuid primary key default gen_random_uuid(),mint text not null references tokens(mint),symbol text,name text,opened_at timestamptz not null default now(),entry_price numeric not null,size_usd numeric not null,entry_cost_usd numeric not null,stop_loss_pct numeric not null,take_profit_pct numeric not null,max_hold_hours numeric not null,status text not null default 'open',exit_price numeric,exit_at timestamptz,exit_reason text,realized_pnl_usd numeric,mfe_pct numeric,mae_pct numeric,last_price numeric,last_checked timestamptz,entry_score numeric,entry_safety text,rationale text,entry_snapshot jsonb);
create index on paper_trades(status);
create table paper_trade_events(id bigserial primary key,trade_id uuid not null references paper_trades(id),at timestamptz not null default now(),type text,price numeric,note text);
create table strategy_settings(id int primary key check(id=1),settings jsonb not null,updated_at timestamptz default now());
insert into strategy_settings values(1,'{}'::jsonb);  -- empty = code defaults in lib/score.ts
-- RLS: enabled with NO policies => anon/public key can read nothing. Only the server-side service-role key (bypasses RLS) touches data.
alter table tokens enable row level security;alter table token_pairs enable row level security;alter table scan_runs enable row level security;alter table token_snapshots enable row level security;alter table risk_checks enable row level security;alter table watchlist enable row level security;alter table paper_trades enable row level security;alter table paper_trade_events enable row level security;alter table strategy_settings enable row level security;
