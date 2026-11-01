import {describe,it,expect,vi,beforeEach} from 'vitest'
import {_resetGecko,geckoNew,Budget} from '@/lib/dex'
const h=vi.hoisted(()=>({calls:[] as any[],H:(_c:any):any=>({data:[],error:null})}))
vi.mock('@/lib/db',()=>({getSettings:async()=>(await import('@/lib/score')).DEFAULTS,db:()=>({from:(t:string)=>{const c:any={t,op:'select',cols:''}
  const run=()=>{h.calls.push(c);return Promise.resolve(h.H(c))}
  const q:any={select:(x?:string)=>{if(x!==undefined)c.cols=x;return q},insert:(p:any)=>{c.op='insert';c.p=p;return q},update:(p:any)=>{c.op='update';c.p=p;return q},upsert:(p:any)=>{c.op='upsert';c.p=p;return q},
    eq:()=>q,neq:()=>q,gte:()=>q,lt:()=>q,in:()=>q,order:()=>q,limit:()=>q,single:run,maybeSingle:run,then:(a:any,b:any)=>run().then(a,b)};return q}})}))
import {runScan} from '@/lib/scan'
const M='So1ProjectMint111111111111111111111111111'
const j=(b:any,s=200)=>Promise.resolve(new Response(JSON.stringify(b),{status:s}))
const pair={chainId:'solana',pairAddress:'P',baseToken:{address:M,name:'N',symbol:'N'},priceUsd:'0.01',liquidity:{usd:50000},volume:{h1:20000,h24:80000},txns:{h1:{buys:60,sells:50}},priceChange:{h1:20},marketCap:500000,fdv:600000,pairCreatedAt:Date.now()-3*36e5}
const GOOD=()=>j({data:[{relationships:{base_token:{data:{id:'solana_'+M}}}}]})
function net(o:any={}){vi.stubGlobal('fetch',(u:any)=>{u=String(u)
  if(u.includes('token-profiles')||u.includes('token-boosts')) return o.feed?o.feed():j([{chainId:'solana',tokenAddress:M}])
  if(u.includes('/tokens/v1/')) return j([pair])
  if(u.includes('geckoterminal')) return (o.gecko||GOOD)()
  if(u.includes('rugcheck')) return j({mintAuthority:null,freezeAuthority:null,topHolders:[{pct:10}],risks:[]})
  return j({},404)})}
const lastUpd=()=>h.calls.filter(c=>c.t==='scan_runs'&&c.op==='update').at(-1)
beforeEach(()=>{h.calls.length=0;h.H=(c:any)=>c.t==='scan_runs'&&c.op==='insert'?{data:{id:'run1'},error:null}:{data:[],error:null};_resetGecko();vi.unstubAllGlobals()})
describe('MOCKED db+network: scan workflow regressions',()=>{
  it('clean scan is success and records diagnostics',async()=>{net();const r=await runScan('t');expect(r.status).toBe('success');expect(r.ok).toBe(true);expect(lastUpd().p.status).toBe('success');expect(Array.isArray(lastUpd().p.diagnostics)).toBe(true)
    expect(h.calls.some(c=>c.t==='token_snapshots'&&c.op==='insert')).toBe(true)})
  it('failed discovery source is partial, never success',async()=>{net({gecko:()=>j({},500)});const r=await runScan('t');expect(r.status).toBe('partial');expect(r.ok).toBe(false);expect(r.message).toMatch(/INCOMPLETE.*GeckoTerminal HTTP 500/);expect(lastUpd().p.status).toBe('partial')})
  it('Gecko 200 with no extractable mints is flagged (schema mismatch)',async()=>{net({gecko:()=>j({data:[{id:'x',relationships:{}}]})});const r=await runScan('t');expect(r.status).toBe('partial');expect(r.message).toMatch(/no mint could be extracted/)})
  it('all sources down is failed',async()=>{net({feed:()=>j({},500),gecko:()=>j({},500)});const r=await runScan('t');expect(r.status).toBe('failed');expect(lastUpd().p.status).toBe('failed')})
  it('missing migration fails fast with the migration name, writes no scan row',async()=>{net();h.H=(c:any)=>c.t==='scan_runs'&&c.cols==='diagnostics'?{data:null,error:{message:'column scan_runs.diagnostics does not exist'}}:{data:[],error:null}
    const r=await runScan('t');expect(r.code).toBe('schema');expect(r.message).toMatch(/003_diagnostics\.sql/);expect(h.calls.some(c=>c.t==='scan_runs'&&c.op==='insert')).toBe(false)})
  it('bad credentials produce a credentials message',async()=>{h.H=()=>({data:null,error:{message:'Invalid API key'}});const r=await runScan('t');expect(r.code).toBe('schema');expect(r.message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)})
  it('final status write retries without diagnostics column',async()=>{net();const base=h.H;h.H=(c:any)=>c.t==='scan_runs'&&c.op==='update'&&c.p.diagnostics?{data:null,error:{message:'no column'}}:base(c);const r=await runScan('t');expect(r.status).toBe('success');expect(lastUpd().p.diagnostics).toBeUndefined()})
  it('DB failure on final write is never reported as success',async()=>{net();const base=h.H;h.H=(c:any)=>c.t==='scan_runs'&&c.op==='update'&&c.p.status==='success'?{data:null,error:{message:'db down'}}:base(c);const r=await runScan('t');expect(r.ok).toBe(false);expect(r.status).not.toBe('success')})
  it('scan record insert failure is reported',async()=>{net();h.H=(c:any)=>c.t==='scan_runs'&&c.op==='insert'?{data:null,error:{message:'permission denied'}}:{data:[],error:null};const r=await runScan('t');expect(r.ok).toBe(false);expect(r.code).toBe('db')})
  it('duplicate within 3 minutes is rejected with a message',async()=>{net();h.H=(c:any)=>c.t==='scan_runs'&&c.op==='select'&&h.calls.some(x=>x.t==='scan_runs'&&x.op==='update')?{data:[{id:'p'}],error:null}:{data:[],error:null};const r=await runScan('t');expect(r.code).toBe('duplicate');expect(r.status).toBe('rejected');expect(h.calls.some(c=>c.t==='scan_runs'&&c.op==='insert')).toBe(false)})
})
describe('MOCKED geckoterminal parsing',()=>{
  it('empty and unextractable responses are errors',async()=>{vi.stubGlobal('fetch',()=>j({data:[]}));expect((await geckoNew(new Budget(5))).error).toMatch(/0 pools/);_resetGecko();vi.stubGlobal('fetch',()=>j({data:[{a:1}]}));expect((await geckoNew(new Budget(5))).error).toMatch(/schema mismatch/)})
})
