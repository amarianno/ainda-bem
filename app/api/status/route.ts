import { pool } from '../../../lib/db';
import { bearer } from '../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:Request){
 if(!bearer(req,process.env.ADMIN_SETUP_KEY))return new Response('Unauthorized',{status:401});
 const [episodes,auth,events,heartbeat,readiness,studio]=await Promise.all([
  pool.query('SELECT id,status,target_publish_at,youtube_video_id,last_error,attempts,updated_at FROM episodes ORDER BY created_at DESC LIMIT 20'),
  pool.query("SELECT channel_id,updated_at FROM oauth_tokens WHERE provider='youtube'"),
  pool.query('SELECT episode_id,event_type,created_at FROM audit_events ORDER BY created_at DESC LIMIT 20'),
  pool.query("SELECT updated_at FROM worker_heartbeats WHERE id='renderer'"),
  pool.query("SELECT details,created_at FROM audit_events WHERE event_type='PRODUCTION_READINESS' ORDER BY created_at DESC LIMIT 1"),
  pool.query("SELECT event_type,created_at,details->>'code' AS code,details->'verification'->>'durationSeconds' AS duration_seconds FROM audit_events WHERE event_type IN ('STUDIO_PROBE_READY','STUDIO_PROBE_FAILED') ORDER BY created_at DESC LIMIT 1")
 ]);
 return Response.json({channel:auth.rows[0]||null,episodes:episodes.rows,events:events.rows,workerLastSeen:heartbeat.rows[0]?.updated_at||null,productionReadiness:readiness.rows[0]||null,studioCheck:studio.rows[0]||null,publicationEnabled:false});
}
