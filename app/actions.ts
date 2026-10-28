'use server'
import {revalidatePath} from 'next/cache'
import {headers} from 'next/headers'
import {db,getSettings} from '@/lib/db'
import {Budget,fetchPairs,MINT} from '@/lib/dex'
import {runScan} from '@/lib/scan'
import {authorized} from '@/lib/auth'
import {exitPnl,slipPct,FEE_PCT,balance} from '@/lib/trades'
type R={ok:boolean,msg:string}
const deny=()=>!authorized(headers().get('authorization'))
export async function scanNow(){ if(deny()) return; await runScan('manual');revalidatePath('/')}
export async function openTrade(_:R|null,fd:FormData):Promise<R>{
  if(deny()) return {ok:false,msg:'Unauthorized'}
  const mint=String(fd.get('mint')||'');if(!MINT.test(mint)) return {ok:false,msg:'Invalid mint'}
  try{
    const d=db(),s=await getSettings(),raw=fd.get('size'),size=raw?Number(raw):s.positionSize
    if(!isFinite(size)||size<=0||size>1000) return {ok:false,msg:'Invalid size'}
    const {data:all,error:e1}=await d.from('paper_trades').select('status,size_usd,entry_cost_usd,realized_pnl_usd,mint');if(e1) return {ok:false,msg:'DB error: '+e1.message}
    if(all!.some((t:any)=>t.mint===mint&&t.status==='open')) return {ok:false,msg:'A paper trade for this token is already open'}
    if(size>balance(s.startBalance,all!)) return {ok:false,msg:'Insufficient simulated balance'}
    const p=(await fetchPairs([mint],new Budget(5))).get(mint),price=Number(p?.priceUsd),liq=p?.liquidity?.usd??null
    if(!p||!isFinite(price)||price<=0) return {ok:false,msg:'Fresh price unavailable. Trade not opened'}
    if(!liq) return {ok:false,msg:'Liquidity unavailable. Cannot estimate slippage'}
    const {data:snap}=await d.from('token_snapshots').select('*').eq('mint',mint).neq('status','FOLLOWUP').order('observed_at',{ascending:false}).limit(1).maybeSingle()
    if(!snap||!['RESEARCH_CANDIDATE','ELEVATED_RISK'].includes(snap.status)) return {ok:false,msg:'Token is not a qualified candidate in the latest stored scan'}
    const cost=size*((slipPct(size,liq)??0)+FEE_PCT)/100
    const {data:t,error}=await d.from('paper_trades').insert({mint,symbol:snap.symbol,name:snap.name,entry_price:price,size_usd:size,entry_cost_usd:cost,stop_loss_pct:s.stopLossPct,take_profit_pct:s.takeProfitPct,max_hold_hours:s.maxHoldHours,entry_score:snap.score,entry_safety:snap.safety,rationale:(snap.evaluation?.reasons||[]).join(' '),entry_snapshot:{fresh_pair:{price,liquidity:liq,volume:p.volume,txns:p.txns,priceChange:p.priceChange,marketCap:p.marketCap,fdv:p.fdv},scan_snapshot_id:snap.id}}).select('id').single()
    if(error) return {ok:false,msg:error.code==='23505'?'A paper trade for this token is already open':'DB error: '+error.message}
    await d.from('paper_trade_events').insert({trade_id:t.id,type:'entry',price,note:`size $${size}, est. entry cost $${cost.toFixed(2)}`})
    revalidatePath('/');return {ok:true,msg:`Opened at $${price}`}
  }catch(e:any){return {ok:false,msg:'Error: '+e.message}}
}
export async function closeTrade(_:R|null,fd:FormData):Promise<R>{
  if(deny()) return {ok:false,msg:'Unauthorized'}
  try{
    const d=db(),id=String(fd.get('id')||''),{data:t}=await d.from('paper_trades').select('*').eq('id',id).eq('status','open').maybeSingle()
    if(!t) return {ok:false,msg:'Trade not open'}
    const p=(await fetchPairs([t.mint],new Budget(5))).get(t.mint),cur=Number(p?.priceUsd)
    if(!p||!isFinite(cur)||cur<=0) return {ok:false,msg:'Price unavailable. Cannot exit now'}
    const {data:u}=await d.from('paper_trades').update({status:'closed',exit_price:cur,exit_at:new Date().toISOString(),exit_reason:'manual',last_price:cur,realized_pnl_usd:exitPnl(t,cur,p.liquidity?.usd??t.entry_snapshot?.fresh_pair?.liquidity??null).realized}).eq('id',id).eq('status','open').select('id')
    if(!u?.length) return {ok:false,msg:'Trade was already closed'}
    await d.from('paper_trade_events').insert({trade_id:id,type:'exit',price:cur,note:'manual paper exit'});revalidatePath('/');return {ok:true,msg:'Closed'}
  }catch(e:any){return {ok:false,msg:'Error: '+e.message}}
}
