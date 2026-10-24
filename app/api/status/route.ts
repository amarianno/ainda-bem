import { pool } from '../../../lib/db';
import { bearer } from '../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:Request){if(!bearer(req,process.env.ADMIN_SETUP_KEY))return new Response('Unauthorized',{status:401});const [episodes,auth]=await Promise.all([pool.query('SELECT id,status,target_publish_at,youtube_video_id FROM episodes ORDER BY created_at DESC LIMIT 20'),pool.query("SELECT channel_id,updated_at FROM oauth_tokens WHERE provider='youtube'")]);return Response.json({channel:auth.rows[0]||null,episodes:episodes.rows,publicationEnabled:false});}
