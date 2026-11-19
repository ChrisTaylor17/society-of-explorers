import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ClipPlayer from '../../../../app/clips/ClipPlayer';
function Probe(){
 const [clip,setClip]=useState(window.clipReview.clipA);
 useEffect(()=>{window.clipReview.replace=(value)=>setClip(value);},[]);
 // Deliberately keep the parent key stable across caption/metadata revisions.
 return <ClipPlayer key={`${clip.id}:${clip.media.sha256}`} clip={clip}/>;
}
const render=createRoot(document.getElementById('root')!);
window.clipReview.unmount=()=>render.unmount();
render.render(<Probe/>);
