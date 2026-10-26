import {useEffect,useRef,useState} from 'react';
import {preparedAssetUrl} from '../services/preparedLessonTasks.js';

// Keep the original image box even before loading. The board's saved ink and
// answer controls must not move when an offscreen condition becomes visible.
export default function PreparedConditionImage({asset,alt}) {
  const image=useRef(null),[near,setNear]=useState(()=>typeof IntersectionObserver==='undefined');
  useEffect(()=>{
    const node=image.current;
    if(!node)return;
    if(typeof IntersectionObserver==='undefined')return;
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}
    },{rootMargin:'400px'});
    observer.observe(node);
    return()=>observer.disconnect();
  },[]);
  return <img ref={image} src={near?preparedAssetUrl(asset.url):'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='} alt={alt} draggable={false} decoding="async" data-condition-pending={near?undefined:'true'} style={{height:Math.min(900,600*asset.height/asset.width)}}/>;
}
