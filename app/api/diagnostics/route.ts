import {NextRequest,NextResponse} from 'next/server'
import {authorized} from '@/lib/auth'
import {db,dbReady} from '@/lib/db'
import {Budget,dget,geckoNew,validFeed} from '@/lib/dex'
import {rugcheck} from '@/lib/risk'
export const dynamic='force-dynamic'
const WSOL='So11111111111111111111111111111111111111112'
let lastProbe=0
const e=(x:any)=>String(x||'').slice(0,200)
export async function GET(r:NextRequest){
  if(!authorized(r.headers.get('authorization'))) return NextResponse.json({error:'unauthorized'},{status:401,headers:{'WWW-Authenticate':'Basic realm="Gem Radar"'}})
  const out:any={envConfigured:{SUPABASE_URL:!!process.env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:!!process.env.SUPABASE_SERVICE_ROLE_KEY,CRON_SECRET:!!process.env.CRON_SECRET,BASIC_AUTH_PASSWORD:!!process.env.BASIC_AUTH_PASSWORD},
    note:'Values are never shown. "verified" below means a real request returned HTTP 200 AND passed schema checks in that scan or probe. Add ?probe=1 for a live one-request-per-service probe (max once/60s).'}
  if(dbReady()){const {data,error}=await db().from('scan_runs').select('id,trigger,status,started_at,finished_at,requests_used,source_counts,error,diagnostics').order('started_at',{ascending:false}).limit(5)
    out.recentScans=error?{error:e(error.message)}:(data||[]).map((x:any)=>({...x,error:x.error?e(x.error):null}))
    const last=(data||[])[0];if(last?.diagnostics){const m:any={};for(const d of last.diagnostics) m[d.source]={status:d.status,ms:d.ms,schemaOk:d.schemaOk,verified:d.status===200&&d.schemaOk===true};out.lastScanBySource=m}}
  else out.recentScans='database not configured'
  if(new URL(r.url).searchParams.get('probe')==='1'){
    if(Date.now()-lastProbe<60000) out.probe={error:'rate limited: once per 60s'}
    else{lastProbe=Date.now();const b=new Budget(1),rl:any[]=[],p:any={}
      try{const d=await dget('/token-profiles/latest/v1',b,validFeed,'token-profiles/latest');p.dexscreenerItems=d.length}catch(x:any){p.dexscreenerError=e(x.message)}
      const g=await geckoNew(b);p.geckoMints=g.mints.length;if(g.error) p.geckoError=g.error
      const rk=await rugcheck(WSOL,rl);p.rugcheck={status:rk.status,topKeys:rk.details?.topKeys,authorityAt:rk.details?.authorityAt,error:rk.details?.error}
      out.probe={requests:[...b.log,...rl],...p,verified:[...b.log,...rl].filter(x=>x.status===200&&x.schemaOk===true).map(x=>x.source)}}}
  return NextResponse.json(out)
}
