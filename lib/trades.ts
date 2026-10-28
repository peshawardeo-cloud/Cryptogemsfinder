import {db} from './db'
import {Budget,fetchPairs} from './dex'
export const FEE_PCT=0.3
export const slipPct=(size:number,liq:number|null)=>liq?Math.min(50,size/liq*100):null
export const SLIP_FALLBACK=5 // conservative % when liquidity is unknown
export function exitPnl(t:any,cur:number,liq:number|null){const gross=t.size_usd*(cur/t.entry_price);const cost=gross*(((slipPct(t.size_usd,liq)??SLIP_FALLBACK)+FEE_PCT)/100);return {realized:gross-t.size_usd-t.entry_cost_usd-cost}}
// free = start + realized(closed, already net of all costs) - capital committed in open trades - their entry costs
export const balance=(start:number,trades:any[])=>start+trades.reduce((a,t)=>a+(t.status==='closed'?(t.realized_pnl_usd||0):-(t.size_usd+t.entry_cost_usd)),0)
// Exits fill at the price OBSERVED at scan time, not the trigger price. MFE/MAE only reflect scan-time observations.
export async function markTrades(b:Budget){
  const d=db(),{data:open}=await d.from('paper_trades').select('*').eq('status','open');if(!open?.length) return 0
  const pairs=await fetchPairs([...new Set(open.map((t:any)=>t.mint))] as string[],b),now=new Date().toISOString()
  for(const t of open){
    const p=pairs.get(t.mint),cur=p?Number(p.priceUsd):NaN
    if(!p||!isFinite(cur)||cur<=0){await d.from('paper_trades').update({last_checked:now,last_price:null}).eq('id',t.id).eq('status','open');continue}
    const pct=(cur/t.entry_price-1)*100,held=(Date.now()-new Date(t.opened_at).getTime())/3.6e6
    const reason=pct<=-t.stop_loss_pct?'stop_loss':pct>=t.take_profit_pct?'take_profit':held>=t.max_hold_hours?'max_hold':null
    const u:any={last_price:cur,last_checked:now,mfe_pct:Math.max(t.mfe_pct??0,pct),mae_pct:Math.min(t.mae_pct??0,pct)}
    const liq=p.liquidity?.usd??t.entry_snapshot?.fresh_pair?.liquidity??null
    if(reason) Object.assign(u,{status:'closed',exit_price:cur,exit_at:now,exit_reason:reason,realized_pnl_usd:exitPnl(t,cur,liq).realized})
    const {data:upd}=await d.from('paper_trades').update(u).eq('id',t.id).eq('status','open').select('id')
    if(reason&&upd?.length) await d.from('paper_trade_events').insert({trade_id:t.id,type:'exit',price:cur,note:reason+': filled at price observed this scan, not the trigger price'})
  }
  return open.length
}
