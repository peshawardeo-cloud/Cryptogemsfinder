import {describe,it,expect,vi,beforeEach} from 'vitest'
import {fetchPairs,discover,Budget} from '@/lib/dex'
import {rugcheck} from '@/lib/risk'
import {evaluate,DEFAULTS} from '@/lib/score'
import {exitPnl,balance,slipPct} from '@/lib/trades'
import {authorized} from '@/lib/auth'
import {isStale,outcomes} from '@/lib/util'
import {GET} from '@/app/api/scan/route'
const M='So1ProjectMint111111111111111111111111111',Q='So11111111111111111111111111111111111111112'
const j=(b:any,status=200)=>Promise.resolve(new Response(JSON.stringify(b),{status}))
const pair=(o:any={})=>({chainId:'solana',pairAddress:'P1',baseToken:{address:M,name:'N',symbol:'N'},priceUsd:'0.01',liquidity:{usd:50000},volume:{h1:20000,h24:80000},txns:{h1:{buys:60,sells:50}},priceChange:{h1:20},marketCap:500000,fdv:600000,pairCreatedAt:Date.now()-3*36e5,info:{websites:[{url:'x'}]},...o})
const PASS:any={status:'PASS',fails:[],warns:[],topHolderPct:20,details:{}}
beforeEach(()=>{vi.unstubAllGlobals()})
describe('MOCKED dexscreener',()=>{
  it('keeps base-token pairs only, best liquidity, dedupes',async()=>{
    vi.stubGlobal('fetch',()=>j([pair({liquidity:{usd:1}}),pair({pairAddress:'P2',liquidity:{usd:9}}),pair({baseToken:{address:Q}}),pair({chainId:'eth'})]))
    const m=await fetchPairs([M],new Budget(5));expect(m.size).toBe(1);expect(m.get(M).pairAddress).toBe('P2')})
  it('throws on unexpected schema',async()=>{vi.stubGlobal('fetch',()=>j({oops:1}));await expect(fetchPairs([M],new Budget(5))).rejects.toThrow(/schema/)})
  it('retries 429 then succeeds',async()=>{let n=0;vi.stubGlobal('fetch',()=>++n<3?j({},429):j([pair()]));expect((await fetchPairs([M],new Budget(9))).size).toBe(1)})
  it('fails after persistent 500 / timeout / budget',async()=>{
    vi.stubGlobal('fetch',()=>j({},500));await expect(fetchPairs([M],new Budget(9))).rejects.toThrow()
    vi.stubGlobal('fetch',()=>Promise.reject(new Error('timeout')));await expect(fetchPairs([M],new Budget(9))).rejects.toThrow()
    vi.stubGlobal('fetch',()=>j([]));await expect(fetchPairs([M],new Budget(0))).rejects.toThrow(/budget/)})
  it('discover reports source errors, dedupes mints',async()=>{
    let n=0;vi.stubGlobal('fetch',()=>++n===1?j([{chainId:'solana',tokenAddress:M},{chainId:'solana',tokenAddress:M},{chainId:'eth',tokenAddress:M}]):j({},500))
    const r=await discover(new Budget(30));expect(r.found.size).toBe(1);expect(r.errors.length).toBe(2)})
})
describe('MOCKED rugcheck',()=>{
  it.each([[()=>j({},500)],[()=>Promise.reject(new Error('x'))],[()=>j({})]])('never PASS on failure/missing',async f=>{vi.stubGlobal('fetch',f);expect((await rugcheck(M)).status).toBe('UNKNOWN')})
  it('FAIL on authority (top-level or nested), PASS only when both revoked',async()=>{
    vi.stubGlobal('fetch',()=>j({mintAuthority:'x',freezeAuthority:null}));expect((await rugcheck(M)).status).toBe('FAIL')
    vi.stubGlobal('fetch',()=>j({token:{mintAuthority:null,freezeAuthority:'y'}}));expect((await rugcheck(M)).status).toBe('FAIL')
    vi.stubGlobal('fetch',()=>j({token:{mintAuthority:null,freezeAuthority:null}}));expect((await rugcheck(M)).status).toBe('PASS')})
  it('invalid mint is UNKNOWN',async()=>expect((await rugcheck('../x')).status).toBe('UNKNOWN'))
})
describe('scoring',()=>{
  it('hard failure beats a high score',()=>{const e=evaluate(pair(),{...PASS,status:'FAIL',fails:['Mint authority is not revoked']});expect(e.status).toBe('REJECTED')})
  it('missing critical data is rejected, unknown risk is never a candidate',()=>{
    expect(evaluate(pair({priceUsd:undefined}),PASS).status).toBe('REJECTED')
    expect(evaluate(pair(),{...PASS,status:'UNKNOWN'}).status).toBe('WATCHLIST');expect(evaluate(pair(),null).status).toBe('WATCHLIST')})
  it('qualifies with PASS; boosts do not change score; missing mcap not substituted',()=>{
    const a=evaluate(pair(),PASS),b=evaluate(pair({boosts:{active:50}}),PASS);expect(a.status).toBe('RESEARCH_CANDIDATE');expect(a.score).toBe(b.score)
    expect(evaluate(pair({marketCap:undefined}),PASS).soft.join()).toMatch(/Market cap N\/A/)})
  it('score within bounds, holder pts 0 when unknown',()=>{const e=evaluate(pair(),{...PASS,topHolderPct:null});expect(e.breakdown.holders.pts).toBe(0);expect(e.score).toBeLessThanOrEqual(100)})
})
describe('paper trading math',()=>{
  const t={size_usd:10,entry_price:1,entry_cost_usd:0.1}
  it('P/L net of costs, no double count',()=>{const r=exitPnl(t,2,100000);expect(r.realized).toBeCloseTo(20-10-0.1-20*0.0031,4)})
  it('unknown liquidity uses conservative slippage',()=>expect(exitPnl(t,1,null).realized).toBeLessThan(exitPnl(t,1,1e6).realized))
  it('slippage',()=>{expect(slipPct(10,1000)).toBeCloseTo(1);expect(slipPct(10,null)).toBeNull()})
  it('balance consistent',()=>{expect(balance(50,[{status:'open',size_usd:10,entry_cost_usd:.1},{status:'closed',realized_pnl_usd:3,size_usd:10,entry_cost_usd:.1}])).toBeCloseTo(50+3-10.1)})
})
describe('auth / stale / followup',()=>{
  it('fails closed in production',()=>{expect(authorized(null,undefined,true)).toBe(false);expect(authorized(null,'pw',true)).toBe(false);expect(authorized('Basic '+btoa('u:pw'),'pw',true)).toBe(true);expect(authorized('Basic '+btoa('u:bad'),'pw',true)).toBe(false);expect(authorized('Basic %%%','pw',true)).toBe(false)})
  it('cron route rejects missing/wrong secret, and unset secret',async()=>{
    delete process.env.CRON_SECRET;expect((await GET(new Request('http://x/api/scan',{headers:{authorization:'Bearer undefined'}}) as any)).status).toBe(401)
    process.env.CRON_SECRET='s';expect((await GET(new Request('http://x/api/scan') as any)).status).toBe(401)})
  it('stale detection',()=>{const n=Date.now();expect(isStale(null)).toBe(true);expect(isStale(new Date(n-27*36e5).toISOString(),n)).toBe(true);expect(isStale(new Date(n-3*36e5).toISOString(),n)).toBe(false)})
  it('outcomes use only observations at/after horizon; else Insufficient',()=>{
    const n=Date.now(),h=(x:number)=>new Date(n-x*36e5).toISOString()
    const sig=[{mint:M,price:1,observed_at:h(40)}],obs=[{mint:M,price:5,observed_at:h(39.5)},{mint:M,price:2,observed_at:h(15)}]
    const o=outcomes(sig,obs,n);expect(o[0].eligible).toBe(1);expect(o[0].observed).toBe(0) // early point at +0.5h is ignored, counted as unobserved
    expect(o[2].median).toBeCloseTo(100) // 24h obs at t0+25h
    expect(o[3].eligible).toBe(0)})
})
