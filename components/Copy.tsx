'use client'
export default function Copy({v}:{v:string}){return <button className="ml-1 text-xs text-sky-400" onClick={()=>navigator.clipboard.writeText(v)}>copy</button>}
