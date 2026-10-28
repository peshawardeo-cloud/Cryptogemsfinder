import {db,getSettings} from './db'
import {Budget,discover,fetchPairs,geckoNew,sourceKind} from './dex'
import {evaluate} from './score'
import {rugcheck} from './risk'
import {markTrades} from './trades'
import {scanStatus} from './util'
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const must=(r:any,w:string)=>{if(r?.error) throw new Error(`${w}: ${r.error.message}`);return r}
const num=(x:any)=>{const v=Number(x);return x==null||!isFinite(v)?null:v}
const iso=(t:any)=>t?new Date(t).toISOString():null
export async function runScan(trigger:string){
  const d=db(),s=await getSettings()
  await d.from('scan_runs').update({status:'failed',error:'timed out / abandoned',finished_at:new Date().toISOString()}).eq('status','running').lt('started_at',new Date(Date.now()-10*60000).toISOString())
  const {data:recent}=await d.from('scan_runs').select('id').gte('started_at',new Date(Date.now()-3*60000).toISOString()).limit(1)
  if(recent?.length) return {ok:false,error:'A scan started in the last 3 minutes (duplicate protection).'}
  const {data:run,error:e0}=await d.from('scan_runs').insert({trigger}).select('id').single()
  if(e0) return {ok:false,error:e0.code==='23505'?'A scan is already running.':e0.message}
  const bud=new Budget(s.maxRequests),t0=Date.now()
  try{
    const {found,counts,errors}=await discover(bud)
    const g=await geckoNew(bud);counts['geckoterminal/new_pools']=g.error?'error':g.mints.length;if(g.error) errors.push(g.error)
    for(const m of g.mints) found.set(m,found.has(m)?'geckoterminal/new_pools+'+found.get(m):'geckoterminal/new_pools')
    const pairs=await fetchPairs([...found.keys()],bud)
    const rows:any[]=[...pairs].map(([mint,p])=>({mint,p,source:found.get(mint),risk:null,ev:evaluate(p,null,s)}))
    rows.sort((x,y)=>y.ev.score-x.ev.score)
    let checked=0
    for(const r of rows){ if(checked>=s.maxRiskChecks||Date.now()-t0>35000) break
      if(r.ev.hard.length||(!s.relaxed&&r.ev.soft.length>0)) continue
      checked++;r.risk=await rugcheck(r.mint,bud.log);r.ev=evaluate(r.p,r.risk,s);await sleep(400)}
    const unk=rows.filter(r=>r.risk?.status==='UNKNOWN').length
    if(checked>0&&unk===checked) errors.push(`RugCheck returned UNKNOWN for all ${checked} checks`)
    if(rows.some(r=>!r.risk&&!r.ev.hard.length&&!r.ev.soft.length)) errors.push('Some qualified-by-filter tokens were not safety-checked (check limit or time limit)')
    const now=new Date().toISOString()
    if(rows.length){
      must(await d.from('tokens').upsert(rows.map(r=>({mint:r.mint,symbol:r.p.baseToken?.symbol,name:r.p.baseToken?.name,last_seen:now})),{onConflict:'mint'}),'tokens')
      must(await d.from('token_pairs').upsert(rows.map(r=>({pair_address:r.p.pairAddress,mint:r.mint,dex_id:r.p.dexId,url:r.p.url,pair_created_at:iso(r.p.pairCreatedAt)})),{onConflict:'pair_address',ignoreDuplicates:true}),'token_pairs')
      must(await d.from('token_snapshots').insert(rows.map(r=>({scan_id:run.id,mint:r.mint,pair_address:r.p.pairAddress,source:r.source,source_kind:sourceKind(r.source),observed_at:now,price:num(r.p.priceUsd),liquidity_usd:num(r.p.liquidity?.usd),market_cap:num(r.p.marketCap),fdv:num(r.p.fdv),vol_1h:num(r.p.volume?.h1),vol_24h:num(r.p.volume?.h24),buys_1h:num(r.p.txns?.h1?.buys),sells_1h:num(r.p.txns?.h1?.sells),chg_5m:num(r.p.priceChange?.m5),chg_1h:num(r.p.priceChange?.h1),chg_6h:num(r.p.priceChange?.h6),chg_24h:num(r.p.priceChange?.h24),pair_created_at:iso(r.p.pairCreatedAt),score:r.ev.score,status:r.ev.status,safety:r.ev.safety,evaluation:{...r.ev,sourceKind:sourceKind(r.source)},name:r.p.baseToken?.name,symbol:r.p.baseToken?.symbol,url:r.p.url}))),'token_snapshots')
      const rc=rows.filter(r=>r.risk)
      if(rc.length) must(await d.from('risk_checks').insert(rc.map(r=>({mint:r.mint,scan_id:run.id,provider:'rugcheck',status:r.risk.status,details:r.risk}))),'risk_checks')
    }
    // Follow-up observations: re-price tokens flagged in the last 7d even if they left the discovery feeds (limits survivorship bias). Missing => no row, never fabricated.
    try{
      const {data:prev}=await d.from('token_snapshots').select('mint').in('status',['RESEARCH_CANDIDATE','ELEVATED_RISK','WATCHLIST']).gte('observed_at',new Date(Date.now()-7*864e5).toISOString()).limit(500)
      const fm=[...new Set((prev||[]).map((x:any)=>x.mint))].filter(m=>!pairs.has(m)).slice(0,60) as string[]
      const fp=fm.length?await fetchPairs(fm,bud):new Map()
      if(fp.size) must(await d.from('token_snapshots').insert([...fp].map(([mint,p]:any)=>({scan_id:run.id,mint,pair_address:p.pairAddress,source:'followup',observed_at:now,price:num(p.priceUsd),liquidity_usd:num(p.liquidity?.usd),market_cap:num(p.marketCap),fdv:num(p.fdv),vol_1h:num(p.volume?.h1),vol_24h:num(p.volume?.h24),status:'FOLLOWUP',safety:'NOT_CHECKED',name:p.baseToken?.name,symbol:p.baseToken?.symbol,url:p.url}))),'followups')
    }catch(e:any){errors.push('followup: '+e.message)}
    await markTrades(bud)
    const okF=rows.filter(r=>!r.ev.hard.length&&!r.ev.soft.length)
    await d.from('scan_runs').update({status:scanStatus(errors,rows.length),diagnostics:bud.log.slice(-80),finished_at:new Date().toISOString(),discovered:rows.length,passed_filters:okF.length,passed_safety:okF.filter(r=>r.risk?.status==='PASS').length,requests_used:bud.used,source_counts:counts,error:errors.join(' | ')||(rows.length?null:'No pairs returned')}).eq('id',run.id)
    return {ok:rows.length>0&&!errors.length,status:scanStatus(errors,rows.length)}
  }catch(e:any){
    await d.from('scan_runs').update({status:'failed',finished_at:new Date().toISOString(),requests_used:bud.used,error:e.message,diagnostics:bud.log.slice(-80)}).eq('id',run.id)
    return {ok:false,error:e.message}
  }
}
