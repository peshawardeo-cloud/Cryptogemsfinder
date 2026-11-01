'use server'
import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'
import {passwordOk,sessionCookie,COOKIE} from '@/lib/session'
const fails:number[]=[]
export async function login(_:any,fd:FormData){
  const now=Date.now();while(fails.length&&now-fails[0]>60000) fails.shift()
  if(fails.length>=5) return {ok:false,msg:'Too many attempts. Wait a minute.'}
  const p=process.env.BASIC_AUTH_PASSWORD
  if(!p) return {ok:false,msg:'Admin password is not configured on the server (set BASIC_AUTH_PASSWORD in Vercel and redeploy).'}
  if(!passwordOk(String(fd.get('password')||''),p)){fails.push(now);await new Promise(r=>setTimeout(r,400));return {ok:false,msg:'Wrong password.'}}
  const c=sessionCookie(p);cookies().set(c.name,c.value,c.options);redirect('/')
}
export async function logout(){cookies().delete(COOKIE);redirect('/')}
