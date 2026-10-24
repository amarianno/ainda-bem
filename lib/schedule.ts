import { DateTime } from 'luxon';
export function edition(now=new Date()) {const d=DateTime.fromJSDate(now,{zone:'America/Sao_Paulo'});if(![2,5].includes(d.weekday))return null;return {id:`ainda-bem-${d.toISODate()}`,publishAt:d.set({hour:11,minute:30,second:0,millisecond:0}).toUTC().toISO()!};}
