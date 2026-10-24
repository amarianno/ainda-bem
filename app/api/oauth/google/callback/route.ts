import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { pool } from '../../../../../lib/db';
import { encrypt } from '../../../../../lib/crypto';
import { oauthClient,expectedChannel } from '../../../../../lib/auth';
import { equalSecret } from '../../../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const u=new URL(req.url),state=u.searchParams.get('state');
 if(!equalSecret(state,req.cookies.get('oauth_state')?.value))return new Response('Invalid OAuth state',{status:403});
 const code=u.searchParams.get('code');if(!code)return new Response('Missing code',{status:400});
 try {
  const client=oauthClient();const {tokens}=await client.getToken(code);client.setCredentials(tokens);
  const yt=google.youtube({version:'v3',auth:client});const response=await yt.channels.list({part:['id','snippet'],mine:true});
  const actual=response.data.items?.[0]?.id;if(actual!==expectedChannel)return new Response('Channel mismatch: no credentials saved',{status:403});
  if(!tokens.refresh_token)return new Response('No refresh_token; revoke prior grant and re-consent',{status:409});
  await pool.query(`INSERT INTO oauth_tokens (provider,channel_id,refresh_token_ciphertext,scopes) VALUES ($1,$2,$3,$4)
    ON CONFLICT(provider) DO UPDATE SET channel_id=EXCLUDED.channel_id,refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,scopes=EXCLUDED.scopes,updated_at=now()`,
   ['youtube',actual,encrypt(tokens.refresh_token),tokens.scope||'']);
  const res=NextResponse.json({authorized:true,channelId:actual});res.cookies.delete('oauth_state');return res;
 }catch(e){console.error('OAuth failed',e instanceof Error?e.message:'unknown');return new Response('OAuth failed',{status:500});}
}
