// Add the current once-per-CAS profile intent fence to historical native fixtures.
// The original profile migration and its audited semantics remain unchanged.
import {createHash} from 'node:crypto';
import {contributionSource} from './member-contributions-app.mjs';
const SQL=['member-profile-intent-preflight.sql','member-profile-intent-apply.sql'];
export async function currentProfileIntentHashes(){
 const names=['verification/web/tests/support/current-native-profile-intent.mjs',...SQL.map(name=>'docs/sql/'+name)];
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,createHash('sha256').update(await contributionSource(name)).digest('hex')])));
}
export async function currentProfileIntent(fixture){
 try{for(const name of SQL)await fixture.db.exec((await contributionSource('docs/sql/'+name)).toString());return fixture;}
 catch(error){await fixture.close();throw error;}
}
