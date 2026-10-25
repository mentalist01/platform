import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDown,ArrowUp,BookOpen,ImagePlus,Scissors,X} from 'lucide-react';
import {preparedAssetUrl,preparedRequest} from '../services/preparedLessonTasks.js';
import PreparedImageStripEditor from './PreparedImageStripEditor.jsx';

export default function PreparedTheoryEditor({images,onChange,onClose,dark}) {
  const input=useRef(null),drop=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stripImage,setStripImage]=useState(null);
  useEffect(()=>{drop.current?.focus();},[]);
  const upload=async files=>{
    if(busy||!files.length)return;setBusy(true);setError('');
    try{
      if(images.length+files.length>8)throw Error('В теорию можно добавить до 8 изображений');
      if(files.some(file=>!file.type.startsWith('image/')))throw Error('Выберите картинки или вставьте скриншот');
      const ids=[];
      for(const file of files){const form=new FormData();form.append('file',file);const asset=await preparedRequest('/api/lesson-task-images',form);ids.push(asset.id);}
      onChange([...images,...ids]);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const move=(index,offset)=>{const next=[...images];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);};
  return <>{createPortal(<div className={`prepared-dialog-backdrop prepared-theory-backdrop${dark?' prepared-dark':''}`} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="prepared-dialog prepared-theory-editor" role="dialog" aria-modal="true" aria-labelledby="prepared-theory-title" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!busy)onClose();}}} onPaste={e=>{e.stopPropagation();const files=Array.from(e.clipboardData.files).filter(file=>file.type.startsWith('image/'));if(files.length){e.preventDefault();void upload(files);}}}>
    <header><div><small>Вступление к набору</small><h2 id="prepared-theory-title"><BookOpen size={22}/>Теория перед задачами</h2></div><button type="button" aria-label="Закрыть редактор теории" disabled={busy} onClick={onClose}><X size={20}/></button></header>
    <p className="prepared-muted">Эти картинки откроются первым шагом на доске. Ответов и проверки здесь нет. Затем «Следующее» откроет первую задачу.</p>
    {error&&<p className="prepared-error" role="alert">{error}</p>}
    <div ref={drop} tabIndex={0} className="prepared-theory-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();void upload(Array.from(e.dataTransfer.files));}}><ImagePlus size={25}/><strong>Вставьте скриншот через Ctrl+V</strong><span>Или перетащите картинки · {images.length}/8</span><button type="button" className="prepared-primary" disabled={busy||images.length>=8} onClick={()=>input.current.click()}>{busy?'Загружаем…':'Добавить картинки'}</button><input ref={input} type="file" multiple accept="image/*" aria-label="Картинки теории" hidden onChange={e=>{void upload(Array.from(e.target.files));e.target.value='';}}/></div>
    <div className="prepared-theory-images">{images.map((id,index)=><article key={id}><div><strong>{index+1}</strong><button type="button" disabled={busy} title="Вырезать пустую полосу и склеить картинку" aria-label={`Вырезать полосу в теории ${index+1}`} onClick={()=>setStripImage(id)}><Scissors size={14}/></button><button type="button" disabled={busy||index===0} aria-label={`Поднять картинку теории ${index+1}`} onClick={()=>move(index,-1)}><ArrowUp size={14}/></button><button type="button" disabled={busy||index===images.length-1} aria-label={`Опустить картинку теории ${index+1}`} onClick={()=>move(index,1)}><ArrowDown size={14}/></button><button type="button" disabled={busy} aria-label={`Убрать картинку теории ${index+1}`} onClick={()=>onChange(images.filter(value=>value!==id))}><X size={14}/></button></div><img src={preparedAssetUrl(`/api/lesson-task-assets/${id}`)} alt={`Теория, картинка ${index+1}`}/></article>)}</div>
    <footer><span className="prepared-muted">Сохраняется вместе с набором</span><button type="button" className="prepared-primary" disabled={busy} onClick={onClose}>К задачам набора</button></footer>
  </section></div>,document.fullscreenElement||document.body)}{stripImage&&<PreparedImageStripEditor imageId={stripImage} dark={dark} onReplace={(asset,oldId)=>onChange(images.map(id=>id===oldId?asset.id:id))} onClose={()=>setStripImage(null)}/>}</>;
}
