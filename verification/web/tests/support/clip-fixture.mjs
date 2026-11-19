import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {offlineApp} from './offline-app.mjs';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function wave(){
 const data=Buffer.alloc(44+16000);data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(8000,24);data.writeUInt32LE(16000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);data.writeUInt32LE(16000,40);
 for(let i=0;i<8000;i++)data.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/8000)*1000),44+i*2);return data;
}
export async function clipFixture(t){
 const project=await realpath(await mkdtemp(path.join(tmpdir(),'soe-clip-fixture-'))),root=path.join(project,'content/clips');await mkdir(root,{recursive:true});t.after(()=>rm(project,{recursive:true,force:true}));
 const app=offlineApp();app.context.process.cwd=()=>project;
 const source=Buffer.from('<!doctype html><p>Original synthetic tone fixture; no external assets.</p>'),bytes=wave(),captions=Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA quiet synthetic tone.\n');
 const file=async(name,data)=>{await writeFile(path.join(root,name),data);return{path:name,sha256:hash(data),bytes:data.length};};
 const entry={version:1,status:'catalog-approved',publishable:true,id:'synthetic-tone',kind:'audio',title:'A synthetic tone',description:'An offline fixture, not a community recording.',credit:'Original synthetic test content.',
  source:{kind:'first-party',...await file('source.html',source)},asset:{...await file('tone.wav',bytes),mime:'audio/wav',durationMs:1000},captions:{...await file('tone.vtt',captions),language:'en'},
  review:{mode:'automated-first-party',territories:['WORLDWIDE'],permissions:['display','excerpt','reencode','captions','commercial'],sourceStartMs:0,sourceEndMs:1000,checkedAt:'2026-11-04T00:00:00.000Z'}};
 const facts={version:1,assetSha256:entry.asset.sha256,sourceSha256:entry.source.sha256,captionsSha256:entry.captions.sha256,audioTracks:1,videoTracks:0,durationMs:1000,externalAssets:false,checks:['source-created-locally','tracks-inspected','captions-checked']};
 const inspect=async()=>{entry.inspection=await file('inspection.json',Buffer.from(JSON.stringify(facts)));};await inspect();
 const server=app.load('lib/clips/server.ts');
 return {app,server,entry,facts,root,project,bytes,captions,file,inspect};
}
