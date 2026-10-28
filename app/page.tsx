import {db,dbReady,getSettings} from '@/lib/db'
import {scanNow,openTrade,closeTrade} from './actions'
import TradeForm from '@/components/TradeForm'
import {isStale,outcomes} from '@/lib/util'
import {balance} from '@/lib/trades'
import Copy from '@/components/Copy'
export const dynamic='force-dynamic'
const na=(v:any,f:(x:number)=>string=x=>String(x))=>v==null?'N/A':f(Number(v))
const usd=(v:any)=>na(v,x=>'$'+(Math.abs(x)<1?x.toPrecision(3):Math.round(x).toLocaleString('en-US')))
const pct=(v:any)=>na(v,x=>x.toFixed(1)+'%')
const ageS=(t:any)=>t?((Date.now()-new Date(t).getTime())/36e5).toFixed(1)+'h':'N/A'
const badge:any={RESEARCH_CANDIDATE:'text-sky-300',ELEVATED_RISK:'text-amber-300',WATCHLIST:'text-slate-300',REJECTED:'text-rose-400',PASS:'text-sky-300',WARNING:'text-amber-300',FAIL:'text-rose-400',UNKNOWN:'text-slate-400',NOT_CHECKED:'text-slate-400'}
function Card({k,v}:{k:string,v:any}){return <div className="rounded-lg bg-slate-900 p-3"><div className="text-xs text-slate-400">{k}</div><div className="text-lg">{v}</div></div>}
function Sec({t,children}:{t:string,children:any}){return <section className="mt-8"><h2 className="mb-2 text-lg font-medium">{t}</h2><div className="overflow-x-auto rounded-lg bg-slate-900">{children}</div></section>}
function Cands({rows,trade}:{rows:any[],trade:boolean}){
  if(!rows.length) return <p className="p-3 text-sm text-slate-400">None in the latest scan.</p>
  return <table className="w-full text-sm"><thead><tr>{['Token','Mint','Age','Price','Liq','Mcap','FDV','5m','1h','6h','24h','Vol 1h','Vol 24h','B/S 1h','Score','Safety','Status','Source','Seen','Details',''].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
  {rows.map(r=>{const e=r.evaluation||{};return <tr key={r.id}>
    <td>{r.name} <span className="text-slate-400">{r.symbol}</span></td><td className="font-mono text-xs">{r.mint.slice(0,6)}…{r.mint.slice(-4)}<Copy v={r.mint}/></td>
    <td>{ageS(r.pair_created_at)}</td><td>{usd(r.price)}</td><td>{usd(r.liquidity_usd)}</td><td>{usd(r.market_cap)}</td><td>{usd(r.fdv)}</td>
    <td>{pct(r.chg_5m)}</td><td>{pct(r.chg_1h)}</td><td>{pct(r.chg_6h)}</td><td>{pct(r.chg_24h)}</td><td>{usd(r.vol_1h)}</td><td>{usd(r.vol_24h)}</td>
    <td>{na(r.buys_1h)}/{na(r.sells_1h)}</td><td>{r.score}</td><td className={badge[r.safety]}>{r.safety}</td><td className={badge[r.status]}>{r.status.replace('_',' ')}</td>
    <td>{r.source}</td><td>{new Date(r.observed_at).toLocaleString()}</td>
    <td className="whitespace-normal min-w-[260px]"><details><summary className="cursor-pointer text-sky-400">why / risks</summary><div className="mt-1 text-xs space-y-1">
      <b>Why it is listed</b><ul className="list-disc pl-4">{(e.reasons||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>
      <b>Score</b><ul className="list-disc pl-4">{Object.entries(e.breakdown||{}).map(([k,v]:any)=><li key={k}>{k}: {v.pts}/{v.max}. {v.why}</li>)}</ul>
      {!!e.hard?.length&&<><b>Hard failures</b><ul className="list-disc pl-4">{e.hard.map((x:string)=><li key={x}>{x}</li>)}</ul></>}
      <b>Warnings</b><ul className="list-disc pl-4">{(e.warnings||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>
      <b>Incomplete</b><ul className="list-disc pl-4">{(e.missing||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>
      <b>Could fail because</b><ul className="list-disc pl-4">{(e.failModes||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>
      <b>Thesis invalid if</b><ul className="list-disc pl-4">{(e.invalidators||[]).map((x:string)=><li key={x}>{x}</li>)}</ul>
      <a className="text-sky-400" href={r.url} target="_blank" rel="noreferrer">DexScreener chart ↗</a></div></details></td>
    <td>{trade&&['RESEARCH_CANDIDATE','ELEVATED_RISK'].includes(r.status)&&<TradeForm action={openTrade} field="mint" value={r.mint} label="Paper trade"/>}</td></tr>})}
  </tbody></table>
}
export default async function Page(){
  if(!dbReady()) return <main className="p-6">Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see README), then run the migration.</main>
  const d=db(),s=await getSettings()
  const {data:runs}=await d.from('scan_runs').select('*').order('started_at',{ascending:false}).limit(10)
  const last=runs?.find((r:any)=>['success','partial'].includes(r.status))
  const {data:snaps}=last?await d.from('token_snapshots').select('*').eq('scan_id',last.id).order('score',{ascending:false}):{data:[]}
  const {data:trades}=await d.from('paper_trades').select('*').order('opened_at',{ascending:false})
  const S=snaps||[],T=trades||[],open=T.filter((t:any)=>t.status==='open'),closed=T.filter((t:any)=>t.status==='closed')
  const realized=closed.reduce((a:number,t:any)=>a+(t.realized_pnl_usd||0),0)
  const unreal=(t:any)=>t.last_price==null?null:t.size_usd*(t.last_price/t.entry_price-1)
  const unrealSum=open.reduce((a:number,t:any)=>a+(unreal(t)||0),0)
  const stale=isStale(last?.finished_at),latest=runs?.[0]
  const {data:hist}=await d.from('token_snapshots').select('mint,observed_at,price,status').gte('observed_at',new Date(Date.now()-8*864e5).toISOString()).limit(5000)
  const H=hist||[],grp:[string,string[]][]=[['Research candidates / elevated risk',['RESEARCH_CANDIDATE','ELEVATED_RISK']],['Watchlist',['WATCHLIST']],['Rejected',['REJECTED']]]
  const wins=closed.filter((t:any)=>t.realized_pnl_usd>0),losses=closed.filter((t:any)=>t.realized_pnl_usd<=0)
  const avg=(a:any[],f:(t:any)=>number)=>a.length?a.reduce((x,t)=>x+f(t),0)/a.length:null
  let eq=0,peak=0,dd=0;for(const t of [...closed].sort((a:any,b:any)=>+new Date(a.exit_at)-+new Date(b.exit_at))){eq+=t.realized_pnl_usd;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  const bands=[[0,50],[50,60],[60,70],[70,101]].map(([lo,hi])=>{const x=closed.filter((t:any)=>t.entry_score>=lo&&t.entry_score<hi);return {l:`${lo}-${Math.min(hi,100)}`,n:x.length,pnl:x.reduce((a:number,t:any)=>a+t.realized_pnl_usd,0)}})
  return <main className="mx-auto max-w-[1400px] p-4">
    <header className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">Solana Gem Radar <span className="text-sm font-normal text-slate-400">research &amp; paper trading only</span></h1>
      <form action={scanNow}><button className="rounded bg-sky-700 px-3 py-1.5">Scan now</button></form></header>
    <p className="mt-2 text-xs text-slate-400">Not financial advice. Scores are rule-based research aids, not predictions. Third-party risk checks do not guarantee safety. Discovery uses DexScreener profile/boost feeds only: it is <b>not</b> an exhaustive list of new Solana tokens. No wallet, keys or real trades. Market data: DexScreener; new-pool data powered by <a className="text-sky-400" href="https://www.geckoterminal.com" target="_blank" rel="noreferrer">GeckoTerminal</a>; safety data: RugCheck (unverified integration). <a className="text-sky-400" href="/api/diagnostics">Diagnostics</a>.</p>
    {latest&&latest.status!=='success'&&<p className="mt-2 rounded bg-rose-900/40 p-2 text-sm text-rose-200">{latest.status==='partial'?'INCOMPLETE SCAN (a source or check failed; the candidate list may be missing tokens)':'Latest scan '+latest.status}: {latest.error||'in progress'}</p>}
    {last?.error&&last.id!==latest?.id&&<p className="mt-2 text-xs text-amber-200">Last successful scan had source errors, so the discovery sample is incomplete: {last.error}</p>}
    {stale&&<p className="mt-2 rounded bg-amber-900/40 p-2 text-sm text-amber-200">Data is stale or no successful scan exists yet.</p>}
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
      <Card k="Latest successful scan" v={last?new Date(last.finished_at).toLocaleString():'N/A'}/><Card k="Discovered" v={na(last?.discovered)}/><Card k="Passed filters" v={na(last?.passed_filters)}/>
      <Card k="Passed safety (PASS)" v={na(last?.passed_safety)}/><Card k="Active paper trades" v={open.length}/><Card k="Paper P/L (realized + unrealized)" v={usd(realized+unrealSum-open.reduce((a:number,t:any)=>a+t.entry_cost_usd,0))}/></div>
    <p className="mt-1 text-xs text-slate-400">Paper balance: {usd(balance(s.startBalance,T))} free of {usd(s.startBalance)} start. Rows below are the stored snapshot from the last scan, not live prices.</p>
    <Sec t="Today's Research Candidates"><Cands trade rows={S.filter((r:any)=>['RESEARCH_CANDIDATE','ELEVATED_RISK'].includes(r.status))}/></Sec>
    {s.relaxed&&<Sec t="Watchlist / soft-filter failures (relaxed mode)"><Cands trade={false} rows={S.filter((r:any)=>r.status==='WATCHLIST')}/></Sec>}
    <Sec t="Rejected / High-Risk"><Cands trade={false} rows={S.filter((r:any)=>r.status==='REJECTED')}/></Sec>
    <Sec t="Active Paper Trades">{!open.length?<p className="p-3 text-sm text-slate-400">None.</p>:<table className="w-full text-sm"><thead><tr>{['Token','Opened','Entry','Last','Size','Unrealized (pre-exit costs)','MFE','MAE','Stop/TP/Max hold',''].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{open.map((t:any)=><tr key={t.id}><td>{t.symbol}</td><td>{new Date(t.opened_at).toLocaleString()}</td><td>{usd(t.entry_price)}</td><td>{t.last_price==null?'Price unavailable':usd(t.last_price)}</td><td>{usd(t.size_usd)}</td><td>{usd(unreal(t))}</td><td>{pct(t.mfe_pct)}</td><td>{pct(t.mae_pct)}</td><td>-{t.stop_loss_pct}% / +{t.take_profit_pct}% / {t.max_hold_hours}h</td><td><TradeForm action={closeTrade} field="id" value={t.id} label="Paper exit"/></td></tr>)}</tbody></table>}</Sec>
    <Sec t="Completed Paper Trades">{!closed.length?<p className="p-3 text-sm text-slate-400">None.</p>:<table className="w-full text-sm"><thead><tr>{['Token','Opened','Closed','Entry','Exit','Size','Net P/L (after est. costs)','Reason','Score','Safety at entry'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{closed.map((t:any)=><tr key={t.id}><td>{t.symbol}</td><td>{new Date(t.opened_at).toLocaleString()}</td><td>{new Date(t.exit_at).toLocaleString()}</td><td>{usd(t.entry_price)}</td><td>{usd(t.exit_price)}</td><td>{usd(t.size_usd)}</td><td>{usd(t.realized_pnl_usd)}</td><td>{t.exit_reason}</td><td>{t.entry_score}</td><td>{t.entry_safety}</td></tr>)}</tbody></table>}</Sec>
    <Sec t="Strategy Performance (recorded paper trades only)">{closed.length<1?<p className="p-3 text-sm text-slate-400">Insufficient history.</p>:<div className="grid grid-cols-2 gap-3 p-3 text-sm md:grid-cols-4">
      <Card k="Trades (closed)" v={closed.length}/><Card k="Win rate" v={pct(wins.length/closed.length*100)}/><Card k="Avg win / avg loss" v={`${usd(avg(wins,t=>t.realized_pnl_usd))} / ${usd(avg(losses,t=>t.realized_pnl_usd))}`}/><Card k="Net P/L" v={usd(realized)}/>
      <Card k="Max drawdown (realized)" v={usd(dd)}/><Card k="Avg hold" v={na(avg(closed,t=>(+new Date(t.exit_at)-+new Date(t.opened_at))/36e5),x=>x.toFixed(1)+'h')}/>
      <div className="col-span-2 md:col-span-2">By score band: {bands.map(b=>`${b.l}: ${b.n} trades, ${usd(b.pnl)}`).join(' · ')}</div></div>}
      <p className="p-3 pt-0 text-xs text-slate-400">Not yet built: per-source / per-age breakdowns, 1h/6h/24h/7d candidate follow-ups, rejected-candidate comparison. Stored snapshots are kept so these can be computed later.</p></Sec>
    <Sec t="Follow-up outcomes (recorded observations only, first observation in [h, 1.5h])">{grp.map(([n,st])=><div key={n} className="p-3 text-sm"><b>{n}</b>: {outcomes(H.filter((x:any)=>st.includes(x.status)),H.filter((x:any)=>x.price>0)).map(o=>o.eligible===0?`${o.label}: Insufficient history`:`${o.label}: ${o.observed}/${o.eligible} observed, median ${o.median==null?'N/A':o.median.toFixed(1)+'%'}`).join(' · ')}</div>)}<p className="p-3 pt-0 text-xs text-slate-400">Unobserved tokens (no later price) are counted in the denominator, not dropped. Daily scans only populate 24h/7d meaningfully.</p></Sec>
    <Sec t="Scan History"><table className="w-full text-sm"><thead><tr>{['Started','Trigger','Status','Discovered','Requests','Sources','Error'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{(runs||[]).map((r:any)=><tr key={r.id}><td>{new Date(r.started_at).toLocaleString()}</td><td>{r.trigger}</td><td>{r.status}</td><td>{na(r.discovered)}</td><td>{na(r.requests_used)}</td><td>{JSON.stringify(r.source_counts)}</td><td className="whitespace-normal">{r.error}</td></tr>)}</tbody></table></Sec>
  </main>
}
