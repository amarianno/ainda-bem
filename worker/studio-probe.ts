import { pool } from '../lib/db';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runStudio } from './studio';
export async function studioProbe(){
 const key=process.env.STUDIO_PROBE_KEY;if(!key||!/^[a-z0-9-]{1,80}$/.test(key))return;
 if((await pool.query("SELECT 1 FROM audit_events WHERE event_type='STUDIO_PROBE_STARTED' AND details->>'key'=$1",[key])).rowCount)return;
 await pool.query("INSERT INTO audit_events(event_type,details) VALUES('STUDIO_PROBE_STARTED',$1)",[JSON.stringify({key,newPaidCalls:0})]);
 try{
  const r=await pool.query("SELECT event_type,details FROM audit_events WHERE details->>'key'='ainda-bem-05-approved-v1' AND event_type IN ('TEST05_MASTER_READY','TEST05_ALIGNMENT_READY') ORDER BY created_at");
  const master=r.rows.find(x=>x.event_type==='TEST05_MASTER_READY')?.details,alignment=r.rows.filter(x=>x.event_type==='TEST05_ALIGNMENT_READY').sort((a,b)=>a.details.scene-b.details.scene).map(x=>x.details);
  if(!master||alignment.length!==5)throw new Error('SOURCE_CHECKPOINT_MISSING');
  const dir=resolve(process.env.WORK_DIR||'work','studio-probes',key);await mkdir(dir,{recursive:true});
  const image=await fetch('https://osasco.sp.gov.br/wp-content/uploads/2026/10/banner-site-formao-profissional-em-audiovisual-1000px-x-543px.png',{signal:AbortSignal.timeout(30000)});if(!image.ok)throw new Error('IMAGE_RETRIEVAL_FAILED');const bytes=Buffer.from(await image.arrayBuffer()),path=resolve(dir,'announcement.png');await writeFile(path,bytes);
  const source=resolve(process.env.WORK_DIR||'work','test05');
  const output=await runStudio(dir,{video:resolve(source,'aroll.mp4'),audio:resolve(source,'master.wav'),durations:master.sceneDurations,alignment,captionCorrections:{'0':{'1':'tampinha','22':'Pingo'},'1':{'6':'anunciou,','10':'2025,','27':'lacres','71':'ajudando:','72':'é'},'2':{'4':'prazo:','58':'Pingo','72':'bancada!'},'3':{'15':'outubro:'},'4':{'0':'Pingo,','1':'encerramos?','15':'manchetes;'}},ticker:['Ensaio técnico com os arquivos do teste aprovado','Nenhuma nova geração paga foi solicitada'],inserts:[{scene:2,startPhrase:'As inscrições',endPhrase:'A seleção',kind:'image',path,sha256:createHash('sha256').update(bytes).digest('hex'),hasEmbeddedText:true,credit:'Ensaio técnico • Divulgação / Prefeitura de Osasco • 14/10/2026'}]});
  await pool.query("INSERT INTO audit_events(event_type,details) VALUES('STUDIO_PROBE_READY',$1)",[JSON.stringify({key,newPaidCalls:0,path:output.path,sha256:output.sha256,verification:output.verification})]);
 }catch(e){await pool.query("INSERT INTO audit_events(event_type,details) VALUES('STUDIO_PROBE_FAILED',$1)",[JSON.stringify({key,code:e instanceof Error&&/^[A-Z_]+$/.test(e.message)?e.message:'ASSEMBLY_FAILED',newPaidCalls:0})]);}
}
