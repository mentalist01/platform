import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';

// Menus use viewport pixels, outside the scaled card. Opening one never changes
// the card's measured height, Yjs geometry, condition position or saved ink.
export default function PreparedCardPopover({label,title,icon,buttonText,children,disabled,locked=false,className=''}){
  const [open,setOpen]=useState(false),[placement,setPlacement]=useState(null);
  const anchor=useRef(null),popup=useRef(null),target=useFullscreenPortalTarget();
  useLayoutEffect(()=>{
    if(!open||!anchor.current||!popup.current)return;
    const position=()=>{
      if(!anchor.current?.isConnected){setOpen(false);return;}
      const rect=anchor.current.getBoundingClientRect(),menu=popup.current;
      const bounds=document.fullscreenElement?.getBoundingClientRect()||{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight};
      const width=Math.min(300,Math.max(180,bounds.right-bounds.left-24)),height=Math.min(menu.scrollHeight,bounds.bottom-bounds.top-28);
      const left=Math.max(bounds.left+12,Math.min(rect.right-width,bounds.right-width-12));
      const below=bounds.bottom-rect.bottom-10,above=rect.top-bounds.top-10;
      const upward=height>below&&above>below,space=Math.max(70,upward?above:below);
      const top=upward?Math.max(bounds.top+12,rect.top-Math.min(height,space)-7):rect.bottom+7;
      const style=getComputedStyle(anchor.current),theme=Object.fromEntries(['panel','bg','text','muted','line','accent','soft','green','green-bg'].map(key=>['--pt-'+key,style.getPropertyValue('--pt-'+key)]));
      setPlacement(previous=>{const next={...theme,left,top,width,maxHeight:space,fontFamily:style.fontFamily};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});
    };
    position();const observer=new ResizeObserver(position);observer.observe(popup.current);
    window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);};
  },[open,target]);
  useEffect(()=>{
    if(!open)return;
    popup.current?.querySelector('button:not([disabled]),a[href],select')?.focus({preventScroll:true});
    const outside=event=>{if(!anchor.current?.contains(event.target)&&!popup.current?.contains(event.target))setOpen(false);};
    const keyboard=event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);anchor.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',keyboard);};
  },[open]);
  return <><button ref={anchor} type="button" className={`prepared-materials-trigger ${className}`} title={title||label} aria-label={label} aria-expanded={!locked&&open} aria-disabled={locked||undefined} disabled={disabled} onClick={()=>{if(!locked){setPlacement(null);setOpen(value=>!value);}}}>{icon}{buttonText}</button>{createPortal(<div ref={popup} className="prepared-materials-popup" role="dialog" aria-label={label} hidden={!open} style={open?{...placement,visibility:placement?'visible':'hidden'}:undefined} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape'){setOpen(false);anchor.current?.focus();}}} onClick={event=>{if(event.target.closest('button,a')&&!event.target.closest('summary'))setOpen(false);}}>{children}</div>,target)}</>;
}
