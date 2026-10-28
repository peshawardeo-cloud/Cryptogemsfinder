import {MINT} from './dex'
export type Risk={status:'PASS'|'WARNING'|'FAIL'|'UNKNOWN';fails:string[];warns:string[];topHolderPct:number|null;details:any}
const unk=(why:string):Risk=>({status:'UNKNOWN',fails:[],warns:[why],topHolderPct:null,details:{error:why}})
// RugCheck public report endpoint. Verify current terms/docs at https://api.rugcheck.xyz/swagger before relying on it.
export async function rugcheck(mint:string,log?:any[]):Promise<Risk>{
  if(!MINT.test(mint)) return unk('Invalid mint')
  try{
    const t0=Date.now()
    const r=await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`,{signal:AbortSignal.timeout(10000),cache:'no-store'})
    const ent:any={at:new Date().toISOString(),source:'rugcheck',status:r.status,ms:Date.now()-t0,schemaOk:null};log?.push(ent)
    if(!r.ok) return unk(`RugCheck HTTP ${r.status}`)
    const d=await r.json(),fails:string[]=[],warns:string[]=[]
    // Field location differs between sources (top-level vs token.*): accept either, null = revoked, undefined = unknown
    const pick=(k:string)=>d[k]!==undefined?d[k]:d.token?.[k]
    const ma=pick('mintAuthority'),fa=pick('freezeAuthority'),known=ma!==undefined&&fa!==undefined
    ent.schemaOk=known
    if(typeof ma==='string') fails.push('Mint authority is not revoked')
    if(typeof fa==='string') fails.push('Freeze authority is not revoked')
    if(d.rugged===true) fails.push('Flagged as rugged by RugCheck')
    for(const x of Array.isArray(d.risks)?d.risks:[]){ if(x.level==='danger') fails.push(`RugCheck: ${x.name}`); else if(x.level==='warn') warns.push(`RugCheck: ${x.name}`) }
    let top:number|null=null
    if(Array.isArray(d.topHolders)&&d.topHolders.length) top=d.topHolders.slice(0,10).reduce((a:number,h:any)=>a+(Number(h.pct)||0),0)
    if(top!=null&&top>50) warns.push(`Top-10 holders own ~${top.toFixed(0)}% (may include LP/program accounts)`)
    if(d.tokenProgram&&d.tokenProgram!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') warns.push('Token-2022 program: inspect extensions/transfer fees manually')
    if(d.transferFee?.pct>0) warns.push(`Transfer fee ${d.transferFee.pct}%`)
    const status=fails.length?'FAIL':!known?'UNKNOWN':warns.length?'WARNING':'PASS'
    if(!known) warns.push('RugCheck response lacked authority fields')
    return {status,fails,warns,topHolderPct:top,details:{score:d.score,risks:d.risks,lp:d.markets?.length,topKeys:Object.keys(d).slice(0,40),authorityAt:d.mintAuthority!==undefined?'top-level':d.token?.mintAuthority!==undefined?'token.*':'absent'}}
  }catch(e:any){log?.push({at:new Date().toISOString(),source:'rugcheck',status:null,ms:null,schemaOk:null,error:String(e.message).slice(0,120)});return unk('RugCheck error: '+String(e.message).slice(0,80))}
}
