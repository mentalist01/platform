import {useFullscreenPortalTarget} from '../hooks/useFullscreenPortalTarget.js';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDown,ArrowUp,BookOpen,ImagePlus,Scissors,Sparkles,X} from 'lucide-react';
import {preparedAssetUrl,preparedRequest} from '../services/preparedLessonTasks.js';
import PreparedImageStripEditor from './PreparedImageStripEditor.jsx';
import {normalizePreparedTheoryDisplay,normalizePreparedTheoryDisplays} from '../utils/preparedTheoryDisplay.js';
import {preparedTaskTitle} from '../utils/preparedTaskTitle.js';
import {preparedTheoryItems,PREPARED_THEORY_MAX_ITEMS} from '../utils/interactiveTheoryCatalog.js';
import {interactiveTheoryRegistry,registeredInteractiveTheory} from './interactiveTheory/registry.jsx';
import InteractiveTheory from './interactiveTheory/InteractiveTheory.jsx';

export default function PreparedTheoryEditor({images=[],theoryItems,mode='steps',tasks=[],placements={},display={},onDisplayChange,onPlacementsChange,onModeChange,onChange,onItemsChange,onClose,dark,onOpenCanvas,onReplaceAsset}) {
  const portalTarget=useFullscreenPortalTarget();
  const items=preparedTheoryItems({theoryItems,theoryImages:images}),keys=items.map(item=>item.id);
  const input=useRef(null),drop=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stripImage,setStripImage]=useState(null),[source,setSource]=useState('images');
  useEffect(()=>{drop.current?.focus();},[]);
  const changeItems=next=>{
    onDisplayChange?.(normalizePreparedTheoryDisplays(next.map(item=>item.id),display,placements,tasks[0]?.id));
    if(onItemsChange)onItemsChange(next);else onChange(next.filter(item=>item.kind==='image').map(item=>item.assetId));
  };
  const changePlacements=next=>{onDisplayChange?.(normalizePreparedTheoryDisplays(keys,display,next,tasks[0]?.id));onPlacementsChange?.(next);};
  const before=id=>placements[id]===tasks[0]?.id?'':placements[id]||'';
  const earlierItems=id=>items.slice(0,keys.indexOf(id)).filter(other=>before(other.id)===before(id));
  const upload=async files=>{
    if(busy||!files.length)return;setBusy(true);setError('');
    try{
      if(items.length+files.length>PREPARED_THEORY_MAX_ITEMS)throw Error(`В теорию можно добавить до ${PREPARED_THEORY_MAX_ITEMS} листов`);
      if(files.some(file=>!file.type.startsWith('image/')))throw Error('Выберите картинки или вставьте скриншот');
      const added=[];
      for(const file of files){const form=new FormData();form.append('file',file);const asset=await preparedRequest('/api/lesson-task-images',form);added.push({id:asset.id,kind:'image',assetId:asset.id});}
      changeItems([...items,...added]);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const setDisplay=(id,value)=>{const next={...display},setting=normalizePreparedTheoryDisplay(value);if(setting)next[id]=setting;else delete next[id];onDisplayChange?.(next);};
  const changeDisplay=(id,key,value)=>setDisplay(id,{...display[id],...(['relativeTo','placement'].includes(key)?{offset:undefined}:{}),[key]:value});
  const move=(index,offset)=>{const next=[...items];[next[index],next[index+offset]]=[next[index+offset],next[index]];changeItems(next);};
  const addInteractive=definition=>{changeItems([...items,{id:crypto.randomUUID(),kind:'interactive',typeId:definition.id,params:{...definition.defaultParams}}]);};
  const replaceImage=(asset,oldId)=>{
    onReplaceAsset?.(oldId,asset.id);
    const nextPlacements={...placements,[asset.id]:placements[oldId]};delete nextPlacements[oldId];onPlacementsChange?.(nextPlacements);
    const next=items.map(item=>item.id===oldId?{id:asset.id,kind:'image',assetId:asset.id}:item);
    const nextDisplay=Object.fromEntries(Object.entries(display).map(([id,value])=>[id===oldId?asset.id:id,{...value,...(value.relativeTo===oldId?{relativeTo:asset.id}:{})}]));
    onDisplayChange?.(normalizePreparedTheoryDisplays(next.map(item=>item.id),nextDisplay,nextPlacements,tasks[0]?.id));
    if(onItemsChange)onItemsChange(next);else onChange(next.map(item=>item.assetId));
  };
  return <>{createPortal(<div className={`prepared-dialog-backdrop prepared-theory-backdrop${dark?' prepared-dark':''}`} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="prepared-dialog prepared-theory-editor" role="dialog" aria-modal="true" aria-labelledby="prepared-theory-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose();}}} onPaste={e=>{e.stopPropagation();const files=Array.from(e.clipboardData.files).filter(file=>file.type.startsWith('image/'));if(files.length){e.preventDefault();void upload(files);}}}>
    <header><div><small>Материалы набора</small><h2 id="prepared-theory-title"><BookOpen size={22}/>Листы теории</h2></div><button type="button" aria-label="Закрыть редактор теории" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <div className="prepared-theory-mode" role="group" aria-label="Показ теории"><button type="button" aria-pressed={mode==='steps'} disabled={busy} onClick={()=>onModeChange?.('steps')}>По одному листу</button><button type="button" aria-pressed={mode==='together'} disabled={busy} onClick={()=>onModeChange?.('together')}>Все листы вместе</button></div>
    <p className="prepared-muted">Картинки и интерактивные карточки идут в общей последовательности. Выберите момент появления каждого листа, затем задайте размер и место в конструкторе. В режиме «Все листы вместе» соседние картинки объединяются, а интерактивные карточки остаются отдельными объектами.</p>
    <small className="prepared-muted">Уже открытые листы с записями сохраняют своё расположение. Начальные параметры не меняются от действий на уроке.</small>
    {error&&<p className="prepared-error" role="alert">{error}</p>}
    <div className="prepared-library-tabs" role="group" aria-label="Источник теории"><button type="button" aria-pressed={source==='images'} onClick={()=>setSource('images')}><ImagePlus size={15}/>Обычные карточки</button><button type="button" aria-pressed={source==='interactive'} onClick={()=>setSource('interactive')}><Sparkles size={15}/>Интерактивные карточки</button></div>
    {source==='images'?<div ref={drop} tabIndex={0} className="prepared-theory-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();void upload(Array.from(e.dataTransfer.files));}}><ImagePlus size={25}/><strong>Вставьте скриншот через Ctrl+V</strong><span>Или перетащите картинки · {items.length}/{PREPARED_THEORY_MAX_ITEMS} листов</span><button type="button" className="prepared-primary" disabled={busy||items.length>=PREPARED_THEORY_MAX_ITEMS} onClick={()=>input.current.click()}>{busy?'Загружаем…':'Добавить картинки'}</button><input ref={input} type="file" multiple accept="image/*" aria-label="Картинки теории" hidden onChange={e=>{void upload(Array.from(e.target.files));e.target.value='';}}/></div>:<div className="prepared-theory-library">{Object.values(interactiveTheoryRegistry).map(definition=><article key={definition.id}><Sparkles size={22}/><small>{definition.category}</small><h3>{definition.name}</h3><p>{definition.description}</p><button type="button" className="prepared-primary" disabled={busy||items.length>=PREPARED_THEORY_MAX_ITEMS} onClick={()=>addInteractive(definition)}>Добавить в набор</button></article>)}</div>}
    <div className="prepared-theory-images">{items.map((item,index)=>{const id=item.id,definition=item.kind==='interactive'&&registeredInteractiveTheory(item.typeId);return <article key={id}><div><strong>{index+1}{definition?' · интерактив':''}</strong>{!definition&&<button type="button" disabled={busy} title="Вырезать пустую полосу и склеить картинку" aria-label={`Вырезать полосу в теории ${index+1}`} onClick={()=>setStripImage(item.assetId)}><Scissors size={14}/></button>}<button type="button" disabled={busy||index===0} aria-label={`Поднять лист теории ${index+1}`} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button><button type="button" disabled={busy||index===items.length-1} aria-label={`Опустить лист теории ${index+1}`} onClick={()=>move(index,1)}><ArrowDown size={14}/></button><button type="button" disabled={busy} aria-label={`Убрать лист теории ${index+1}`} onClick={()=>changeItems(items.filter(value=>value.id!==id))}><X size={14}/></button></div>
      <label className="prepared-theory-placement">Показать<select aria-label={`Место листа теории ${index+1}`} disabled={busy} value={placements[id]&&(placements[id]==='end'||tasks.some(task=>task.id===placements[id]))?placements[id]:placements[id]?'end':''} onChange={e=>changePlacements({...placements,[id]:e.target.value})}><option value="">В начале набора</option>{tasks.map((task,i)=><option key={task.id} value={task.id}>Перед задачей «{preparedTaskTitle(task,i)}»</option>)}<option value="end">После последней задачи</option></select></label>
      {definition?<><div className="prepared-theory-interactive-preview"><div><InteractiveTheory interactive={item} cardId={id} preview disabled/></div></div><strong>{definition.name}</strong>{definition.Settings&&<definition.Settings params={item.params} disabled={busy} onChange={params=>changeItems(items.map(row=>row.id===id?{...row,params}:row))}/>}</>:<img src={preparedAssetUrl(`/api/lesson-task-assets/${item.assetId}`)} alt={`Теория, картинка ${index+1}`}/>}
      <details className="prepared-theory-display"><summary>Размер и расположение · {display[id]?.scalePercent||100}%</summary>
        <label>Размер на доске<select aria-label={`Размер листа ${index+1}`} disabled={busy||mode!=='steps'&&!definition} value={display[id]?.scalePercent||100} onChange={e=>changeDisplay(id,'scalePercent',Number(e.target.value))}>{[...new Set([25,40,50,75,100,125,150,200,display[id]?.scalePercent||100])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value}%</option>)}</select></label>
        <label>Относительно какого листа<select aria-label={`Опорный лист ${index+1}`} disabled={busy||!earlierItems(id).length} value={display[id]?.relativeTo||''} onChange={e=>changeDisplay(id,'relativeTo',e.target.value)}><option value="">Предыдущий открытый лист</option>{earlierItems(id).map(other=><option key={other.id} value={other.id}>Лист {keys.indexOf(other.id)+1}</option>)}</select></label>
        <label>Где появится этот лист<select aria-label={`Расположение листа ${index+1}`} disabled={busy} value={display[id]?.placement||'auto'} onChange={e=>changeDisplay(id,'placement',e.target.value)}><option value="auto">Автоматически</option><option value="below">Снизу от опорного листа</option><option value="right">Справа от опорного листа</option></select></label><label>Что показать после открытия<select aria-label={`Вид после открытия листа ${index+1}`} disabled={busy} value={['next','pair'].includes(display[id]?.focus)?display[id].focus:'next'} onChange={e=>changeDisplay(id,'focus',e.target.value)}><option value="next">Только этот лист</option><option value="pair">Этот и опорный лист вместе</option></select></label><small>Все настройки камеры и свободная расстановка доступны в конструкторе набора.</small>
      </details></article>;})}</div>
    <footer><span className="prepared-muted">Сохраняется вместе с набором</span><button type="button" disabled={busy} onClick={onOpenCanvas}>Конструктор набора</button><button type="button" className="prepared-primary" disabled={busy} onClick={onClose}>К задачам набора</button></footer>
  </section></div>,portalTarget)}{stripImage&&<PreparedImageStripEditor imageId={stripImage} dark={dark} onReplace={replaceImage} onClose={()=>setStripImage(null)}/>}</>;
}
