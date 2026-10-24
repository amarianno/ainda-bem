import { pool } from '../../../lib/db';
import { bearer } from '../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:Request){
 if(!bearer(req,process.env.ADMIN_SETUP_KEY))return new Response('Unauthorized',{status:401});
 const [episodes,auth,events,heartbeat]=await Promise.all([
  pool.query('SELECT id,status,target_publish_at,youtube_video_id,last_error,attempts,updated_at FROM episodes ORDER BY created_at DESC LIMIT 20'),
  pool.query("SELECT channel_id,updated_at FROM oauth_tokens WHERE provider='youtube'"),
  pool.query('SELECT episode_id,event_type,created_at FROM audit_events ORDER BY created_at DESC LIMIT 20'),
  pool.query("SELECT updated_at FROM worker_heartbeats WHERE id='renderer'")
 ]);
 return Response.json({channel:auth.rows[0]||null,episodes:episodes.rows,events:events.rows,workerLastSeen:heartbeat.rows[0]?.updated_at||null,publicationEnabled:false});
}
