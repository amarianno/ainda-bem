import { spawn,spawnSync } from 'node:child_process';
import { mkdir,readFile,writeFile,access } from 'node:fs/promises';
import { resolve,sep } from 'node:path';
import { createHash } from 'node:crypto';
import { validateEditorial } from '../lib/editorial';
import { pool } from '../lib/db';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function ffmpeg(args:string[]){await new Promise<void>((ok,no)=>{const c=spawn('ffmpeg',['-y',...args],{stdio:['ignore','ignore','pipe']});c.stderr.on('data',()=>{});c.on('error',no);c.on('close',x=>x===0?ok():no(new Error('FFmpeg failed')));});}
function wrap(text:string,width:number){const lines:string[]=[];let line='';for(const word of text.replace(/[\r\n]/g,' ').split(/\s+/)){if((line+' '+word).length>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);return lines.join('\n');}
export async function render(id:string,input:unknown){
 if(!/^ainda-bem-\d{4}-\d{2}-\d{2}(?:-v[1-9]\d*)?$/.test(id))throw new Error('Invalid edition');
 const s=validateEditorial(input),root=resolve(process.env.MEDIA_ROOT||'work/media');await mkdir(root,{recursive:true});const files:string[]=[];
 for(const v of s.visuals){const f=resolve(root,v.path);if(!f.startsWith(root+sep))throw new Error('Media outside root');
 try{await access(f);}catch{const r=await pool.query('SELECT data_base64 FROM media_assets WHERE sha256=$1',[v.sha256]);if(!r.rowCount)throw new Error('Approved media unavailable');const bytes=Buffer.from(r.rows[0].data_base64,'base64');if(hash(bytes)!==v.sha256)throw new Error('Media hash mismatch');await mkdir(resolve(f,'..'),{recursive:true});await writeFile(f,bytes);}
 if(hash(await readFile(f))!==v.sha256)throw new Error('Media hash mismatch');files.push(f);}
 const dir=resolve(process.env.WORK_DIR||'work',id);await mkdir(dir,{recursive:true});
 const scenes=s.scenes||[{headline:s.title,caption:'Edição piloto • Fontes na descrição',narration:s.narration}];
 for(const [i,scene] of scenes.entries()){
 const voice=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_TTS_MODEL,input:scene.narration,voice:process.env.OPENAI_TTS_VOICE||'alloy',response_format:'mp3',instructions:'Narre em português brasileiro, com dicção clara, tom jornalístico acolhedor e ritmo natural. Não imite pessoas reais.'}),signal:AbortSignal.timeout(120000)});
 if(!voice.ok)throw new Error(`TTS HTTP ${voice.status}`);await writeFile(`${dir}/voice-${i}.mp3`,Buffer.from(await voice.arrayBuffer()));
 await writeFile(`${dir}/headline-${i}.txt`,wrap(scene.headline,63));await writeFile(`${dir}/caption-${i}.txt`,wrap(scene.caption,88));
 const vf=`scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,drawbox=x=0:y=0:w=iw:h=102:color=0x003f49@0.94:t=fill,drawtext=textfile=${dir}/headline-${i}.txt:expansion=none:fontcolor=white:fontsize=30:x=28:y=18,drawbox=x=0:y=580:w=iw:h=140:color=0x003f49@0.94:t=fill,drawtext=textfile=${dir}/caption-${i}.txt:expansion=none:fontcolor=white:fontsize=24:x=28:y=592,drawtext=text='AINDA BEM! | AUDIOVISUAL SINTETICO | FONTES NA DESCRICAO':fontcolor=0xffce65:fontsize=16:x=28:y=690`;
 await ffmpeg(['-loop','1','-framerate','24','-i',files[0],'-i',`${dir}/voice-${i}.mp3`,'-vf',vf,'-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-shortest',`${dir}/scene-${i}.mp4`]);
 console.log(JSON.stringify({event:'scene_rendered',episodeId:id,scene:i+1,total:scenes.length}));
 }
 await writeFile(dir+'/concat.txt',scenes.map((_,i)=>`file 'scene-${i}.mp4'`).join('\n'));
 await ffmpeg(['-f','concat','-safe','0','-i',dir+'/concat.txt','-c','copy','-movflags','+faststart',dir+'/video.mp4']);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_name,width,height','-of','json',dir+'/video.mp4'],{encoding:'utf8'});if(probe.status!==0)throw new Error('Video probe failed');const info=JSON.parse(probe.stdout);if(!info.streams.some((x:any)=>x.codec_name==='h264'&&x.width===1280&&x.height===720)||!info.streams.some((x:any)=>x.codec_name==='aac')||Number(info.format.duration)<10)throw new Error('Video validation failed');
 return {path:dir+'/video.mp4',sha256:hash(await readFile(dir+'/video.mp4'))};
}
