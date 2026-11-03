export class HeygenError extends Error {
 constructor(public status:number,public code:string){super(`HeyGen HTTP ${status} ${code}`);}
}
export class HeygenClient {
 constructor(private key:string,private request:typeof fetch=fetch){
  if(!key||key.trim()!==key)throw new Error('Invalid HeyGen key configuration');
 }
 async uploadAudio(bytes:Buffer){
  if(bytes.length>32_000_000)throw new Error('Audio asset exceeds 32 MB');
  const body=new FormData();body.append('file',new Blob([new Uint8Array(bytes)],{type:'audio/wav'}),'ainda-bem-test05.wav');
  const r=await this.request('https://api.heygen.com/v3/assets',{method:'POST',headers:{'X-Api-Key':this.key},body,signal:AbortSignal.timeout(120000)});
  let j:any;try{j=await r.json();}catch{throw new HeygenError(r.status,'INVALID_RESPONSE');}
  if(!r.ok)throw new HeygenError(r.status,'ASSET_UPLOAD_FAILED');
  return j.data??j;
 }
 async call(path:string,body?:unknown){
  if(!/^\/v3\/[a-z0-9_/-]+$/.test(path))throw new Error('Invalid HeyGen path');
  const r=await this.request('https://api.heygen.com'+path,{method:body===undefined?'GET':'POST',headers:{'X-Api-Key':this.key,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000)});
  let j:any;try{j=await r.json();}catch{throw new HeygenError(r.status,'INVALID_RESPONSE');}
  if(!r.ok){const raw=j?.error?.code||j?.error_code||j?.code;throw new HeygenError(r.status,typeof raw==='string'&&/^[a-zA-Z0-9_]{1,100}$/.test(raw)?raw:'API_ERROR');}
  return j.data??j;
 }
}
export function billingSnapshot(user:any){
 return {billingType:user.billing_type??null,currency:user.wallet?.currency??null,balance:typeof user.wallet?.remaining_balance==='number'?user.wallet.remaining_balance:null,autoReload:user.wallet?.auto_reload?.enabled??null};
}
export function assertPilotBudget(user:any,minBalance:number){
 const b=billingSnapshot(user);
 if(b.billingType!=='wallet'||b.currency!=='usd'||b.balance===null||b.balance<minBalance)throw new Error('HeyGen API USD balance unavailable or insufficient');
 return b;
}
