// Current participation SQL for browser regressions only. Preserve historical
// migration/audit fixtures and apply the additive candidates after their setup.
import {createHash} from 'node:crypto';
import {contributionSource} from './member-contributions-app.mjs';
const SQL=['circle-attendance-preflight.sql','circle-attendance-apply.sql','circle-membership-intent-preflight.sql','circle-membership-intent-apply.sql'];
export async function currentParticipationHashes(){
 const names=['verification/web/tests/support/current-native-participation.mjs',...SQL.map(name=>'docs/sql/'+name)];
 return Object.fromEntries(await Promise.all(names.map(async name=>[name,createHash('sha256').update(await contributionSource(name)).digest('hex')])));
}
export async function currentParticipation(fixture){
 try{for(const name of SQL)await fixture.db.exec((await contributionSource('docs/sql/'+name)).toString());return fixture;}
 catch(error){await fixture.close();throw error;}
}
