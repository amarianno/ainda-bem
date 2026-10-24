import { pool } from '../../../../lib/db';
import { bearer } from '../../../../lib/guards';
import { z } from 'zod';
export const runtime='nodejs';
const payload=z.object({episodeId:z.string().regex(/^ainda-bem-\d{4}-\d{2}-\d{2}$/),assetUrl:z.string().url(),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export async function POST(req:Request){
 if(!bearer(req,process.env.WORKER_CALLBACK_SECRET))return new Response('Unauthorized',{status:401});
 const parsed=payload.safeParse(await req.json().catch(()=>null));if(!parsed.success)return new Response('Bad payload',{status:400});
 const origins=(process.env.ASSET_ALLOWED_ORIGINS||'').split(',').filter(Boolean);if(!origins.includes(new URL(parsed.data.assetUrl).origin))return new Response('Asset origin denied',{status:400});
 const r=await pool.query(`UPDATE episodes SET render_asset_url=$2,status='VERIFYING',updated_at=now() WHERE id=$1 AND status='RENDERING' RETURNING id`,[parsed.data.episodeId,parsed.data.assetUrl]);
 if(!r.rowCount)return new Response('Invalid state',{status:409});
 await pool.query('INSERT INTO audit_events(episode_id,event_type,details) VALUES($1,$2,$3)',[parsed.data.episodeId,'RENDER_CALLBACK',JSON.stringify({sha256:parsed.data.sha256})]);
 return Response.json({accepted:true,requiresEditorialQualityGate:true});
}
