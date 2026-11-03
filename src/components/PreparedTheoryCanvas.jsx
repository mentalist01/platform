import {useEffect,useRef,useState} from 'react';
import {preparedAssetUrl} from '../services/preparedLessonTasks.js';
import {preparedTheoryFrame} from '../utils/preparedTheoryDisplay.js';
import {preparedTheoryCanvasLayout,preparedTheoryDropSetting} from '../utils/preparedTheoryLayout.js';

export default function PreparedTheoryCanvas({images,display,onSetting}) {
  const surface=useRef(null),gesture=useRef(null);
  const [assets,setAssets]=useState({}),[selected,setSelected]=useState(images[0]);
  const [viewport,setViewport]=useState({width:700,height:400}),[drag,setDrag]=useState(null);
  const [step,setStep]=useState(null),[playing,setPlaying]=useState(false),[notes,setNotes]=useState([]);
  const preview=step!==null;
  useEffect(()=>{
    const node=surface.current;
    const observer=new ResizeObserver(([{contentRect:{width,height}}])=>setViewport({width,height}));
    observer.observe(node);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!playing)return;
    if(step>=images.length-1)return;
    const timer=setTimeout(()=>setStep(step+1),2300);
    return()=>clearTimeout(timer);
  },[playing,step,images.length]);
  const layout=preparedTheoryCanvasLayout(images,assets,display,preview?notes:[]);
  const rows=preview?layout.rows.slice(0,step+1):layout.rows;
  const active=preview?rows.at(-1):rows.find(row=>row.id===selected)||rows[0];
  const reference=rows.find(row=>row.id===active?.referenceId);
  const frame=preview?(display[active?.id]?.focus==='pair'?preparedTheoryFrame(active,reference)||active:active):rows.reduce((box,row)=>preparedTheoryFrame(box,row)||row,null);
  const zoom=frame?Math.min((viewport.width-48)/frame.width,(viewport.height-48)/frame.height,preview?1:.65):1;
  const scale=Math.max(.01,zoom);
  const start=(event,row,resize)=>{
    if(preview||event.button!==0)return;
    event.stopPropagation();setSelected(row.id);
    if(!resize&&!row.referenceId)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current={row,resize,x:event.clientX,y:event.clientY,scale};
  };
  const move=(event,commit)=>{
    const g=gesture.current;if(!g)return;
    const dx=(event.clientX-g.x)/g.scale,dy=(event.clientY-g.y)/g.scale;
    const percent=Math.max(25,Math.min(200,Math.round((g.row.width+dx)/8.32)));
    if(!commit){setDrag({id:g.row.id,dx,dy,percent,resize:g.resize});return;}
    gesture.current=null;setDrag(null);
    if(Math.hypot(dx,dy)*g.scale<3)return;
    const setting=display[g.row.id];
    if(g.resize){onSetting(g.row.id,{...setting,scalePercent:percent});return;}
    const point={x:g.row.x+dx,y:g.row.y+dy};
    const next=preparedTheoryDropSetting(point,rows.filter(row=>row.index<g.row.index),setting);
    if(next)onSetting(g.row.id,next);
  };
  const begin=()=>{setStep(0);setPlaying(true);setNotes([]);};
  const navigate=delta=>{setPlaying(false);setStep(Math.max(0,Math.min(images.length-1,step+delta)));};
  const addNote=placement=>{
    if(!active||notes.some(note=>note.relativeTo===active.id&&note.placement===placement))return;
    setPlaying(false);setNotes([...notes,{relativeTo:active.id,placement}]);
  };
  return <section className="prepared-theory-canvas">
    <div className="prepared-theory-canvas-controls">
      {preview?<><button type="button" onClick={()=>{setStep(null);setPlaying(false);}}>К конструктору</button><button type="button" onClick={begin}>Сначала</button><button type="button" disabled={step===0} onClick={()=>navigate(-1)}>Назад</button><strong aria-live="polite">{step+1} / {images.length}</strong><button type="button" disabled={step>=images.length-1} onClick={()=>navigate(1)}>Следующий лист</button><button type="button" disabled={step>=images.length-1} onClick={()=>setPlaying(!playing)}>{playing?'Пауза':'Продолжить'}</button><button type="button" onClick={()=>addNote('below')}>Пример записи снизу</button><button type="button" onClick={()=>addNote('right')}>Пример записи справа</button></>:<>
        <button type="button" className="prepared-primary" onClick={begin}>Воспроизвести</button>
        <label>Лист <select value={active?.id} onChange={event=>setSelected(event.target.value)}>{rows.map(row=><option key={row.id} value={row.id}>{row.index+1}</option>)}</select></label>
        {active&&<label>Размер <input type="range" min="25" max="200" value={display[active.id]?.scalePercent||100} onChange={event=>onSetting(active.id,{...display[active.id],scalePercent:Number(event.target.value)})}/> {display[active.id]?.scalePercent||100}%</label>}
        {reference&&<label>Опора <select value={reference.id} onChange={event=>onSetting(active.id,{...display[active.id],relativeTo:event.target.value,offset:undefined})}>{rows.filter(row=>row.index<active.index).map(row=><option key={row.id} value={row.id}>Лист {row.index+1}</option>)}</select></label>}
        {reference&&<label>Положение <select value={display[active.id]?.placement||'auto'} onChange={event=>onSetting(active.id,{...display[active.id],placement:event.target.value,offset:undefined})}><option value="auto">Автоматически</option><option value="below">Снизу</option><option value="right">Справа</option></select></label>}
        {reference&&<label>Камера <select value={display[active.id]?.focus||'next'} onChange={event=>onSetting(active.id,{...display[active.id],focus:event.target.value})}><option value="next">Только новый лист</option><option value="pair">Новый и опорный листы</option></select></label>}
      </>}
    </div>
    <div ref={surface} className={`prepared-theory-surface${preview?' is-preview':''}`}>
      {frame&&<div className="prepared-theory-world" style={{transform:`translate(${(viewport.width-frame.width*scale)/2-frame.x*scale}px,${(viewport.height-frame.height*scale)/2-frame.y*scale}px) scale(${scale})`}}>
        {rows.map(row=>{
          const moving=drag?.id===row.id?drag:null;
          const width=moving?.resize?moving.percent*8.32:row.width;
          const style={left:row.x+(moving&&!moving.resize?moving.dx:0),top:row.y+(moving&&!moving.resize?moving.dy:0),width};
          return <div key={row.id} className={`prepared-theory-sheet${!preview&&row.id===active?.id?' is-selected':''}`} style={style} onPointerDown={event=>start(event,row,false)} onPointerMove={event=>move(event,false)} onPointerUp={event=>move(event,true)} onPointerCancel={()=>{gesture.current=null;setDrag(null);}}>
            {!preview&&<span>{row.index+1}</span>}
            <img src={preparedAssetUrl(`/api/lesson-task-assets/${row.id}`)} alt={`Лист теории ${row.index+1}`} draggable={false} style={{height:(row.height/row.width)*width,padding:`${13*width/640}px ${20*width/640}px ${15*width/640}px`}} onLoad={event=>{const {naturalWidth:width,naturalHeight:height}=event.currentTarget;setAssets(old=>old[row.id]?.width===width&&old[row.id]?.height===height?old:{...old,[row.id]:{width,height}});}}/>
            {!preview&&<button type="button" className="prepared-theory-resize" aria-label={`Изменить размер листа ${row.index+1}`} tabIndex={-1} onPointerDown={event=>start(event,row,true)}/>}
          </div>;
        })}
        {layout.notes.filter(note=>rows.some(row=>row.id===note.relativeTo)).map(note=><div className="prepared-theory-preview-note" key={note.id} style={{left:note.x,top:note.y,width:note.width,height:note.height}}>Пример записи на доске</div>)}
      </div>}
    </div>
    <small className="prepared-muted">{preview?'Предпросмотр виден только вам.':'Перетащите лист или потяните за угол. Первый лист задаёт начало блока.'}</small>
  </section>;
}
