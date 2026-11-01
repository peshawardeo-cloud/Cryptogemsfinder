import {NextRequest,NextResponse} from 'next/server'
import {runScan} from '@/lib/scan'
export const maxDuration=60
export const dynamic='force-dynamic'
// HTTP: 200 success|partial (check body.status!), 409 duplicate/running, 500 schema/db/exception, 502 failed (no data), 401 bad bearer.
export async function GET(r:NextRequest){
  const sec=process.env.CRON_SECRET
  if(!sec||r.headers.get('authorization')!==`Bearer ${sec}`) return NextResponse.json({error:'unauthorized'},{status:401})
  const x=await runScan('cron')
  const code=x.status==='success'||x.status==='partial'?200:x.code==='duplicate'||x.code==='running'?409:['schema','db','exception'].includes(x.code)?500:502
  return NextResponse.json(x,{status:code})
}
