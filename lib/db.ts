import {createClient} from '@supabase/supabase-js'
import {DEFAULTS} from './score'
export const dbReady=()=>!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY)
export const db=()=>createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
export async function getSettings(){const {data}=await db().from('strategy_settings').select('settings').eq('id',1).maybeSingle();return {...DEFAULTS,...(data?.settings||{}),w:{...DEFAULTS.w,...(data?.settings?.w||{})}}}
