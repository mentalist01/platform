import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ClipboardList,Focus,Hand,Maximize2,Minimize2,Minus,Plus,X} from 'lucide-react';
import {preparedAssetUrl} from '../services/preparedLessonTasks.js';
import {preparedAnswerLayout} from '../utils/preparedAnswerTable.js';
import {preparedAnswerGroups} from '../utils/preparedAnswerGroups.js';
import {preparedSetSequence} from '../utils/preparedRunSources.js';
import {preparedTaskTitle} from '../utils/preparedTaskTitle.js';
import {preparedTheoryDropSetting} from '../utils/preparedTheoryLayout.js';
import {preparedTheoryCameraRange,preparedTheoryFrame} from '../utils/preparedTheoryDisplay.js';
import {preparedCardGeometry,preparedFocusReference,preparedLayoutKey,preparedPlacementRecipe,placePreparedCard} from '../utils/preparedSetLayout.js';

const clampZoom=value=>Math.max(.015,Math.min(3,value));
const fit=(box,viewport,limit=.85)=>{
  if(!box)return {x:0,y:0,scale:1};
  const scale=clampZoom(Math.min((viewport.width-56)/box.width,(viewport.height-56)/box.height,limit));
  return {scale,x:(viewport.width-box.width*scale)/2-box.x*scale,y:(viewport.height-box.height*scale)/2-box.y*scale};
};
const union=rows=>rows.reduce((frame,row)=>preparedTheoryFrame(frame,row)||row,null);

function canvasLayout(sequence,assets,notes) {
  const rows=[],items=[];
  for(const [index,card] of sequence.entries()){
    const id=preparedLayoutKey(card),anchorId='prepared-'+id;
    const theory=card.kind==='theory';
    const answerRows=card.answerGroups?preparedAnswerGroups(card).length:card.answerTable?preparedAnswerLayout(card).rows:Math.ceil(card.answers.length/2);
    const geometry=preparedCardGeometry(card,assets,answerRows);
    const size={width:geometry.width*geometry.scale,height:geometry.height*geometry.scale};
    const recipe=preparedPlacementRecipe(card,rows,sequence[index-1],rows.at(-1),{x:0,y:0});
    const row={...size,...placePreparedCard(items,recipe,size),id,key:id,anchorId,card,index,theory,
      referenceId:recipe.referenceId||recipe.sheetId||recipe.lastId,focusId:preparedFocusReference(recipe)};
    rows.push(row);items.push({...row,id:anchorId});
    for(const note of notes.filter(note=>note.rowId===row.id)){
      const right=note.placement==='right';
      items.push({...note,id:`note-${row.id}-${note.placement}`,x:right?row.x+row.width+24:row.x+24,
        y:right?row.y+44:row.y+row.height+24,width:right?220:Math.min(420,row.width),height:100});
    }
  }
  return {rows,notes:items.filter(item=>item.rowId)};
}

export default function PreparedSetCanvas({edit,onSetting,onEdit,onClose}) {
  const surface=useRef(null),gesture=useRef(null);
  const [expanded,setExpanded]=useState(false),[hand,setHand]=useState(false);
  const [selected,setSelected]=useState(''),[drag,setDrag]=useState(null);
  const [viewport,setViewport]=useState({width:900,height:500}),[view,setView]=useState(null);
  const [step,setStep]=useState(null),[playing,setPlaying]=useState(false),[notes,setNotes]=useState([]);
  const [imageSizes,setImageSizes]=useState({});
  const preview=step!==null;
  const sequence=useMemo(()=>preparedSetSequence(edit),[edit]);
  const assets=useMemo(()=>Object.fromEntries([
    ...(edit.theoryImageFiles||[]),...edit.tasks.flatMap(task=>task.imageFiles||[]),
    ...Object.values(imageSizes)
  ].filter(Boolean).map(asset=>[asset.id,asset])),[edit,imageSizes]);
  const layout=useMemo(()=>canvasLayout(sequence,assets,notes),[sequence,assets,notes]);
  const rows=preview?layout.rows.slice(0,step+1):layout.rows;
  const active=preview?rows.at(-1):rows.find(row=>row.id===selected)||rows[0];
  const reference=rows.find(row=>row.anchorId===active?.referenceId);
  const focusReference=rows.find(row=>row.anchorId===active?.focusId);
  const shot=preview&&preparedTheoryCameraRange(sequence,step);
  const frame=preview?(shot?union(layout.rows.slice(shot.from,shot.to+1)):preparedTheoryFrame(active,focusReference)||active):union(rows);
  const camera=view||fit(frame,viewport);
  const label=row=>row.theory?row.card.title:preparedTaskTitle(row.card,row.card.sourceIndex??edit.tasks.findIndex(task=>task.id===row.card.id));
  const currentSetting=row=>{
    if(row.card.boardDisplay)return row.card.boardDisplay;
    const legacy=row.card.theoryDisplay;
    if(!legacy)return {};
    const {relativeTo,...rest}=legacy;
    return {...rest,...(relativeTo?{relativeTo:`theory:${relativeTo}`}:{})};
  };
  const setting=active?currentSetting(active):{};
  useLayoutEffect(()=>{
    const node=surface.current;
    const observer=new ResizeObserver(([{contentRect:{width,height}}])=>setViewport({width,height}));
    observer.observe(node);
    node.focus({preventScroll:true});
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const escape=event=>{
      if(event.key!=='Escape')return;
      event.stopPropagation();
      if(expanded)setExpanded(false);else onClose();
    };
    window.addEventListener('keydown',escape,true);
    return ()=>window.removeEventListener('keydown',escape,true);
  },[expanded,onClose]);
  useEffect(()=>{
    if(!playing||step>=sequence.length-1)return;
    const timer=setTimeout(()=>{setView(null);setStep(step+1);},2300);
    return ()=>clearTimeout(timer);
  },[playing,step,sequence.length]);
  useEffect(()=>{
    const node=surface.current;
    const wheel=event=>{
      event.preventDefault();
      const rect=node.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
      setView(previous=>{
        const v=previous||fit(frame,viewport),scale=clampZoom(v.scale*Math.exp(-event.deltaY*.002));
        return {scale,x:x-(x-v.x)*scale/v.scale,y:y-(y-v.y)*scale/v.scale};
      });
    };
    node.addEventListener('wheel',wheel,{passive:false});
    return ()=>node.removeEventListener('wheel',wheel);
  },[frame?.x,frame?.y,frame?.width,frame?.height,viewport]);
  const zoom=by=>{
    const scale=clampZoom(camera.scale*by),x=viewport.width/2,y=viewport.height/2;
    setView({scale,x:x-(x-camera.x)*scale/camera.scale,y:y-(y-camera.y)*scale/camera.scale});
  };
  const goTo=delta=>{setPlaying(false);setView(null);setStep(Math.max(0,Math.min(sequence.length-1,step+delta)));};
  const begin=()=>{setStep(0);setNotes([]);setView(null);setPlaying(true);};
  const addNote=placement=>{
    if(!active||notes.some(note=>note.rowId===active.id&&note.placement===placement))return;
    setPlaying(false);setNotes([...notes,{rowId:active.id,placement}]);
  };
  const start=(event,row,resize=false)=>{
    const pan=event.button===1||event.button===2||hand||!row||preview;
    if(event.button!==0&&!pan)return;
    event.stopPropagation();
    event.preventDefault();
    surface.current.focus({preventScroll:true});
    if(row&&!pan)setSelected(row.id);
    if(!pan&&!resize&&row.index===0)return;
    surface.current.setPointerCapture(event.pointerId);
    gesture.current={pan,row,resize,camera,x:event.clientX,y:event.clientY};
  };
  const move=(event,commit=false)=>{
    const g=gesture.current;if(!g)return;
    const dx=(event.clientX-g.x)/g.camera.scale,dy=(event.clientY-g.y)/g.camera.scale;
    if(g.pan){setView({...g.camera,x:g.camera.x+dx*g.camera.scale,y:g.camera.y+dy*g.camera.scale});}
    else {
      const percent=Math.max(25,Math.min(200,Math.round((g.row.width+dx)/8.32)));
      if(!commit)setDrag({id:g.row.id,dx,dy,percent,resize:g.resize});
      else if(Math.hypot(dx,dy)*g.camera.scale>=3){
        setView(g.camera);
        const before=currentSetting(g.row);
        const next=g.resize?{...before,scalePercent:percent}
          :preparedTheoryDropSetting({x:g.row.x+dx,y:g.row.y+dy},rows.slice(0,g.row.index),before);
        if(next)onSetting(g.row.id,next);
      }
    }
    if(commit){gesture.current=null;setDrag(null);}
  };
  const selectRow=id=>{
    const row=rows.find(row=>row.id===id);
    setSelected(id);if(row)setView(fit(row,viewport,.8));
  };
  const setSetting=patch=>{setView(camera);onSetting(active.id,{...setting,...patch});};
  const orderIndex=active?.theory?edit.theoryImages.indexOf(active.card.images[0]):edit.tasks.findIndex(task=>task.id===active?.card.id);
  const taskNeighbors=active&&!active.theory?edit.tasks:[];
  const moveTask=direction=>{
    const tasks=[...edit.tasks],other=orderIndex+direction;
    const first=tasks[orderIndex],second=tasks[other];
    tasks[orderIndex]={...second,startsPart:first.startsPart};
    tasks[other]={...first,startsPart:second.startsPart};
    onEdit({tasks});
  };
  return <section className={`prepared-dialog prepared-set-builder${expanded?' is-expanded':''}`} role="dialog" aria-modal="true" aria-label="Конструктор набора">
    <header><div><small>Порядок показа и раскладка</small><h2>Конструктор набора</h2></div>
      <div className="prepared-set-builder-window">
        <button type="button" aria-pressed={expanded} aria-label={expanded?'Свернуть':'На весь экран'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize2 size={16}/>:<Maximize2 size={16}/>}<span>{expanded?'Свернуть':'На весь экран'}</span></button>
        <button type="button" aria-label="Закрыть конструктор" onClick={onClose}><X size={19}/></button>
      </div>
    </header>
    <div className="prepared-set-builder-tools">
      {preview?<><button type="button" onClick={()=>{setStep(null);setPlaying(false);setNotes([]);setView(null);}}>К конструктору</button>
        <button type="button" disabled={step===0} onClick={()=>goTo(-1)}>Назад</button>
        <strong aria-live="polite">{step+1} / {sequence.length}</strong>
        <button type="button" disabled={step>=sequence.length-1} onClick={()=>goTo(1)}>Следующая карточка</button>
        <button type="button" disabled={step>=sequence.length-1} onClick={()=>setPlaying(!playing)}>{playing&&step<sequence.length-1?'Пауза':'Продолжить'}</button>
        <button type="button" onClick={()=>addNote('below')}>Запись снизу</button>
        <button type="button" onClick={()=>addNote('right')}>Запись справа</button>
      </>:<><button type="button" className="prepared-primary" disabled={!sequence.length} onClick={begin}>Воспроизвести</button>
        <label>Карточка <select value={active?.id||''} onChange={event=>selectRow(event.target.value)}>{rows.map(row=><option value={row.id} key={row.id}>{row.index+1}. {label(row)}</option>)}</select></label>
        {active&&<label>Размер <input type="range" min="25" max="200" aria-label="Размер карточки" value={setting.scalePercent||100} onChange={event=>setSetting({scalePercent:Number(event.target.value)})}/><output>{setting.scalePercent||100}%</output></label>}
        {reference&&<><label>Опора <select value={reference.id} onChange={event=>setSetting({relativeTo:event.target.value,offset:undefined})}>{rows.slice(0,active.index).map(row=><option key={row.id} value={row.id}>{label(row)}</option>)}</select></label>
          <label>Положение <select value={setting.placement||'auto'} onChange={event=>setSetting({placement:event.target.value,offset:undefined})}><option value="auto">Автоматически</option><option value="below">Снизу</option><option value="right">Справа</option></select></label></>}
        {(active?.theory||reference)&&<label title={active.theory?'Авто сохраняет общий кадр, пока не закончится выбранный диапазон или блок. Листы открываются по очереди.':undefined}>Камера
          <select value={setting.focus||'next'} onChange={event=>setSetting({focus:event.target.value,nextCards:event.target.value==='range'?3:undefined})}>
            {active.theory&&<option value="next">Авто</option>}
            <option value={active.theory?'single':'next'}>Новая карточка</option>
            {(reference||setting.focus==='pair')&&<option value="pair">Новая и опорная</option>}
            {active.theory&&<><option value="block">Весь блок теории</option><option value="range">Текущая и следующие</option></>}
          </select>
        </label>}
        {active?.theory&&setting.focus==='range'&&<label>Следующих листов
          <select value={setting.nextCards??3} onChange={event=>setSetting({nextCards:Number(event.target.value)})}>
            {Array.from({length:7},(_,index)=><option key={index+1}>{index+1}</option>)}
          </select>
        </label>}
        {active?.card.boardDisplay&&<button type="button" onClick={()=>onSetting(active.id,null)}>Сбросить раскладку карточки</button>}
        {active?.theory&&edit.tasks.length>0&&<label>Показывать <select value={active.card.theoryBefore||''} onChange={event=>{
          const before=event.target.value,theoryPlacements={...edit.theoryPlacements};
          for(const image of active.card.images)theoryPlacements[image]=before;
          onEdit({theoryPlacements});
        }}><option value="">В начале набора</option>{edit.tasks.slice(1).map((task,index)=><option key={task.id} value={task.id}>Перед задачей «{preparedTaskTitle(task,index+1)}»</option>)}<option value="end">После задач</option></select></label>}
        {taskNeighbors.length>1&&<div className="prepared-set-builder-window" aria-label="Порядок задачи"><button type="button" aria-label="Показать задачу раньше" disabled={orderIndex<=0} onClick={()=>moveTask(-1)}><ArrowUp size={15}/></button><button type="button" aria-label="Показать задачу позже" disabled={orderIndex>=taskNeighbors.length-1} onClick={()=>moveTask(1)}><ArrowDown size={15}/></button></div>}
      </>}
    </div>
    <div ref={surface} className={`prepared-set-builder-surface${preview?' is-preview':''}${hand?' is-hand':''}`} tabIndex={0} aria-label="Холст конструктора"
      onContextMenu={event=>event.preventDefault()} onPointerDown={event=>start(event,null)} onPointerMove={event=>move(event)}
      onPointerUp={event=>move(event,true)} onPointerCancel={()=>{gesture.current=null;setDrag(null);}}
      onKeyDown={event=>{if(event.target===event.currentTarget&&['+','=', '-','0'].includes(event.key)){event.preventDefault();if(event.key==='0')setView(null);else zoom(event.key==='-'?1/1.25:1.25);}}}>
      <div className={`prepared-theory-world${preview&&!view?' is-following':''}`} style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}}>
        {rows.map(row=>{
          const movement=drag?.id===row.id?drag:null;
          const width=movement?.resize?movement.percent*8.32:row.width;
          const scale=width/640;
          const style={left:row.x+(movement&&!movement.resize?movement.dx:0),top:row.y+(movement&&!movement.resize?movement.dy:0),width,height:row.height*width/row.width};
          return <article className={`prepared-set-builder-card${row.theory?' is-theory':''}${!preview&&row.id===active?.id?' is-selected':''}`} key={row.id} style={style}
            onPointerDown={event=>start(event,row)}>
            <div className="prepared-set-builder-content" style={{transform:`scale(${scale})`}}>
              {!row.theory&&<header><ClipboardList size={16}/>{label(row)}<small>ЕГЭ №{row.card.sourceTaskNumber||edit.taskNumber}</small></header>}
              {!row.theory&&<div className="prepared-set-builder-answer">Ответ <span>Проверить</span></div>}
              {row.card.images.map((id,index)=><img key={id} loading="lazy" draggable={false}
                src={preparedAssetUrl(assets[id]?.url||`/api/lesson-task-assets/${id}`)} alt={`${label(row)}, изображение ${index+1}`}
                style={{height:assets[id]?.width?Math.min(900,Math.max(60,600*assets[id].height/assets[id].width)):400}}
                onLoad={event=>{
                  if(assets[id]?.width)return;
                  const {naturalWidth:width,naturalHeight:height}=event.currentTarget;
                  setImageSizes(previous=>({...previous,[id]:{id,width,height}}));
                }}/>)}
              {!row.card.images.length&&<p>Условие ещё не добавлено</p>}
            </div>
            {!preview&&<span className="prepared-set-builder-number">{row.index+1}</span>}
            {!preview&&row.id===active?.id&&<button type="button" className="prepared-theory-resize" tabIndex={-1} aria-label="Потяните, чтобы изменить размер карточки" onPointerDown={event=>start(event,row,true)}/>}
          </article>;
        })}
        {layout.notes.filter(note=>rows.some(row=>row.id===note.rowId)).map(note=><div className="prepared-theory-preview-note" key={note.id} style={{left:note.x,top:note.y,width:note.width,height:note.height}}>Пример записи</div>)}
      </div>
    </div>
    <div className="prepared-set-builder-bottom">
      <small>{preview?'Предпросмотр виден только вам.':'Перетаскивайте карточки и меняйте их размер за угол. Начало набора задаётся на доске.'}</small>
      <div className="prepared-set-builder-window">
        <button type="button" aria-pressed={hand} aria-label="Рука · перемещать холст" onClick={()=>setHand(!hand)}><Hand size={16}/></button>
        <button type="button" aria-label="Отдалить" onClick={()=>zoom(1/1.25)}><Minus size={16}/></button>
        <output>{Math.round(camera.scale*100)}%</output>
        <button type="button" aria-label="Приблизить" onClick={()=>zoom(1.25)}><Plus size={16}/></button>
        <button type="button" aria-label="Вписать в экран" onClick={()=>setView(null)}><Focus size={16}/></button>
      </div>
    </div>
  </section>;
}
