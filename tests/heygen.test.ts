import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HeygenClient,HeygenError,billingSnapshot,assertPilotBudget} from '../worker/heygen';
test('direct API uses API-key authentication and never retries a POST',async()=>{
 let calls=0;const mock=(async(url:any,init:any)=>{calls++;assert.equal(url,'https://api.heygen.com/v3/videos');assert.equal(init.headers['X-Api-Key'],'test-key');assert.equal(init.method,'POST');return new Response(JSON.stringify({error:{code:'insufficient_credits',message:'untrusted response'}}),{status:402});}) as typeof fetch;
 await assert.rejects(new HeygenClient('test-key',mock).call('/v3/videos',{type:'avatar'}),(e:any)=>e instanceof HeygenError&&e.code==='insufficient_credits'&&!e.message.includes('untrusted'));assert.equal(calls,1);
});
test('unknown balances and subscription credits cannot authorize API spending',()=>{
 assert.throws(()=>assertPilotBudget({billing_type:'subscription',subscription:{credits:15}},2));
 assert.throws(()=>assertPilotBudget({billing_type:'wallet',wallet:{currency:'usd',remaining_balance:null}},2));
 assert.throws(()=>assertPilotBudget({billing_type:'wallet',wallet:{currency:'usd',remaining_balance:1}},2));
 assert.equal(assertPilotBudget({billing_type:'wallet',wallet:{currency:'usd',remaining_balance:15}},2).balance,15);
});
test('billing snapshots exclude credentials and private profile data',()=>{
 assert.deepEqual(billingSnapshot({api_key:'secret',email:'private',billing_type:'wallet',wallet:{currency:'usd',remaining_balance:15,auto_reload:{enabled:false}}}),{billingType:'wallet',currency:'usd',balance:15,autoReload:false});
 assert.throws(()=>new HeygenClient(' key '));
});
test('audio asset uses real multipart file bytes with automatic boundary',async()=>{
 let calls=0;const mock=(async(url:any,init:any)=>{calls++;assert.equal(url,'https://api.heygen.com/v3/assets');assert.equal(init.headers['X-Api-Key'],'test-key');assert.equal(init.headers['Content-Type'],undefined);assert.equal(init.body.get('file').type,'audio/wav');assert.equal(await init.body.get('file').text(),'RIFFtest');return new Response(JSON.stringify({data:{asset_id:'verified-asset'}}));}) as typeof fetch;
 assert.equal((await new HeygenClient('test-key',mock).uploadAudio(Buffer.from('RIFFtest'))).asset_id,'verified-asset');assert.equal(calls,1);
});
