import LoginForm from '@/components/LoginForm'
import {login} from './actions'
export const dynamic='force-dynamic'
export default function Page(){return <main className="mx-auto max-w-sm p-6"><h1 className="mb-1 text-xl font-semibold">Admin sign-in</h1><p className="mb-4 text-sm text-slate-400">Needed only to run scans and paper trades. The dashboard is viewable without signing in.</p><LoginForm action={login}/><a href="/" className="mt-4 block text-sm text-sky-400">← Back to dashboard</a></main>}
