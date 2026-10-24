import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { oauthClient } from '../../../../../lib/auth';
import { bearer } from '../../../../../lib/guards';
export const runtime='nodejs';
export async function GET(req:Request){
 if(!bearer(req,process.env.ADMIN_SETUP_KEY))return new Response('Unauthorized',{status:401});
 const state=randomBytes(32).toString('hex');
 const url=oauthClient().generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'],state});
 const res=NextResponse.redirect(url);res.cookies.set('oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/'});return res;
}

export async function POST(req:Request){if(!bearer(req,process.env.ADMIN_SETUP_KEY))return new Response('Unauthorized',{status:401});const state=randomBytes(32).toString('hex');const url=oauthClient().generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'],state});const res=NextResponse.json({url});res.cookies.set('oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/'});return res;}
