import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/ids/uuid';
import { main, page } from '@/lib/circles/ui';
import CircleAdmission from '../CircleAdmission';
export const metadata: Metadata={title:'Salon invitations',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function AdmissionPage({params}:{params:Promise<{circleId:string}>}) {
 const {circleId}=await params;if(!isUuid(circleId))notFound();
 return <div style={page}><main id="main" tabIndex={-1} style={main}><CircleAdmission circleId={circleId.toLowerCase()}/></main></div>;
}
