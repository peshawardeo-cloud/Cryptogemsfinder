'use client'
import {useFormState,useFormStatus} from 'react-dom'
function Btn(){const {pending}=useFormStatus();return <button disabled={pending} className="rounded bg-sky-700 px-3 py-1.5 disabled:opacity-60">{pending?'Scanning… (can take up to 60s)':'Scan now'}</button>}
export default function ScanButton({action}:{action:any}){
  const [st,fa]=useFormState(action,null)
  const c=!st?'':st.status==='success'?'text-sky-300':st.status==='partial'?'text-amber-300':'text-rose-300'
  return <form action={fa}><Btn/>{st&&<p role="status" className={`mt-1 max-w-xl text-sm ${c}`}>{st.status.toUpperCase()}: {st.msg}</p>}</form>}
