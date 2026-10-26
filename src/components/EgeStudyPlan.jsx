import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,Check,ChevronDown,Download,GripVertical,Hand,LayoutGrid,Map,Maximize2,Minus,Plus,Search,Undo2,X} from 'lucide-react';
import useEgeStudyPlan from '../hooks/useEgeStudyPlan.js';
import {STUDY_PLAN_IDS,STUDY_PLAN_TOPICS,STUDY_PLAN_SOURCE,STUDY_CARD,ORIGINAL_STUDY_ORDER,addStudyBlock,arrangeStudyPlan,completeStudyPlan,countStudyTasks,moveStudyBlock,dropStudyBlock,studyPlanBounds,studyPlanConnector} from '../utils/egeStudyPlan.js';
import useStudentStudyProgress from '../hooks/useStudentStudyProgress.js';
import {StudentStudyBadge,StudentStudyDialog} from './StudentStudyProgress.jsx';
import {studyBlockStatus} from '../utils/studentStudyProgress.js';
import StudyStageEditor from './StudyStageEditor.jsx';
import {studyPlanDisplay,studyPlanStages,studyStageFor,studyStageLabel,splitStudyStage,mergeStudyStages,withStudyStages} from '../utils/studyPlanStages.js';
import StudyStudentMatching from './StudyStudentMatching.jsx';
import {studyPlanSubjects,mergeStudyGroups} from '../utils/studySubjects.js';
import StudyStudentPicker from './StudyStudentPicker.jsx';
import StudyStudentBoardPreview from './StudyStudentBoardPreview.jsx';
import './EgeStudyPlan.css';
import './StudyPlanStudents.css';

const xml=value=>String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
const wrap=(value,size=25)=>{
  const lines=[''];
  for(const word of value.split(' ')){
    if((lines.at(-1)+' '+word).trim().length>size && lines.at(-1))lines.push('');
    lines[lines.length-1]=(lines.at(-1)+' '+word).trim();
  }
  return lines;
};
async function exportPlan(plan) {
  const {width,height}=studyPlanBounds(plan),offset=112,count=countStudyTasks(plan.order);plan=studyPlanDisplay(plan);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height+offset+45}" viewBox="0 0 ${width} ${height+offset+45}">
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="#a78bfa" stroke-width="2"/></marker></defs>
    <rect width="100%" height="100%" fill="#f6f5fc"/><text x="60" y="42" font-family="Arial" font-size="12" fill="#7c3aed" letter-spacing="2">IVAN100 · ЕГЭ 2027</text>
    <text x="60" y="80" font-family="Arial" font-size="30" font-weight="bold" fill="#25223e">${xml(plan.title)}</text>
    <text x="${width-60}" y="80" text-anchor="end" font-family="Arial" font-size="14" fill="#706b87">${count} / 27 заданий</text>
    <g transform="translate(0 ${offset})">${plan.order.slice(1).map((id,i)=>`<path d="${studyPlanConnector(plan.blocks[plan.order[i]],plan.blocks[id])}" fill="none" stroke="#c4b5fd" stroke-width="2" marker-end="url(#arrow)"/>`).join('')}
    ${plan.order.map((id,i)=>{const b=plan.blocks[id];return `<g transform="translate(${b.x} ${b.y})"><rect width="284" height="164" rx="18" fill="white" stroke="#ddd6f5"/><rect x="16" y="16" width="${id==='19–21'?76:46}" height="40" rx="12" fill="#eee7fe"/><text x="${id==='19–21'?54:39}" y="43" text-anchor="middle" font-family="Arial" font-size="21" font-weight="bold" fill="#7c3aed">${xml(b.blockId||id)}</text><text x="264" y="35" text-anchor="end" font-family="Arial" font-size="11" fill="#8c85a3">ШАГ ${i+1}</text>${wrap(b.title).slice(0,2).map((line,j)=>`<text x="18" y="${83+j*23}" font-family="Arial" font-size="18" font-weight="bold" fill="#302b47">${xml(line)}</text>`).join('')}<text x="18" y="144" font-family="Arial" font-size="12" fill="#7c738e">${xml(b.parts.length?studyStageLabel(b):b.note?b.note.slice(0,36):'ЕГЭ по информатике')}</text></g>`;}).join('')}</g>
    <text x="60" y="${height+offset+20}" font-family="Arial" font-size="12" fill="#827c97">Нумерация по проекту ФИПИ · 2027</text></svg>`;
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try {
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');
    const scale=Math.min(2,7000/Math.max(width,height+offset+45));
    canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil((height+offset+45)*scale);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('Не удалось создать картинку');
    const link=document.createElement('a'),download=URL.createObjectURL(blob);
    link.href=download;link.download='План подготовки ЕГЭ-2027.png';link.click();
    setTimeout(()=>URL.revokeObjectURL(download),10000);
  }finally{URL.revokeObjectURL(url);}
}

export default function EgeStudyPlan({teacherId,students=[],groups=[],groupsLoading=false,onGroupsChanged,renderStudentBoard}) {
  const [studentId,setStudentId]=useState(''),[studyDialog,setStudyDialog]=useState(false);
  const [previewStudent,setPreviewStudent]=useState(null),[inspectedPage,setInspectedPage]=useState('');
  const study=useStudentStudyProgress(teacherId),studentRecord=study.records[studentId];
  const allGroups=mergeStudyGroups(groups,study.groups||[]),{subjects}=studyPlanSubjects(students,allGroups);
  const [matching,setMatching]=useState(false);
  const target=subjects.find(subject=>subject.id===studentId);
  const viewBoard=id=>{const subject=subjects.find(subject=>subject.id===id);if(!subject)return;setStudentId(id);setSelected(null);setInspectedPage('');setPreviewStudent(subject);};
  const {plan,change,status,error,save,load,recovery,recover,discardRecovery,conflict,resolveConflict}=useEgeStudyPlan(teacherId);
  const [selected,setSelected]=useState(null),[zoom,setZoom]=useState(1),[query,setQuery]=useState('');
  const [history,setHistory]=useState([]),[dragging,setDragging]=useState(null),[draftPosition,setDraftPosition]=useState(null);
  const [exporting,setExporting]=useState(false),[notice,setNotice]=useState(''),[options,setOptions]=useState(false);
  const viewport=useRef(null),drag=useRef(null),initialized=useRef(false),previousPlan=useRef(null);
  const remember=next=>{
    if(next===plan)return;
    setHistory(items=>[...items,plan].slice(-30));change(next);
  };
  const route=plan?studyPlanDisplay(plan):null;
  const updateBlock=(id,patch)=>{
    const topic=studyStageFor(plan,id)?.blockId||id;
    let next={...plan,blocks:{...plan.blocks,[topic]:{...plan.blocks[topic],...patch}}};
    if(next.stages&&patch.parts&&patch.parts.length!==plan.blocks[topic].parts.length){const last=next.stages.filter(stage=>stage.blockId===topic).at(-1);next={...next,stages:next.stages.map(stage=>stage.id===last.id?{...stage,toPart:Math.max(1,patch.parts.length)}:stage)};}
    remember(next);
  };
  const bounds=plan?studyPlanBounds(plan):{width:1400,height:1200};
  const displayPlan=route && draftPosition?{...route,blocks:{...route.blocks,[dragging]:{...route.blocks[dragging],...draftPosition}}}:route;
  const fit=(all=false)=>{
    if(!viewport.current)return;
    const rect=viewport.current.getBoundingClientRect();
    setZoom(Math.max(.2,Math.min(1,(rect.width-24)/bounds.width,...(all?[(rect.height-24)/bounds.height]:[]))));
    viewport.current.scrollTo({top:0,left:0,behavior:'smooth'});
  };
  useEffect(()=>{
    if(!plan || initialized.current || !viewport.current)return;
    initialized.current=true;
    const rect=viewport.current.getBoundingClientRect();
    setZoom(Math.max(.75,Math.min(1,(rect.width-24)/studyPlanBounds(plan).width)));
  },[plan]);
  useEffect(()=>{
    // A remote copy replaces local history, so undo cannot silently revive overwritten edits.
    if(previousPlan.current && plan && plan.revision>previousPlan.current.revision)setHistory([]);
    previousPlan.current=plan;
  },[plan]);
  const pointerDown=(event,id)=>{
    if(event.button!==0 || event.target.closest('button'))return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    const block=route.blocks[id];
    drag.current={id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:block.x,startY:block.y,moved:false};
  };
  const pointerMove=event=>{
    const current=drag.current;
    if(!current || current.pointerId!==event.pointerId)return;
    const dx=(event.clientX-current.x)/zoom,dy=(event.clientY-current.y)/zoom;
    if(!current.moved && Math.hypot(dx,dy)<4)return;
    current.moved=true;
    current.position={x:Math.round(Math.max(16,Math.min(15000,current.startX+dx))),y:Math.round(Math.max(16,Math.min(15000,current.startY+dy)))};
    setDragging(current.id);setDraftPosition(current.position);
  };
  const pointerUp=event=>{
    const current=drag.current;
    if(!current || current.pointerId!==event.pointerId)return;
    drag.current=null;
    if(current.moved)remember(dropStudyBlock(plan,current.id,current.position));
    else setSelected(current.id);
    setDragging(null);setDraftPosition(null);
  };
  const panStart=event=>{
    if(event.button!==0 || event.target.closest('.study-plan__block') || event.target.closest('button'))return;
    const pane=viewport.current, x=event.clientX,y=event.clientY,left=pane.scrollLeft,top=pane.scrollTop;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={pan:true,x,y,left,top,pointerId:event.pointerId};
  };
  const panMove=event=>{const d=drag.current;if(d?.pan && d.pointerId===event.pointerId){viewport.current.scrollLeft=d.left+d.x-event.clientX;viewport.current.scrollTop=d.top+d.y-event.clientY;}};
  const add=id=>{remember(addStudyBlock(plan,id));setSelected(id);setNotice(`Задание ${id} добавлено в конец маршрута`);};
  const stage=plan&&studyStageFor(plan,selected),topicId=stage?.blockId||selected;
  const active=topicId&&plan?.blocks[topicId],siblings=plan?studyPlanStages(plan).filter(row=>row.blockId===topicId).length:0;
  const bank=STUDY_PLAN_IDS.filter(id=>!plan?.order.includes(id));
  const filtered=bank.filter(id=>`${id} ${plan?.blocks[id].title}`.toLowerCase().includes(query.toLowerCase()));
  const onCanvas=route?.order.includes(selected);
  return <section className="study-plan" aria-label="План подготовки к ЕГЭ">
    <header className="study-plan__heading"><div className="study-plan__eyebrow"><Map size={14}/> ЛИЧНЫЙ МАРШРУТ · ЕГЭ 2027</div>
      <div className="study-plan__title-row"><div><h1>План подготовки</h1><p>Собери свой маршрут. Перемещай блоки, меняй порядок и добавляй части.</p></div>
        <div className="study-plan__heading-actions"><span className={`study-plan__save is-${status}`} role="status">{status==='saved'?<Check size={14}/>:null}{({loading:'Загружаем…',saved:'Сохранено в аккаунте',saving:'Сохраняем…',dirty:'Есть изменения',error:'Не сохранено'})[status]}</span>
          <button type="button" className="study-plan__primary" disabled={!plan || exporting || !plan.order.length} onClick={async()=>{setExporting(true);try{await exportPlan(plan);setNotice('Картинка плана скачана');}catch(e){setNotice(e.message);}finally{setExporting(false);}}}><Download size={16}/>{exporting?'Создаём…':'Скачать PNG'}</button></div></div>
    </header>
    {recovery && <div className="study-plan__banner">На этом устройстве остались несохранённые изменения.<button onClick={recover}>Восстановить</button><button onClick={discardRecovery}>Оставить план из аккаунта</button></div>}
    {error && <div className="study-plan__banner is-error" role="alert">{error}{conflict?<><button onClick={()=>resolveConflict(true)}>Сохранить мою версию</button><button onClick={()=>resolveConflict(false)}>Загрузить с сервера</button></>:<button onClick={()=>void(plan?save():load())}>Повторить</button>}</div>}
    {!plan ? <div className="study-plan__loading">{status==='loading'?'Открываем холст…':'План пока не загружен'}</div>:<>
      <div className="student-study-plan-pupil"><StudyStudentPicker loading={groupsLoading} students={subjects} studentId={studentId} onSelect={id=>{if(id)viewBoard(id);else{setStudentId('');setSelected(null);setInspectedPage('');}}}/>{target?<div className="study-pupil-current"><StudentStudyBadge teacherId={teacherId} studentId={studentId} onContinue={()=>viewBoard(studentId)}/><button type="button" className="study-pupil-board-button" onClick={()=>viewBoard(studentId)}>Посмотреть доску</button></div>:<p className="study-plan__muted">Один маршрут — отдельные отметки для учеников и групп.</p>}{target&&<div className="student-study-legend"><span>Пройдено</span><span>Сейчас проходим</span><span>Впереди</span></div>}</div>
      <div className="study-matching-intro"><div><strong>Кого можно объединить?</strong><span>Сравните индивидуальных учеников по текущей теме и части плана.</span></div><button type="button" onClick={()=>setMatching(value=>!value)} aria-expanded={matching}>{matching?'Свернуть подбор':'Подобрать пары и группы'}</button></div>
      {matching&&<StudyStudentMatching teacherId={teacherId} students={students} groups={allGroups} plan={plan} records={study.records} loading={study.loading||groupsLoading} onInspect={viewBoard} onGroupsChanged={onGroupsChanged}/>}
      <div className="study-plan__workspace">
        <div className="study-plan__main">
          <div className="study-plan__toolbar"><div className="study-plan__progress"><strong>{countStudyTasks(plan.order)}<span>/27</span></strong><span>заданий в плане</span><div><i style={{width:`${countStudyTasks(plan.order)/27*100}%`}}/></div></div>
            <div className="study-plan__tools"><button type="button" onClick={()=>remember(arrangeStudyPlan(plan))} title="Выровнять блоки по порядку маршрута"><LayoutGrid size={15}/><span>Упорядочить</span></button>
              <button type="button" disabled={!history.length} onClick={()=>{change(history.at(-1));setHistory(items=>items.slice(0,-1));}} title="Отменить последнее изменение" aria-label="Отменить изменение"><Undo2 size={16}/></button>
              <div className="study-plan__options"><button type="button" onClick={()=>setOptions(!options)} aria-expanded={options} aria-label="Шаблоны плана"><ChevronDown size={16}/></button>{options&&<div className="study-plan__menu"><button onClick={()=>{remember(arrangeStudyPlan(plan.stages?withStudyStages(plan,ORIGINAL_STUDY_ORDER.flatMap(id=>studyPlanStages(plan).filter(stage=>stage.blockId===id))):{...plan,order:[...ORIGINAL_STUDY_ORDER]}));setOptions(false);}}>Твой исходный порядок</button><button onClick={()=>{remember(completeStudyPlan(plan));setOptions(false);}}>Добавить все задания</button></div>}</div>
            </div>
          </div>
          <div ref={viewport} className={`study-plan__viewport ${dragging?'is-dragging':''}`} onPointerDown={panStart} onPointerMove={panMove} onPointerUp={()=>{if(drag.current?.pan)drag.current=null;}} onPointerCancel={()=>{drag.current=null;setDragging(null);setDraftPosition(null);}}>
            <div className="study-plan__extent" style={{width:bounds.width*zoom,height:bounds.height*zoom}}>
              <div className="study-plan__world" style={{width:bounds.width,height:bounds.height,transform:`scale(${zoom})`}}>
                <svg className="study-plan__connectors" width={bounds.width} height={bounds.height} aria-hidden="true"><defs><marker id="study-route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10" fill="none" stroke="currentColor" strokeWidth="2"/></marker></defs>{route.order.slice(1).map((id,i)=><path key={id} d={studyPlanConnector(displayPlan.blocks[route.order[i]],displayPlan.blocks[id])} markerEnd="url(#study-route-arrow)"/>)}</svg>
                {route.order.map((id,i)=>{const block=displayPlan.blocks[id],studyStatus=studentId?studyBlockStatus(plan,studentRecord,block.blockId,block):'';return <div key={id} className={`study-plan__block ${studentId?`is-study-${studyStatus}`:''} ${selected===id?'is-selected':''} ${dragging===id?'is-dragging':''} ${['1','2','6','10','12','15','23'].includes(id)?'is-extra':''}`} style={{left:block.x,top:block.y,width:STUDY_CARD.width,height:STUDY_CARD.height}}
                  onPointerDown={e=>pointerDown(e,id)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{drag.current=null;setDragging(null);setDraftPosition(null);}}>
                  <div className="study-plan__block-top"><span className="study-plan__number">{block.blockId}</span><span>ШАГ {String(i+1).padStart(2,'0')}</span><GripVertical size={15}/></div>
                  <button type="button" className="study-plan__block-title" onClick={()=>setSelected(id)} aria-label={`Настроить задание ${block.blockId}, ${studyStageLabel(block)}: ${block.title}`}>{block.title}</button>
                  <div className="study-plan__block-bottom">{studentId&&studyStatus!=='future'?<span className="study-plan__study-state">{studyStatus==='completed'?'✓ Пройдено':`Сейчас · ${plan.blocks[block.blockId].parts[studentRecord?.current?.partNumber-1]||`часть ${studentRecord?.current?.partNumber||1}`}`}</span>:block.parts.length?<><span className="study-plan__dots">{block.parts.slice(0,8).map((_,j)=><i key={j}/>)}</span><span>{siblings>1&&block.blockId===topicId||studyPlanStages(plan).filter(stage=>stage.blockId===block.blockId).length>1?studyStageLabel(block):`${block.parts.length} ${block.parts.length===1?'часть':block.parts.length<5?'части':'частей'}`}</span></>:<span>{block.note?'Есть заметка':id==='5'||id==='8'?'Части можно добавить':'ЕГЭ по информатике'}</span>}</div>
                </div>;})}
                {!plan.order.length&&<div className="study-plan__empty">Добавь первое задание из списка справа</div>}
              </div>
            </div>
          </div>
          <div className="study-plan__canvas-footer"><span><Hand size={14}/> Тащи блоки или свободное место холста</span><div><button onClick={()=>setZoom(value=>Math.max(.2,Math.round((value-.1)*100)/100))} aria-label="Уменьшить масштаб"><Minus size={16}/></button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(value=>Math.min(1.6,Math.round((value+.1)*100)/100))} aria-label="Увеличить масштаб"><Plus size={16}/></button><button onClick={()=>fit(true)} title="Показать весь план" aria-label="Показать весь план"><Maximize2 size={16}/></button></div></div>
        </div>
        <aside className="study-plan__sidebar" aria-label="Настройки маршрута">
          {active?<><div className="study-plan__panel-heading"><span>ЗАДАНИЕ {topicId}</span><button onClick={()=>setSelected(null)} aria-label="Закрыть настройки задания"><X size={17}/></button></div>
            {studentId&&onCanvas&&<div className="student-study-plan-actions"><p className="study-plan__muted">{target?.name} · №{topicId}</p><button type="button" className="study-plan__primary" onClick={()=>{setInspectedPage('');setStudyDialog(true);}}><Map size={15}/>Связать страницу / отметить этап</button></div>}
            <label className="study-plan__field">Название<input maxLength={100} value={active.title} onChange={e=>updateBlock(selected,{title:e.target.value})} onBlur={()=>{if(!active.title.trim())updateBlock(selected,{title:STUDY_PLAN_TOPICS[topicId]});}}/></label>
            {onCanvas&&stage.toPart>stage.fromPart||onCanvas&&siblings>1?<StudyStageEditor key={`${stage.id}:${stage.toPart}`} stage={stage} siblings={siblings} onSplit={after=>{remember(arrangeStudyPlan(splitStudyStage(plan,selected,after)));setNotice('Тема разделена. Перетащите каждый этап на нужное место в маршруте.');}} onMerge={()=>{remember(arrangeStudyPlan(mergeStudyStages(plan,topicId)));setSelected(topicId);}}/>:null}
            <div className="study-plan__parts-heading"><h3>Части задания</h3><span>{active.parts.length}/16</span></div>
            <div className="study-plan__parts">{active.parts.map((part,i)=><div key={i}><span>{i+1}</span><input aria-label={`Название части ${i+1}`} value={part} maxLength={100} placeholder={`Часть ${i+1}`} onChange={e=>{const next=[...active.parts];next[i]=e.target.value;updateBlock(selected,{parts:next});}}/><button disabled={siblings>1} title={siblings>1?'Сначала соберите тему в один этап':undefined} aria-label={`Убрать часть ${i+1}`} onClick={()=>updateBlock(selected,{parts:active.parts.filter((_,j)=>j!==i)})}><X size={14}/></button></div>)}</div>
            {!active.parts.length&&<p className="study-plan__muted">Оставь цельным или раздели на темы, которые проходите отдельно.</p>}
            <button className="study-plan__add-part" disabled={active.parts.length>=16} onClick={()=>updateBlock(selected,{parts:[...active.parts,`Часть ${active.parts.length+1}`]})}><Plus size={15}/> Добавить часть</button>
            <label className="study-plan__field">Заметка<textarea maxLength={1000} rows={3} value={active.note} onChange={e=>updateBlock(selected,{note:e.target.value})} placeholder="Что важно пройти в этой теме"/></label>
            {onCanvas?<><div className="study-plan__sequence-controls"><button disabled={route.order[0]===selected} onClick={()=>remember(moveStudyBlock(plan,selected,-1))}><ArrowUp size={15}/> Раньше</button><button disabled={route.order.at(-1)===selected} onClick={()=>remember(moveStudyBlock(plan,selected,1))}><ArrowDown size={15}/> Позже</button></div><button className="study-plan__remove" onClick={()=>{remember(arrangeStudyPlan(plan.stages?withStudyStages(plan,plan.stages.filter(stage=>stage.blockId!==topicId)):{...plan,order:plan.order.filter(id=>id!==selected)}));setSelected(null);}}>Убрать тему из маршрута</button></>:<button className="study-plan__primary" onClick={()=>add(selected)}><Plus size={15}/> В маршрут</button>}
          </>:<><div className="study-plan__panel-heading"><span>ТВОЙ МАРШРУТ</span><Map size={16}/></div><label className="study-plan__field">Название плана<input value={plan.title} maxLength={120} onChange={e=>remember({...plan,title:e.target.value})} onBlur={()=>{if(!plan.title.trim())remember({...plan,title:'План подготовки к ЕГЭ'});}}/></label>
            <p className="study-plan__muted">Нажми на блок, чтобы настроить части. Перетащи блок на другой, чтобы поменять порядок; на свободное место — чтобы переместить.</p>
            <div className="study-plan__parts-heading"><h3>Ещё задания</h3><span>{bank.length}</span></div>
            {bank.length>0?<><label className="study-plan__search"><Search size={15}/><input aria-label="Найти задание" placeholder="Номер или тема" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="study-plan__bank">{filtered.map(id=><button key={id} title={`Добавить задание ${id}`} onClick={()=>add(id)}><span>{id}</span><strong>{plan.blocks[id].title}</strong><Plus size={14}/></button>)}</div>{!filtered.length&&<p className="study-plan__muted">Ничего не нашлось</p>}<button className="study-plan__add-part" onClick={()=>remember(completeStudyPlan(plan))}><Plus size={15}/> Добавить все {bank.length}</button></>:<div className="study-plan__complete"><Check size={21}/><strong>Все 27 заданий на холсте</strong><span>Теперь настрой порядок и части.</span></div>}
            <div className="study-plan__source">Нумерация по проекту ЕГЭ-2027.<br/><a href={STUDY_PLAN_SOURCE} target="_blank" rel="noreferrer">Документы ФИПИ ↗</a></div>
          </>}
        </aside>
      </div>
      <div className="study-plan__bottom-note"><span>Порядок тем общий. Текущий этап и пройденные части сохраняются отдельно у каждого ученика.</span>{notice&&<button className="study-plan__notice" onClick={()=>setNotice('')} role="status">{notice}<X size={12}/></button>}</div>
    </>}
    {previewStudent&&renderStudentBoard&&<StudyStudentBoardPreview key={previewStudent.id} teacherId={teacherId} student={previewStudent} renderBoard={renderStudentBoard} onClose={()=>setPreviewStudent(null)} onMark={pageId=>{setInspectedPage(pageId);setPreviewStudent(null);setStudyDialog(true);}}/>}
    {studyDialog&&studentId&&<StudentStudyDialog key={`${studentId}:${selected}`} teacherId={teacherId} studentId={studentId} pageId={inspectedPage} blockId={inspectedPage?'':topicId||''} partNumber={studentRecord?.current?.blockId===topicId?studentRecord.current.partNumber:stage?.fromPart||1} onClose={()=>setStudyDialog(false)}/>}
  </section>;
}
