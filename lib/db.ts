import { Pool } from 'pg';
export const pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true}:undefined});
