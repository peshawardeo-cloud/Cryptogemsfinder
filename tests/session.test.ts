import {describe,it,expect,vi} from 'vitest'
import fs from 'fs'
import path from 'path'
vi.mock('next/headers',()=>({cookies:()=>({get:()=>undefined,set:h.set,delete:()=>{}}),headers:()=>new Headers()}))
vi.mock('next/navigation',()=>({redirect:(u:string)=>{throw new Error('REDIRECT '+u)}}))
const h=vi.hoisted(()=>({set:vi.fn()}))
import {isAdminCookie,passwordOk,sessionCookie,cookieFromHeader} from '@/lib/session'
import {login} from '@/app/login/actions'
import {GET as diag} from '@/app/api/diagnostics/route'
import {GET as version} from '@/app/api/version/route'
const env=process.env as any
describe('session cookie auth (replaces Basic popup)',()=>{
  it('valid cookie accepted; tampered/empty/other-password/no-password rejected',()=>{const c=sessionCookie('pw').value
    expect(isAdminCookie(c,'pw')).toBe(true);expect(isAdminCookie(c+'0','pw')).toBe(false);expect(isAdminCookie('','pw')).toBe(false);expect(isAdminCookie(c,'other')).toBe(false);expect(isAdminCookie(c,'')).toBe(false)})
  it('cookie never contains the password',()=>expect(sessionCookie('hunter2-secret').value).not.toContain('hunter2'))
  it('password check',()=>{expect(passwordOk('pw','pw')).toBe(true);expect(passwordOk('px','pw')).toBe(false);expect(passwordOk('x','')).toBe(false)})
  it('cookie header parsing',()=>expect(cookieFromHeader('a=1; gr_admin=abc; b=2')).toBe('abc'))
  it('login: wrong password sets no cookie; right password sets httpOnly cookie and redirects',async()=>{env.BASIC_AUTH_PASSWORD='pw'
    const f=(v:string)=>{const d=new FormData();d.set('password',v);return d}
    expect((await login(null,f('bad'))).ok).toBe(false);expect(h.set).not.toHaveBeenCalled()
    await expect(login(null,f('pw'))).rejects.toThrow('REDIRECT /');expect(h.set.mock.calls[0][2].httpOnly).toBe(true)})
  it('login reports missing server config',async()=>{delete env.BASIC_AUTH_PASSWORD;const d=new FormData();d.set('password','x');expect((await login(null,d)).msg).toMatch(/not configured/)})
  it('diagnostics: 401 without WWW-Authenticate; admin cookie and basic both accepted',async()=>{env.NODE_ENV='production';env.BASIC_AUTH_PASSWORD='pw'
    const r=await diag(new Request('http://x/api/diagnostics') as any);expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toBeNull()
    expect((await diag(new Request('http://x/api/diagnostics',{headers:{cookie:'gr_admin='+sessionCookie('pw').value}}) as any)).status).toBe(200)
    expect((await diag(new Request('http://x/api/diagnostics',{headers:{authorization:'Basic '+btoa('u:pw')}}) as any)).status).toBe(200);env.NODE_ENV='test'})
  it('/api/version is public and has no secrets',async()=>{const t=await (await version()).text();expect(t).toContain('session-cookie-v1');expect(t).not.toMatch(/SECRET|KEY|pw/)})
})
describe('regression guard: the Basic popup can never come back unnoticed',()=>{
  const root=path.resolve(__dirname,'..'),files:string[]=[]
  const walk=(d:string)=>{for(const f of fs.readdirSync(d)){if(['node_modules','.next','tests','.git'].includes(f)) continue;const p=path.join(d,f);fs.statSync(p).isDirectory()?walk(p):/\.(ts|tsx|js|json)$/.test(f)&&files.push(p)}}
  walk(root)
  it('no source file sends WWW-Authenticate',()=>expect(files.filter(f=>/www-authenticate/i.test(fs.readFileSync(f,'utf8')))).toEqual([]))
  it('no middleware/proxy file and no redirect to an auth route',()=>{expect(fs.existsSync(path.join(root,'middleware.ts'))).toBe(false);expect(fs.existsSync(path.join(root,'proxy.ts'))).toBe(false);expect(files.filter(f=>/redirect\(['"]\/auth['"]\)/.test(fs.readFileSync(f,'utf8')))).toEqual([])})
})
