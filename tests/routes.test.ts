import {describe,it,expect,vi,beforeEach} from 'vitest'
vi.mock('@/lib/scan',()=>({runScan:vi.fn()}))
vi.mock('next/headers',()=>({headers:()=>new Headers(h.hdr)}))
vi.mock('next/cache',()=>({revalidatePath:()=>{}}))
vi.mock('@/lib/db',()=>({db:()=>({}),getSettings:async()=>({})}))
const h=vi.hoisted(()=>({hdr:{} as any}))
import {runScan} from '@/lib/scan'
import {GET as scanGET} from '@/app/api/scan/route'
import {GET as authGET} from '@/app/auth/route'
import {scanNow} from '@/app/actions'
const env=process.env as any
const req=(auth?:string)=>new Request('http://x/api/scan',{headers:auth?{authorization:auth}:{}}) as any
beforeEach(()=>{env.CRON_SECRET='s';env.NODE_ENV='production';env.BASIC_AUTH_PASSWORD='pw';h.hdr={}})
describe('MOCKED /api/scan HTTP mapping',()=>{
  const cases:[any,number][]=[[{ok:true,status:'success',code:'success'},200],[{ok:false,status:'partial',code:'partial'},200],[{ok:false,status:'failed',code:'failed'},502],[{ok:false,status:'rejected',code:'duplicate'},409],[{ok:false,status:'failed',code:'schema'},500],[{ok:false,status:'failed',code:'db'},500]]
  it.each(cases)('maps %j to %i',async(r,code)=>{(runScan as any).mockResolvedValue({message:'m',...r});const res=await scanGET(req('Bearer s'));expect(res.status).toBe(code);expect((await res.json()).status).toBe(r.status)})
  it('rejects missing/wrong bearer',async()=>{expect((await scanGET(req())).status).toBe(401);expect((await scanGET(req('Bearer nope'))).status).toBe(401)})
})
describe('MOCKED auth gate + scanNow',()=>{
  it('/auth challenges when unauthorized, redirects when authorized',async()=>{const a=authGET(new Request('http://x/auth'));expect(a.status).toBe(401);expect(a.headers.get('www-authenticate')).toMatch(/Basic/)
    const b=authGET(new Request('http://x/auth',{headers:{authorization:'Basic '+btoa('u:pw')}}));expect(b.status).toBe(307)})
  it('scanNow shows an Unauthorized message instead of failing silently',async()=>{const r=await scanNow(null);expect(r.ok).toBe(false);expect(r.status).toBe('unauthorized');expect(r.msg).toMatch(/Unauthorized/)})
  it('scanNow surfaces the actual scan outcome',async()=>{h.hdr={authorization:'Basic '+btoa('u:pw')};(runScan as any).mockResolvedValue({ok:false,status:'partial',message:'INCOMPLETE SCAN: x'});const r=await scanNow(null);expect(r).toEqual({ok:false,status:'partial',msg:'INCOMPLETE SCAN: x'})})
})
