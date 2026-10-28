import {describe,it,expect,vi,beforeEach} from 'vitest'
import {geckoNew,geckoGate,_resetGecko,Budget,dget,validFeed} from '@/lib/dex'
import {scanStatus} from '@/lib/util'
import {GET} from '@/app/api/diagnostics/route'
import {rugcheck} from '@/lib/risk'
const M='So1ProjectMint111111111111111111111111111'
const j=(b:any,s=200,h:any={})=>Promise.resolve(new Response(JSON.stringify(b),{status:s,headers:h}))
beforeEach(()=>{vi.unstubAllGlobals();_resetGecko();delete process.env.GECKO_MAX_PER_MIN})
describe('MOCKED geckoterminal budget',()=>{
  it('never exceeds per-minute budget and never calls fetch past it',async()=>{
    const f=vi.fn(()=>j({data:[]}));vi.stubGlobal('fetch',f);process.env.GECKO_MAX_PER_MIN='3'
    for(let i=0;i<10;i++) await geckoNew(null);expect(f).toHaveBeenCalledTimes(3)})
  it('429 is not retried and is reported',async()=>{
    const f=vi.fn(()=>j({},429,{'retry-after':'30'}));vi.stubGlobal('fetch',f);const b=new Budget(5)
    const r=await geckoNew(b,2);expect(f).toHaveBeenCalledTimes(1);expect(r.error).toMatch(/429/);expect(b.log[0].retryAfter).toBe('30')})
  it('schema failure and network error produce errors, log schemaOk',async()=>{
    vi.stubGlobal('fetch',()=>j({nope:1}));const b=new Budget(5);expect((await geckoNew(b)).error).toMatch(/schema/);expect(b.log[0].schemaOk).toBe(false)
    _resetGecko();vi.stubGlobal('fetch',()=>Promise.reject(new Error('boom')));expect((await geckoNew(null)).error).toMatch(/error/)})
  it('parses base token ids and dedupes',async()=>{vi.stubGlobal('fetch',()=>j({data:[{relationships:{base_token:{data:{id:'solana_'+M}}}},{relationships:{base_token:{data:{id:'solana_'+M}}}}]}));expect((await geckoNew(null)).mints).toEqual([M])})
  it('gate is a rolling window',()=>{process.env.GECKO_MAX_PER_MIN='1';expect(geckoGate(0)).toBe(true);expect(geckoGate(1000)).toBe(false);expect(geckoGate(61000)).toBe(true)})
})
describe('MOCKED dexscreener budget with retries',()=>{
  it('retries count against the request budget',async()=>{const f=vi.fn(()=>j({},500));vi.stubGlobal('fetch',f)
    await expect(dget('/x',new Budget(2),validFeed,'x')).rejects.toThrow(/budget/);expect(f).toHaveBeenCalledTimes(2)})
  it('logs schema failure',async()=>{vi.stubGlobal('fetch',()=>j({a:1}));const b=new Budget(3);await expect(dget('/x',b,validFeed,'x')).rejects.toThrow(/schema/);expect(b.log.at(-1).schemaOk).toBe(false)})
})
describe('scan status and diagnostics',()=>{
  it('failed source never yields success',()=>{expect(scanStatus([],5)).toBe('success');expect(scanStatus(['gecko down'],5)).toBe('partial');expect(scanStatus([],0)).toBe('failed');expect(scanStatus(['x'],0)).toBe('failed')})
  it('diagnostics requires auth in production and leaks no secrets',async()=>{
    const env=process.env as any;env.NODE_ENV='production';env.BASIC_AUTH_PASSWORD='pw';env.SUPABASE_SERVICE_ROLE_KEY='SECRETKEY'
    expect((await GET(new Request('http://x/api/diagnostics') as any)).status).toBe(401)
    const ok=await GET(new Request('http://x/api/diagnostics',{headers:{authorization:'Basic '+btoa('u:pw')}}) as any);const t=await ok.text()
    expect(ok.status).toBe(200);expect(t).not.toContain('SECRETKEY');expect(t).not.toContain('"pw"');expect(JSON.parse(t).envConfigured.SUPABASE_SERVICE_ROLE_KEY).toBe(true)
    env.NODE_ENV='test'})
  it('rugcheck logs schema state; unknown when authority fields absent',async()=>{vi.stubGlobal('fetch',()=>j({score:1}));const l:any[]=[];expect((await rugcheck(M,l)).status).toBe('UNKNOWN');expect(l[0].schemaOk).toBe(false)})
})
