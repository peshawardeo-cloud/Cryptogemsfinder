import {NextResponse} from 'next/server'
import {authorized} from '@/lib/auth'
export const dynamic='force-dynamic'
// Issues the Basic-auth challenge even if middleware is not active in a deployment.
export function GET(r:Request){
  if(authorized(r.headers.get('authorization'))) return NextResponse.redirect(new URL('/',r.url))
  return new NextResponse('Auth required',{status:401,headers:{'WWW-Authenticate':'Basic realm="Gem Radar"'}})
}
