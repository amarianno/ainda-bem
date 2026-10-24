import { pool } from '../lib/db';
import { authorizedClient,expectedChannel } from '../lib/auth';
export async function verifyPrivateUploads(){
 const r=await pool.query("SELECT id,youtube_video_id FROM episodes WHERE status='VERIFYING' AND youtube_video_id IS NOT NULL ORDER BY updated_at LIMIT 10");if(!r.rowCount)return;
 const auth=await authorizedClient();const token=(await auth.getAccessToken()).token;
 const response=await fetch('https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails,snippet&id='+r.rows.map(e=>e.youtube_video_id).join(','),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Video verification HTTP '+response.status);
 const data=await response.json();for(const e of r.rows){const v=data.items?.find((x:any)=>x.id===e.youtube_video_id);if(!v)continue;
 const processing=v.processingDetails?.processingStatus;
 if(v.snippet?.channelId!==expectedChannel||v.status?.privacyStatus!=='private'||['failed','terminated'].includes(processing)||['rejected','failed','deleted'].includes(v.status?.uploadStatus)){await pool.query("UPDATE episodes SET status='BLOCKED',last_error='Private upload verification failed',updated_at=now() WHERE id=$1",[e.id]);continue;}
 if(processing==='succeeded'&&v.status?.uploadStatus==='processed'){await pool.query("UPDATE episodes SET status='READY',last_error=NULL,updated_at=now() WHERE id=$1",[e.id]);await pool.query("INSERT INTO audit_events(episode_id,event_type,details) VALUES($1,'PRIVATE_VIDEO_VERIFIED',$2)",[e.id,JSON.stringify({videoId:v.id,privacyStatus:v.status.privacyStatus,processingStatus:processing,containsSyntheticMedia:v.status.containsSyntheticMedia})]);console.log(JSON.stringify({event:'private_video_verified',episodeId:e.id,videoId:v.id}));}
 }
}
