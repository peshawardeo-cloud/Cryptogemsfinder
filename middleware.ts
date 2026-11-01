import {NextRequest,NextResponse} from 'next/server'
import {authorized} from './lib/auth'
export function middleware(r:NextRequest){
  if(authorized(r.headers.get('authorization'))) return NextResponse.next()
  return new NextResponse('Auth required (set BASIC_AUTH_PASSWORD)',{status:401,headers:{'WWW-Authenticate':'Basic realm="Gem Radar"'}})
}
export const config={matcher:['/((?!api/scan|_next).*)']}
