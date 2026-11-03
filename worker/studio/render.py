"""Source-preserving editorial assembly. python3 worker/studio/render.py manifest.json"""
import sys,json,math,subprocess,wave,hashlib
from pathlib import Path
from functools import lru_cache
import numpy as np
from PIL import Image,ImageDraw,ImageFont
from captions import captions,srt,norm

M=Path(sys.argv[1]).resolve();P=M.parent;d=json.loads(M.read_text())
W,H,FPS,SR=1280,720,25,48000
FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n):return ImageFont.truetype(FONT,n)
def local(path):
 p=Path(path).resolve()
 if not p.is_relative_to(Path(d['workRoot']).resolve()):raise ValueError('Media outside work root')
 return p
video,audio=local(d['video']),local(d['audio'])
durations=d['durations'];total=sum(durations);assert 0<total<=600
cs,words,warnings=captions(d['alignment'],durations,d.get('captionCorrections',{}))
if warnings:raise ValueError('Caption transcript requires reconciliation')
(P/'legendas.srt').write_text(srt(cs),encoding='utf8');(P/'captions.json').write_text(json.dumps(cs,ensure_ascii=False))
offsets=[0]
for x in durations:offsets.append(offsets[-1]+x)
def anchor(scene,phrase):
 hay=[norm(w['display']) for w in words[scene]];needle=[norm(x) for x in phrase.split()]
 for i in range(len(hay)-len(needle)+1):
  if hay[i:i+len(needle)]==needle:return offsets[scene]+words[scene][i]['start']
 raise ValueError('Actual spoken anchor missing')
events=[]
for item in d.get('inserts',[]):
 e={**item,'start':anchor(item['scene'],item['startPhrase']),'end':anchor(item['scene'],item['endPhrase'])}
 assert e['end']>e['start'];events.append(e)
for a,b in zip(sorted(events,key=lambda x:x['start']),sorted(events,key=lambda x:x['start'])[1:]):assert a['end']<=b['start']
def centered(draw,text,y,size,cx=260,color='#073c44'):
 f=font(size);box=draw.textbbox((0,0),text,font=f);x=cx-(box[2]-box[0])/2-box[0];draw.text((x,y),text,font=f,fill=color)
@lru_cache(None)
def editorial_card(index):
 e=events[index];p=Image.new('RGBA',(520,300),'#fff6e4');draw=ImageDraw.Draw(p);draw.rectangle((0,0,520,5),fill='#f8c853')
 centered(draw,e.get('label','FONTE DA MATÉRIA'),22,20)
 for i,line in enumerate(e.get('lines',[])):
  if font(27).getlength(line)>490:raise ValueError('Editorial card text too wide')
  centered(draw,line,80+i*42,27)
 centered(draw,e.get('credit',''),277,14)
 return p
images={}
for i,e in enumerate(events):
 if e['kind']=='image':
  p=local(e['path']);raw=p.read_bytes()
  if hashlib.sha256(raw).hexdigest()!=e['sha256']:raise ValueError('Image checksum mismatch')
  im=Image.open(p).convert('RGBA');im.thumbnail((1220,500));images[i]=im

cap_layers=[];bounds=[]
for c in cs:
 f=font(34);rows=[];line=''
 for token in c['text'].split():
  candidate=(line+' '+token).strip()
  if f.getlength(candidate)>1050 and line:rows.append(line);line=token
  else:line=candidate
 rows.append(line)
 if len(rows)>2:raise ValueError('Regroup long caption')
 layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer);y=549 if len(rows)==2 else 590
 for text in rows:
  box=draw.textbbox((0,0),text,font=f,stroke_width=1);width=box[2]-box[0];x=W/2-width/2-box[0];b=[W/2-width/2-16,y-6,W/2+width/2+16,y+43];bounds.append(b)
  if not (b[0]>=70 and b[2]<=1210 and b[1]>465 and b[3]<650):raise ValueError('Caption bounds invalid')
  draw.rounded_rectangle(b,radius=8,fill=(0,25,30,232));draw.text((x,y),text,font=f,fill='#fff7e6',stroke_width=1,stroke_fill='#163338');y+=44
 cap_layers.append(layer)

ticker_base=Image.new('RGBA',(W,59),'#11272c');draw=ImageDraw.Draw(ticker_base);draw.rectangle((0,0,189,59),fill='#00545a');draw.rectangle((0,0,W,3),fill='#f8c853');draw.text((19,12),'AINDA BEM!',font=font(22),fill='#fff7e6')
text='   •   '.join(d['ticker'])+'   •   ';tf=font(24);tw=math.ceil(tf.getlength(text));strip=Image.new('RGBA',(tw,56));ImageDraw.Draw(strip).text((0,10),text,font=tf,fill='#fff7e6')
def ticker(t):
 layer=ticker_base.copy();view=Image.new('RGBA',(1030,56));x=-round(t*48)%tw-tw
 for pos in [x,x+tw,x+2*tw]:view.alpha_composite(strip,(pos,0))
 layer.alpha_composite(view,(213,3));return layer

# Stream four seconds at a time so 7–8 minute episodes do not require full-track arrays.
with wave.open(str(audio),'rb') as source:
 assert source.getnchannels()==1 and source.getsampwidth()==2 and source.getframerate()==SR
 samples=source.getnframes();assert abs(samples/SR-total)<.02
 tracks={}
 try:
  for name in ['narracao','musica-original','mix']:
   w=wave.open(str(P/(name+'.wav')),'wb');w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);tracks[name]=w
  pos=0;beat=60/104
  while pos<samples:
   pcm=source.readframes(min(SR*4,samples-pos));voice=np.frombuffer(pcm,dtype='<i2').astype(np.float32)/32768;bed=np.zeros(len(voice),dtype=np.float32)
   for k in range(max(0,math.floor((pos/SR-.25)/beat)),math.ceil((pos+len(voice))/SR/beat)+1):
    start=round(k*beat*SR);left=max(pos,start);right=min(pos+len(voice),start+round(.25*SR))
    if right<=left:continue
    t=np.arange(left-start,right-start)/SR;tone=np.sin(2*np.pi*[130.8128,164.8138,195.9977,164.8138][k%4]*t)*np.exp(-15*t)*.012
    if k%2:
     noise=np.random.default_rng(42+k).normal(0,.0012,round(.25*SR));tone+=noise[left-start:right-start]*np.exp(-50*t)
    bed[left-pos:right-pos]+=tone.astype(np.float32)
   window=3840;padded=np.pad(voice,(0,(-len(voice))%window));rms=np.sqrt(np.mean(padded.reshape(-1,window)**2,axis=1));bed*=np.repeat(np.where(rms>.015,.22,.65),window)[:len(voice)]
   index=np.arange(pos,pos+len(voice));bed*=np.minimum(1,index/SR)*np.clip((samples-index)/(2*SR),0,1)
   for name,values in [('narracao',voice),('musica-original',bed),('mix',voice+bed)]:tracks[name].writeframes((np.clip(values,-1,1)*32767).astype('<i2').tobytes())
   pos+=len(voice)
 finally:
  for w in tracks.values():w.close()
meta=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(video)]));v=next(s for s in meta['streams'] if s['codec_type']=='video')
if v['height']!=720 or v['width'] not in [1278,1280]:raise ValueError('Unexpected source framing')
decoder=subprocess.Popen(['ffmpeg','-v','error','-i',str(video),'-vf','pad=1280:720:(ow-iw)/2:0,fps=25','-an','-pix_fmt','rgb24','-f','rawvideo','-'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
encoder=subprocess.Popen(['ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','1280x720','-r','25','-i','-','-an','-c:v','libx264','-crf','20','-preset','veryfast','-pix_fmt','yuv420p',str(P/'picture.mp4')],stdin=subprocess.PIPE)
count=math.ceil(total*FPS);ci=0
for frame in range(count):
 t=frame/FPS;raw=decoder.stdout.read(W*H*3)
 if len(raw)!=W*H*3:raise ValueError('Avatar ends before narration')
 im=Image.frombytes('RGB',(W,H),raw).convert('RGBA');hide_ticker=False
 for i,e in enumerate(events):
  if e['start']<=t<e['end']:
   if e['kind']=='image':
    # A factual image gets its own cutaway. Nothing is drawn over its text.
    im=Image.new('RGBA',(W,H),'#fff6e4');asset=images[i];im.alpha_composite(asset,((W-asset.width)//2,42));hide_ticker=e.get('hasEmbeddedText',True);dr=ImageDraw.Draw(im);dr.text((30,555),e.get('credit',''),font=font(18),fill='#073c44')
   else:im.alpha_composite(editorial_card(i),(730,165))
 if not hide_ticker:im.alpha_composite(ticker(t),(0,661))
 while ci<len(cs) and cs[ci]['end']<=t:ci+=1
 if ci<len(cs) and cs[ci]['start']<=t<cs[ci]['end']:im=Image.alpha_composite(im,cap_layers[ci])
 ImageDraw.Draw(im).text((858,16),'TESTE • APRESENTAÇÃO SINTÉTICA',font=font(15),fill='white',stroke_width=2,stroke_fill='#043e46')
 encoder.stdin.write(im.convert('RGB').tobytes())
encoder.stdin.close();assert encoder.wait()==0;decoder.terminate();decoder.stdout.close();decoder.wait()
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'picture.mp4'),'-i',str(P/'mix.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','160k','-ar','48000','-movflags','+faststart',str(P/'video.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-i',str(P/'video.mp4'),'-f','null','-'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
result={'audioSeconds':total,'durationSeconds':count/FPS,'frames':count,'captionCues':len(cs),'inserts':events,'captionBounds':bounds,'naturalPlaybackRate':1,'imageTextProtected':True,'listeningReview':'not_performed','continuousPlaybackReview':'not_performed'}
(P/'verification.json').write_text(json.dumps(result,ensure_ascii=False));print(json.dumps(result))
