alter table tokens add column if not exists last_seen timestamptz not null default now();
alter table token_snapshots add column if not exists source_kind text;
create unique index if not exists one_running_scan on scan_runs((true)) where status='running';
create unique index if not exists one_open_trade_per_mint on paper_trades(mint) where status='open';
