// Fail closed: in production with no password configured, nothing is authorized.
export function authorized(header:string|null,pw=process.env.BASIC_AUTH_PASSWORD,prod=process.env.NODE_ENV==='production'){
  if(!pw) return !prod
  if(!header?.startsWith('Basic ')) return false
  try{return atob(header.slice(6)).split(':').slice(1).join(':')===pw}catch{return false}
}
