import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { main, page } from '@/lib/circles/ui';
import { reelDiscussionId } from '@/lib/clips/salon';
import { parseFellowshipTopic } from '@/lib/fellowship/topics';
import CircleAdmission from '../CircleAdmission';
export const metadata: Metadata={title:'Salon invitations',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function AdmissionPage({params,searchParams}:{params:Promise<{circleId:string}>;searchParams:Promise<{from?:string|string[];reel?:string|string[];fellowship?:string|string[]}>}) {
 const {circleId}=await params;if(!isUuid(circleId))notFound();
 const query=await searchParams,fromOnline=query.from==='online';
 const reel=query.fellowship===undefined?reelDiscussionId(query.reel):undefined;
 const fellowship=query.reel===undefined?parseFellowshipTopic(query.fellowship):undefined;
 return <div style={page}><main id="main" tabIndex={-1} style={main}><CircleAdmission circleId={circleId.toLowerCase()} fromOnline={fromOnline} reel={reel} fellowship={fellowship}/></main></div>;
}
