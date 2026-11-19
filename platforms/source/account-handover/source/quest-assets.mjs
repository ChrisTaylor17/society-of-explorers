import {readFile} from 'node:fs/promises';
const files=new Map([
  ['/quest/member-circle-page.mjs',['member-circle-page.mjs','text/javascript']],
  ['/quest/circle.html',['circle.html','text/html']],['/quest/circle-page.mjs',['circle-page.mjs','text/javascript']],
  ['/quest/circle-view.mjs',['circle-view.mjs','text/javascript']],['/quest/circle-host.mjs',['circle-host.mjs','text/javascript']],
  ['/quest/',['index.html','text/html']],['/quest/index.html',['index.html','text/html']],
  ['/quest/quest.css',['quest.css','text/css']],['/quest/quest-app.mjs',['quest-app.mjs','text/javascript']],
  ['/quest/xr-session.mjs',['xr-session.mjs','text/javascript']],['/quest/xr-room.mjs',['xr-room.mjs','text/javascript']],
  ['/quest/participation-dialog.mjs',['participation-dialog.mjs','text/javascript']],['/quest/modules/shared/participation.js',['modules/shared/participation.js','text/javascript']],
  ['/quest/modules/hash.js',['modules/hash.js','text/javascript']],['/quest/modules/shared/discussion.js',['modules/shared/discussion.js','text/javascript']],
]);
export async function readQuestAsset(pathname){const entry=files.get(pathname);if(!entry)return null;return {type:entry[1],body:await readFile(new URL('./quest/'+entry[0],import.meta.url),'utf8')};}
