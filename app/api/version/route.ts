import {NextResponse} from 'next/server'
export const dynamic='force-dynamic'
// Public, non-secret: lets you confirm which commit/branch/environment is actually serving the domain.
export function GET(){return NextResponse.json({authMode:'session-cookie-v1',basicAuthChallenge:false,commit:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)??null,branch:process.env.VERCEL_GIT_COMMIT_REF??null,vercelEnv:process.env.VERCEL_ENV??null})}
