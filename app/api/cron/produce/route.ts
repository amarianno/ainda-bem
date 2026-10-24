import { edition } from '../../../../lib/schedule';
import { pool } from '../../../../lib/db';
import { bearer,localDateParts } from '../../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:Request){
 if(!bearer(req,process.env.CRON_SECRET))return new Response('Unauthorized',{status:401});
 const e=edition();if(!e)return Response.json({skipped:'not a publication day'});
 const id=e.id,publishIso=e.publishAt;
 const result=await pool.query(`INSERT INTO episodes(id,target_publish_at,status) VALUES ($1,$2,'QUEUED') ON CONFLICT(id) DO NOTHING RETURNING id`,[id,publishIso]);
 if(result.rowCount){await pool.query('INSERT INTO audit_events(episode_id,event_type) VALUES($1,$2)',[id,'EPISODE_QUEUED']);}
 return Response.json({episodeId:id,created:!!result.rowCount,publicationEnabled:process.env.PUBLICATION_ENABLED==='true'});
}
