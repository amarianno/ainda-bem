import { google } from 'googleapis';
import { pool } from './db';
import { decrypt } from './crypto';
export const expectedChannel=process.env.EXPECTED_YOUTUBE_CHANNEL_ID||'UCX85MdRZ1IoRBlx0NWfhaVg';
export function oauthClient(){return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_REDIRECT_URI);}
export async function authorizedClient(){const r=await pool.query('select * from oauth_tokens where provider=$1',['youtube']);if(!r.rows.length) throw new Error('YouTube not authorized'); if(r.rows[0].channel_id!==expectedChannel) throw new Error('Unexpected channel');const client=oauthClient();client.setCredentials({refresh_token:decrypt(r.rows[0].refresh_token_ciphertext)});return client;}
