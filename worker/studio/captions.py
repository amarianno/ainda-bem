"""Phrase captions from actual ASR words and reviewed ASR punctuation."""
import re,unicodedata,json
from pathlib import Path

def norm(s):return ''.join(c for c in unicodedata.normalize('NFD',s.lower()) if c.isalnum() and not unicodedata.combining(c))
def captions(rows,durations,corrections):
 out=[];offset=0;words_by_scene=[];warnings=[]
 protected={}
 weak={'a','o','as','os','de','do','da','dos','das','em','no','na','nos','nas','com','para','e','que','uma','um'}
 for scene,row in enumerate(rows):
  ws=[dict(w) for w in row['words']]
  protected[scene]=[]
  months={'janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'}
  for j,w in enumerate(ws):
   if re.fullmatch(r'20\d{2}|19\d{2}',w['word']) and j>=4 and norm(ws[j-2]['word']) in months:protected[scene].append((j-4,j))
   if norm(w['word'])=='entre' and j+3<len(ws) and re.fullmatch(r'\d{4}',ws[j+1]['word']) and norm(ws[j+2]['word'])=='e':protected[scene].append((j,j+3))
  tokens=row['transcript'].split();ends={};joiners=set();pos=0
  for token in tokens:
   for m in re.finditer('-',token):joiners.add(pos+len(norm(token[:m.start()])))
   pos+=len(norm(token));p=re.search(r'([,.;:!?]+)[”"\)]?$',token)
   if p:ends[pos]=p.group(1)
  actual=''.join(norm(w['word']) for w in ws);expected=''.join(norm(t) for t in tokens)
  if actual!=expected:warnings.append({'scene':scene,'code':'TRANSCRIPT_WORD_TOKEN_DIFFERENCE','actual':actual,'expected':expected})
  cursor=0
  for i,w in enumerate(ws):
   cursor+=len(norm(w['word']));raw=w['word'];display=corrections.get(str(scene),{}).get(str(i),raw)
   override=str(i) in corrections.get(str(scene),{}) and re.search(r'[,.;:!?]$',display)
   w['display']=display if override else display.rstrip('.,;:!?')+ends.get(cursor,'')
   if cursor in joiners:w['display']+='-'
  words_by_scene.append(ws)
  group=[]
  for i,w in enumerate(ws):
   group.append(w);nextword=ws[i+1] if i+1<len(ws) else None
   elapsed=w['end']-group[0]['start'];punct=w['display'][-1:]
   pause=nextword and nextword['start']-w['end']>.3
   boundary=not any(a<=i<b for a,b in protected.get(scene,[]))
   meaningful=norm(w['display']) not in weak
   if nextword is None or (boundary and (punct in '.!?' or ((len(group)>=8 or (elapsed>2.4 and len(group)>=4) or (pause and elapsed>.8)) and meaningful))):
    start=offset+group[0]['start'];end=min(offset+durations[scene],offset+max(w['end']+.16,group[0]['start']+.45))
    if nextword:end=min(end,offset+nextword['start'])
    if end<=start:raise ValueError('Caption interval invalid')
    out.append({'start':start,'end':end,'text':' '.join(x['display'] for x in group).replace('- ','-'),'scene':scene,'first_word':i-len(group)+1,'last_word':i,'mode':'subtitle'});group=[]
  offset+=durations[scene]
 return out,words_by_scene,warnings

def srt(cues):
 def ts(t):
  m=round(t*1000);return f'{m//3600000:02}:{m//60000%60:02}:{m//1000%60:02},{m%1000:03}'
 return '\n\n'.join(f"{i+1}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}" for i,c in enumerate(cues))
