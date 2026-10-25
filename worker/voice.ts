import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pool } from '../lib/db';
export const claraDelivery='Você é a apresentadora adulta Clara, do jornal Ainda Bem!. Fale em português brasileiro, com voz feminina adulta em registro médio-grave, timbre encorpado e caloroso, sorriso discreto na voz, energia positiva e presença. Preserve uma fala natural, com ressonância confortável, sem voz aguda, sopros excessivos, voz rouca forçada ou entonação cantada. Use entonação variada, ritmo ágil e conversado, pausas curtas e clareza nos números. O tom é de uma apresentadora bem-humorada compartilhando uma boa notícia: caloroso, confiante e curioso. Realce com leveza as frases de humor já presentes no texto. Não soe melancólica, solene, robótica, infantil ou como locução de propaganda. Não grite nem acrescente risadas ou palavras. Não imite nenhuma pessoa real.';
export function speechRequest(input:string,voice?:'sage'|'marin'){
 const speed=Number(process.env.OPENAI_TTS_SPEED||'1.05');if(!Number.isFinite(speed)||speed<0.8||speed>1.3)throw new Error('Invalid speech speed');
 return {model:process.env.OPENAI_TTS_MODEL||'gpt-4o-mini-tts',input,voice:voice||process.env.OPENAI_TTS_VOICE||'marin',speed,response_format:'mp3',instructions:claraDelivery};
}
export async function synthesize(input:string,voice?:'sage'|'marin'){
 const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(speechRequest(input,voice)),signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw new Error(`TTS HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer());
}
export async function runVoiceProbe(){
 const key=process.env.VOICE_PROBE_KEY;if(!key)return;
 if((await pool.query("SELECT 1 FROM audit_events WHERE event_type='VOICE_PROBE_STARTED' AND details->>'key'=$1",[key])).rowCount)return;
 await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_PROBE_STARTED',$1)",[JSON.stringify({key})]);
 try{
 const input='Oi! Eu sou a Clara, e este é o Ainda Bem! O mundo também dá certo — e a gente veio contar essa parte da história. Tem notícia do Brasil e do mundo, com contexto, fontes e um pouco de bom humor. Porque informação de qualidade também pode vir com um sorriso. Bora começar? Esta é uma amostra de voz sintética.';
 const audio=await synthesize(input);const dir=resolve(process.env.WORK_DIR||'work','voice-probe');await mkdir(dir,{recursive:true});const path=resolve(dir,'clara.mp3');await writeFile(path,audio);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'});if(probe.status!==0)throw new Error('Voice probe validation failed');const duration=Number(JSON.parse(probe.stdout).format.duration);if(duration<5||duration>90)throw new Error('Voice probe duration invalid');
 const request=speechRequest(input);await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_PROBE_READY',$1)",[JSON.stringify({key,voice:request.voice,model:request.model,speed:request.speed,duration,input,audioBase64:(await readFile(path)).toString('base64')})]);console.log(JSON.stringify({event:'voice_probe_ready',key,voice:request.voice,duration}));
 }catch(e){const raw=e instanceof Error?e.message:'Error';const error=/^[a-zA-Z0-9 .-]+$/.test(raw)?raw:'Voice generation failed';await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_PROBE_FAILED',$1)",[JSON.stringify({key,error})]);console.error(JSON.stringify({event:'voice_probe_failed',key,error}));}
}
export async function runVoiceAudition(){
 const key=process.env.VOICE_AUDITION_KEY;if(!key)return;
 if((await pool.query("SELECT 1 FROM audit_events WHERE event_type='VOICE_AUDITION_STARTED' AND details->>'key'=$1",[key])).rowCount)return;
 await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_AUDITION_STARTED',$1)",[JSON.stringify({key})]);
 try{
 const text='Oi! Eu sou a Clara, e esse é o Ainda Bem! Tem notícia boa no Brasil e no mundo — com fonte, contexto e um sorriso. Porque notícia boa também merece espaço. Bora começar? Esta é uma amostra de voz sintética.';
 const dir=resolve(process.env.WORK_DIR||'work','voice-audition');await mkdir(dir,{recursive:true});const candidates=[];
 for(const [i,voice] of (['sage','marin'] as const).entries()){
 const path=resolve(dir,`candidate-${i}.mp3`);await writeFile(path,await synthesize((i===0?'Opção um. ':'Opção dois. ')+text,voice));
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',path],{encoding:'utf8'});if(probe.status!==0)throw new Error('Voice audition validation failed');const duration=Number(JSON.parse(probe.stdout).format.duration);if(duration<5||duration>75)throw new Error('Voice audition duration invalid');candidates.push({voice,duration});
 }
 await writeFile(resolve(dir,'concat.txt'),"file 'candidate-0.mp3'\nfile 'candidate-1.mp3'\n");
 const output=resolve(dir,'clara-vozes.mp3');const concat=spawnSync('ffmpeg',['-y','-f','concat','-safe','0','-i',resolve(dir,'concat.txt'),'-c:a','libmp3lame','-b:a','128k',output],{stdio:'ignore'});if(concat.status!==0)throw new Error('Voice audition assembly failed');
 const duration=candidates.reduce((sum,c)=>sum+c.duration,0);await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_AUDITION_READY',$1)",[JSON.stringify({key,candidates,duration,input:text,audioBase64:(await readFile(output)).toString('base64')})]);console.log(JSON.stringify({event:'voice_audition_ready',key,candidates}));
 }catch(e){const raw=e instanceof Error?e.message:'Error';const error=/^[a-zA-Z0-9 .-]+$/.test(raw)?raw:'Voice audition failed';await pool.query("INSERT INTO audit_events(event_type,details) VALUES('VOICE_AUDITION_FAILED',$1)",[JSON.stringify({key,error})]);console.error(JSON.stringify({event:'voice_audition_failed',key,error}));}
}
