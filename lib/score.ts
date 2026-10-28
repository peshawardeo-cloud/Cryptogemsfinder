import type {Risk} from './risk'
export const DEFAULTS={minLiquidity:20000,minVol1h:5000,minAgeMin:30,maxAgeMin:1440,minMcap:1e5,maxMcap:2e6,minTx1h:10,minScore:60,maxRequests:60,maxRiskChecks:15,relaxed:false,startBalance:50,positionSize:10,stopLossPct:30,takeProfitPct:100,maxHoldHours:48,
  w:{liq:25,act:20,growth:20,age:10,holders:15,quality:10}}
const cap=(x:number)=>Math.max(0,Math.min(1,x)),ramp=(v:number,lo:number,hi:number)=>cap((v-lo)/(hi-lo))
const n=(x:any)=>{const v=typeof x==='string'?Number(x):x;return typeof v==='number'&&isFinite(v)?v:null}
const usd=(v:number)=>'$'+Math.round(v).toLocaleString('en-US')
export function evaluate(p:any,risk:Risk|null,s:typeof DEFAULTS=DEFAULTS){
  const liq=n(p.liquidity?.usd),v1=n(p.volume?.h1),v24=n(p.volume?.h24),b1=n(p.txns?.h1?.buys),s1=n(p.txns?.h1?.sells),c1=n(p.priceChange?.h1),mc=n(p.marketCap),price=n(p.priceUsd)
  const age=p.pairCreatedAt?(Date.now()-p.pairCreatedAt)/60000:null
  const hard:string[]=[],soft:string[]=[],reasons:string[]=[],warnings:string[]=[],missing:string[]=[]
  const miss=[price==null&&'price',liq==null&&'liquidity',age==null&&'pair creation time'].filter(Boolean)
  if(miss.length) hard.push('Missing critical data: '+miss.join(', '))
  if(risk?.status==='FAIL') hard.push(...risk.fails)
  if(liq!=null&&liq<s.minLiquidity) soft.push(`Liquidity ${usd(liq)} < ${usd(s.minLiquidity)}`)
  if(v1==null||v1<s.minVol1h) soft.push(v1==null?'1h volume N/A':`1h volume ${usd(v1)} < ${usd(s.minVol1h)}`)
  if(age!=null&&(age<s.minAgeMin||age>s.maxAgeMin)) soft.push(`Pair age ${(age/60).toFixed(1)}h outside preferred window`)
  if(mc==null) soft.push('Market cap N/A (FDV shown separately, not substituted)'); else if(mc<s.minMcap||mc>s.maxMcap) soft.push(`Market cap ${usd(mc)} outside range`)
  if(b1==null||s1==null||b1+s1<s.minTx1h) soft.push('1h transaction count below minimum or N/A')
  const B:any={},w=s.w
  B.liquidity={max:w.liq,pts:liq==null?0:w.liq*ramp(liq,s.minLiquidity,s.minLiquidity*5),why:liq==null?'Liquidity N/A':`Liquidity ${usd(liq)}`}
  const tx=b1==null||s1==null?0:ramp(Math.min(b1,s1),0,s.minTx1h*2)
  B.activity={max:w.act,pts:w.act*(0.6*(v1==null?0:ramp(v1,s.minVol1h,s.minVol1h*10))+0.4*tx),why:`1h volume ${v1==null?'N/A':usd(v1)}; buys ${b1??'N/A'} / sells ${s1??'N/A'}`}
  const pace=v1!=null&&v24!=null&&v24>0?v1/(v24/24):null
  let g=(pace==null?0:0.6*ramp(pace,1,4))+(c1==null?0:c1>300?0:0.4*ramp(c1,0,50))
  if(c1!=null&&c1>300) warnings.push(`1h price change +${c1.toFixed(0)}%: possible extended/chased move`)
  B.growth={max:w.growth,pts:w.growth*g,why:`Volume pace vs 24h avg: ${pace==null?'N/A':pace.toFixed(1)+'x'}; 1h price change ${c1==null?'N/A':c1.toFixed(1)+'%'}`}
  const ag=age==null?0:age<s.minAgeMin?0:age<=s.maxAgeMin?1:0.3
  B.age={max:w.age,pts:w.age*ag,why:age==null?'Age N/A':`Pair age ${(age/60).toFixed(1)}h`}
  const th=risk?.topHolderPct
  B.holders={max:w.holders,pts:th==null?0:w.holders*0.8*(1-ramp(th,30,70)),why:th==null?'Holder data not available. Creator-wallet analysis not implemented':`Top-10 holders ~${th.toFixed(0)}%; creator-wallet analysis not implemented`}
  const web=(p.info?.websites?.length||0)+(p.info?.socials?.length||0)>0
  B.quality={max:w.quality,pts:(web?3:0)+(mc!=null?2:0)+(age!=null?2:0)+(risk&&risk.status!=='UNKNOWN'?3:0),why:`Links ${web?'present':'absent'}; mcap ${mc!=null?'present':'N/A'}; risk check ${risk?risk.status:'not run'} (boosts/trending never scored)`}
  let score=0;for(const k in B){B[k].pts=Math.round(B[k].pts*10)/10;score+=B[k].pts}
  score=Math.round(score*10)/10
  if(age!=null) reasons.push(`Pair created ${age<120?Math.round(age)+' minutes':(age/60).toFixed(1)+' hours'} ago.`)
  if(liq!=null) reasons.push(`Liquidity is ${usd(liq)}.`)
  if(b1!=null&&s1!=null) reasons.push(b1>0&&s1>0?`Both buys (${b1}) and sells (${s1}) visible in the last hour.`:`One-sided 1h flow: ${b1} buys / ${s1} sells.`)
  if(pace!=null) reasons.push(`1h volume pace is ${pace.toFixed(1)}x the 24h average.`)
  if(!risk) missing.push('Safety check not run'); else if(risk.status==='UNKNOWN') missing.push('Safety check inconclusive: '+risk.warns.join('; '))
  else reasons.push(risk.status==='PASS'?'No critical flags in the checks completed (not proof of safety).':'Risk warnings present.')
  if(th==null) missing.push('Holder concentration incomplete'); missing.push('Liquidity lock/creator-wallet analysis not performed')
  if(risk) warnings.push(...risk.warns)
  warnings.push(...soft.map(x=>'Soft filter: '+x))
  const status=hard.length?'REJECTED':soft.length===0&&risk&&risk.status!=='UNKNOWN'?(risk.status==='WARNING'?'ELEVATED_RISK':score>=s.minScore?'RESEARCH_CANDIDATE':'WATCHLIST'):'WATCHLIST'
  return {score,status,safety:risk?.status??'NOT_CHECKED',hard,soft,breakdown:B,reasons,warnings,missing,
    failModes:['Liquidity can be withdrawn or thin out','Volume may be wash/promotional rather than organic','Early tokens frequently lose most value'],
    invalidators:[`Liquidity falls below ${usd(s.minLiquidity)}`,'Sell flow disappears or one-sided selling dominates','New authority/holder-concentration red flag appears']}
}
