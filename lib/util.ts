export const isStale=(finished:string|null|undefined,now=Date.now(),maxH=26)=>!finished||now-new Date(finished).getTime()>maxH*36e5
export const HORIZONS:[string,number][]=[['1h',1],['6h',6],['24h',24],['7d',168]]
// Outcome = first recorded price observed in [t0+h, t0+1.5h(min +1h)] for the same mint. Earlier/later observations are never used.
export function outcomes(sigs:any[],obs:any[],now=Date.now()){
  return HORIZONS.map(([label,h])=>{
    const win=Math.max(h*0.5,1),vals:number[]=[];let eligible=0
    for(const s of sigs){ const t0=+new Date(s.observed_at); if(!s.price||now<t0+(h+win)*36e5) continue; eligible++
      const o=obs.filter(x=>x.mint===s.mint&&x.price>0&&+new Date(x.observed_at)>=t0+h*36e5&&+new Date(x.observed_at)<=t0+(h+win)*36e5).sort((a,b)=>+new Date(a.observed_at)-+new Date(b.observed_at))[0]
      if(o) vals.push((o.price/s.price-1)*100) }
    vals.sort((a,b)=>a-b)
    return {label,eligible,observed:vals.length,mean:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,median:vals.length?vals[Math.floor(vals.length/2)]:null}
  })
}
export const scanStatus=(errors:string[],rows:number)=>!rows?'failed':errors.length?'partial':'success'
