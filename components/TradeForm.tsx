'use client'
import {useFormState} from 'react-dom'
export default function TradeForm({action,field,value,label}:{action:any,field:string,value:string,label:string}){
  const [st,fa]=useFormState(action,null)
  return <form action={fa}><input type="hidden" name={field} value={value}/><button className="rounded bg-slate-700 px-2 py-1 text-xs">{label}</button>{st&&<div className={`text-xs ${st.ok?'text-sky-300':'text-rose-400'}`}>{st.msg}</div>}</form>}
