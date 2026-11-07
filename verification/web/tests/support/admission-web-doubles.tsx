import React from 'react';
export const circleHeaders=()=>window.admissionQa.credentials();
export const createClient=()=>({auth:{onAuthStateChange(listener:(event:string)=>void){return {data:{subscription:{unsubscribe:window.admissionQa.subscribe(listener)}}};}}});
export default function Link({prefetch: _prefetch,...props}:React.ComponentProps<'a'>&{prefetch?:boolean}){return <a {...props}/>;}
