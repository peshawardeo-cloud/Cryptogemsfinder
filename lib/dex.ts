const BASE='https://api.dexscreener.com'
export const MINT=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/
export class Budget{used=0;log:any[]=[];constructor(public max:number){}}
const BACK=()=>Number(process.env.DEX_BACKOFF_MS??1000)
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
const EXCL=new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB','USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA'])
export const validFeed=(d:any)=>Array.isArray(d)&&d.every(x=>x&&typeof x.tokenAddress==='string'&&typeof x.chainId==='string')
export const validPairs=(d:any)=>Array.isArray(d)&&d.every(p=>p&&typeof p.chainId==='string'&&p.baseToken&&typeof p.baseToken.address==='string')
const note=(b:Budget|null,e:any)=>{b?.log.push({at:new Date().toISOString(),...e})}
// Every attempt (including retries) consumes budget. Sequential only. Logs source label, status, ms, schemaOk. Never logs URLs with params/headers.
export async function dget(path:string,b:Budget,validate?:(d:any)=>boolean,label=path.split('/').slice(1,3).join('/')):Promise<any>{
  for(let i=0;i<4;i++){
    if(b.used>=b.max) throw new Error('Request budget exhausted')
    b.used++;const t=Date.now()
    try{
      const r=await fetch(BASE+path,{signal:AbortSignal.timeout(8000),cache:'no-store'})
      if(r.status===429||r.status>=500){note(b,{source:label,status:r.status,ms:Date.now()-t,schemaOk:null,error:'retryable'});await sleep(BACK()*2**i);continue}
      if(!r.ok){note(b,{source:label,status:r.status,ms:Date.now()-t,schemaOk:null,error:'http'});throw new Error(`DexScreener HTTP ${r.status} (${label})`)}
      const j=await r.json(),ok=validate?validate(j):true
      note(b,{source:label,status:r.status,ms:Date.now()-t,schemaOk:ok})
      if(!ok) throw new Error(`DexScreener unexpected response schema (${label})`)
      return j
    }catch(e:any){ if(String(e.message).startsWith('DexScreener')) throw e
      note(b,{source:label,status:null,ms:Date.now()-t,schemaOk:null,error:String(e.message).slice(0,120)}); if(i===3) throw new Error(`DexScreener request failed (${label}): ${String(e.message).slice(0,80)}`); await sleep(BACK()*2**i) }
  }
  throw new Error(`DexScreener unavailable after retries (${label})`)
}
export async function discover(b:Budget){
  const sources:[string,string][]=[['token-profiles/latest','/token-profiles/latest/v1'],['token-boosts/latest','/token-boosts/latest/v1'],['token-boosts/top','/token-boosts/top/v1']]
  const found=new Map<string,string>(),counts:Record<string,number|string>={},errors:string[]=[]
  for(const [name,path] of sources){
    try{const d=await dget(path,b,validFeed,name);let n=0
      for(const x of d) if(x.chainId==='solana'&&MINT.test(x.tokenAddress)){n++;if(!found.has(x.tokenAddress)) found.set(x.tokenAddress,name)}
      counts[name]=n}catch(e:any){errors.push(`${name}: ${e.message}`);counts[name]='error'}
  }
  return {found,counts,errors}
}
// Most liquid pair where the mint is the BASE token. Batches of 30 (documented max for tokens/v1).
export async function fetchPairs(mints:string[],b:Budget){
  const out=new Map<string,any>()
  for(let i=0;i<mints.length;i+=30){
    const chunk=mints.slice(i,i+30).filter(m=>MINT.test(m)&&!EXCL.has(m)); if(!chunk.length) continue
    const d=await dget(`/tokens/v1/solana/${chunk.join(',')}`,b,validPairs,'tokens/v1')
    for(const p of d){
      const m=p.baseToken.address
      if(p.chainId!=='solana'||!chunk.includes(m)) continue
      const cur=out.get(m)
      if(!cur||(p.liquidity?.usd??0)>(cur.liquidity?.usd??0)) out.set(m,p)
    }
  }
  return out
}
// GeckoTerminal public API. Keyless limit is ~10 calls/min shared per IP (docs.coingecko.com keyless page; older guide says 30, so we assume the stricter value).
// NO retries, strictly sequential, hard in-process budget per rolling minute. On 429 we stop and report the source as failed.
const stamps:number[]=[]
export const geckoLimit=()=>Number(process.env.GECKO_MAX_PER_MIN??10)
export const geckoGate=(now=Date.now())=>{while(stamps.length&&now-stamps[0]>60000) stamps.shift();if(stamps.length>=geckoLimit()) return false;stamps.push(now);return true}
export const _resetGecko=()=>{stamps.length=0}
export async function geckoNew(b:Budget|null,pages=1):Promise<{mints:string[],error?:string}>{
  const mints:string[]=[],label='geckoterminal/new_pools'
  for(let pg=1;pg<=pages;pg++){
    if(!geckoGate()) return {mints,error:'GeckoTerminal local rate budget exhausted (not called)'}
    const t=Date.now()
    try{
      const r=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=${pg}`,{signal:AbortSignal.timeout(8000),cache:'no-store',headers:{accept:`application/json;version=${process.env.GECKO_API_VERSION??'20230302'}`}})
      if(!r.ok){note(b,{source:label,status:r.status,ms:Date.now()-t,schemaOk:null,retryAfter:r.headers.get('retry-after')});return {mints,error:`GeckoTerminal HTTP ${r.status}${r.status===429?' (rate limited; not retried)':''}`}}
      const j=await r.json(),ok=Array.isArray(j?.data)&&j.data.every((x:any)=>x&&typeof x==='object')
      note(b,{source:label,status:r.status,ms:Date.now()-t,schemaOk:ok})
      if(!ok) return {mints,error:'GeckoTerminal unexpected schema'}
      for(const x of j.data){const id=String(x?.relationships?.base_token?.data?.id||'').replace(/^solana_/,'');if(MINT.test(id)&&!mints.includes(id)) mints.push(id)}
    }catch(e:any){note(b,{source:label,status:null,ms:Date.now()-t,schemaOk:null,error:String(e.message).slice(0,120)});return {mints,error:'GeckoTerminal error: '+String(e.message).slice(0,80)}}
  }
  return {mints}
}
export const sourceKind=(s:string)=>/boost|ad/.test(s)?'promoted':s.includes('gecko')?'organic-new-pool':'self-reported-profile'
