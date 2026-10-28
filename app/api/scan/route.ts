import {NextRequest,NextResponse} from 'next/server'
import {runScan} from '@/lib/scan'
export const maxDuration=60
export const dynamic='force-dynamic'
export async function GET(r:NextRequest){
  const sec=process.env.CRON_SECRET
  if(!sec||r.headers.get('authorization')!==`Bearer ${sec}`) return NextResponse.json({error:'unauthorized'},{status:401})
  return NextResponse.json(await runScan('cron'))
}
