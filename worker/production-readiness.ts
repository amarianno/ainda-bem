import { pool } from '../lib/db';
import { authorizedClient,expectedChannel } from '../lib/auth';
import { HeygenClient,billingSnapshot } from './heygen';
import { estimateAvatarUsd } from './production-policy';
export async function productionReadiness(){
 const key=process.env.PRODUCTION_PREFLIGHT_KEY;if(!key)return;
 if((await pool.query("SELECT 1 FROM audit_events WHERE event_type='PRODUCTION_READINESS' AND details->>'key'=$1",[key])).rowCount)return;
 const result:any={key,expectedChannel,privateOnly:true,costEstimate:{currency:'usd',seconds420:estimateAvatarUsd(420),seconds480:estimateAvatarUsd(480),tariffOnly:true,excludesOpenAIAndInfrastructure:true}};
 try{const auth=await authorizedClient();const token=(await auth.getAccessToken()).token;const r=await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});const data=r.ok?await r.json():{};result.youtube={authenticated:r.ok,channelMatches:data.items?.[0]?.id===expectedChannel,httpStatus:r.status};}
 catch(e){const err=e as any;const code=err.response?.data?.error;result.youtube={authenticated:false,error:typeof code==='string'&&/^[a-z_]+$/.test(code)?code:'OAUTH_UNAVAILABLE'};}
 try{if(!process.env.HEYGEN_API_KEY)throw new Error();const u=await new HeygenClient(process.env.HEYGEN_API_KEY).call('/v3/users/me');result.heygen={authenticated:true,accountMatches:u.username==='83e87bbf2f87443b8db3c699b3aedeba',billing:billingSnapshot(u)};}
 catch{result.heygen={authenticated:false};}
 await pool.query("INSERT INTO audit_events(event_type,details) VALUES('PRODUCTION_READINESS',$1)",[JSON.stringify(result)]);
}
