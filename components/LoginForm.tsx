'use client'
import {useFormState,useFormStatus} from 'react-dom'
function B(){const {pending}=useFormStatus();return <button disabled={pending} className="rounded bg-sky-700 px-3 py-1.5 disabled:opacity-60">{pending?'Checking…':'Sign in'}</button>}
export default function LoginForm({action}:{action:any}){const [st,fa]=useFormState(action,null)
  return <form action={fa} className="space-y-3"><input name="password" type="password" autoComplete="current-password" required placeholder="Admin password" className="w-full rounded bg-slate-800 p-2"/><B/>{st&&!st.ok&&<p className="text-sm text-rose-300">{st.msg}</p>}</form>}
