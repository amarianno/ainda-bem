import { timingSafeEqual } from 'node:crypto';
export function equalSecret(a:string|null,b:string|undefined){if(!a||!b)return false;const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);}
export function bearer(req:Request,secret:string|undefined){return equalSecret(req.headers.get('authorization'),secret?`Bearer ${secret}`:undefined);}
export function localDateParts(date=new Date()){const entries=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date);return Object.fromEntries(entries.map(x=>[x.type,x.value]));}
