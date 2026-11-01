import {createHmac,timingSafeEqual} from 'crypto'
import {cookies} from 'next/headers'
export const COOKIE='gr_admin'
const pw=()=>process.env.BASIC_AUTH_PASSWORD // reused as the admin password (name kept so existing Vercel config keeps working)
const tag=(p:string)=>createHmac('sha256',p).update('gem-radar-admin-v1').digest('hex')
const eq=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
const h=(s:string)=>createHmac('sha256','cmp').update(s).digest('hex')
export const isAdminCookie=(v:string|undefined|null,p=pw())=>!!p&&!!v&&eq(v,tag(p))
export const passwordOk=(input:string,p=pw())=>!!p&&eq(h(input),h(p))
export const sessionCookie=(p:string)=>({name:COOKIE,value:tag(p),options:{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge:7*864e2}})
export const cookieFromHeader=(c:string|null)=>c?.match(/(?:^|;\s*)gr_admin=([^;]+)/)?.[1]
// Admin = valid signed cookie. Fails closed in production when no password is configured.
export function isAdmin(){const p=pw();if(!p) return process.env.NODE_ENV!=='production';return isAdminCookie(cookies().get(COOKIE)?.value,p)}
