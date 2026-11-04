import test from 'node:test';
import assert from 'node:assert/strict';
import {offlineApp} from './support/offline-app.mjs';

const load=()=>offlineApp().load('lib/payments/readWebhookBody.ts');

test('raw Unicode bytes remain exact across arbitrary streaming boundaries',async()=>{
 const bytes=new TextEncoder().encode('{"example":"café 📚 — human conversation"}');
 const stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=3)controller.enqueue(bytes.slice(i,i+3));controller.close();}});
 const request=new Request('https://offline.invalid/api/stripe/webhook',{method:'POST',body:stream,duplex:'half'});
 const result=await load().readWebhookBody(request);assert.deepEqual([...result],[...bytes]);assert.equal(request.body.locked,false);
});

test('oversized declared payloads are refused before touching their body',async()=>{
 let read=false;const request={headers:new Headers({'content-length':'1000001'}),get body(){read=true;throw Error('Must not read');}};
 await assert.rejects(load().readWebhookBody(request),error=>error.status===413);assert.equal(read,false);
});

test('chunked oversized payloads are canceled and release their reader',async()=>{
 let canceled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(600000));c.enqueue(new Uint8Array(400001));},cancel(){canceled=true;}});
 const request=new Request('https://offline.invalid/api/stripe/webhook',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(load().readWebhookBody(request),error=>error.status===413);assert.equal(canceled,true);assert.equal(request.body.locked,false);
});

test('a misleading smaller content length cannot bypass the actual byte bound',async()=>{
 const request=new Request('https://offline.invalid/api/stripe/webhook',{method:'POST',headers:{'content-length':'1'},body:'x'.repeat(1000001)});
 await assert.rejects(load().readWebhookBody(request),error=>error.status===413);
});

test('stream errors become generic failures rather than exposing the error payload',async()=>{
 const stream=new ReadableStream({start(c){c.error(Error('PRIVATE_PROVIDER_OR_CUSTOMER_DETAIL'));}});
 const request=new Request('https://offline.invalid/api/stripe/webhook',{method:'POST',body:stream,duplex:'half'});
 await assert.rejects(load().readWebhookBody(request),error=>error.status===400&&!error.message.includes('PRIVATE_'));assert.equal(request.body.locked,false);
});

test('transport shims without streams preserve UTF8 and enforce bytes rather than character count',async()=>{
 const {readWebhookBody}=load(),request={headers:new Headers(),body:null,text:async()=>'{"example":"📚"}'};
 assert.deepEqual([...await readWebhookBody(request)],[...new TextEncoder().encode(await request.text())]);
 await assert.rejects(readWebhookBody({...request,text:async()=>'📚'.repeat(250001)}),error=>error.status===413);
 assert.equal((await readWebhookBody({...request,text:async()=>''})).length,0);
});
