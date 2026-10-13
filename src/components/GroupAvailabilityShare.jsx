import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Download, Loader2, RefreshCcw, Share2, X} from 'lucide-react';
import {api} from '../services/api.js';
import {renderGroupAvailabilitySharePng} from '../utils/groupAvailabilityShareImage.js';

export default function GroupAvailabilityShare({teacherId, onClose, transport=api.groupAvailabilityShare}) {
  const [data,setData]=useState(null),[mode,setMode]=useState('free'),[loading,setLoading]=useState(false),[rendering,setRendering]=useState(false);
  const [images,setImages]=useState([]),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [generatedMode,setGeneratedMode]=useState('');
  const request=useRef(0), imageRequest=useRef(0), imageRefs=useRef([]);
  const invalidateLoad=useCallback(()=>{request.current++;},[]);
  const invalidateImages=useCallback(()=>{imageRequest.current++;},[]);
  const load=useCallback(async()=>{
    const version=++request.current;setLoading(true);setError('');setNotice('');setData(null);
    try {const next=await transport(teacherId);if(version===request.current){setData(next);if(next.calendarError)setMode('all');}}
    catch(failure){if(version===request.current)setError(failure.message || 'Не удалось загрузить совпадения.');}
    finally{if(version===request.current)setLoading(false);}
  },[teacherId,transport]);
  useEffect(()=>{void load();return invalidateLoad;},[load,invalidateLoad]);
  useEffect(()=>{
    const version=++imageRequest.current;
    for(const image of imageRefs.current)URL.revokeObjectURL(image.url);
    imageRefs.current=[];setImages([]);
    if(!data)return undefined;
    setRendering(true);setError('');setNotice('');
    void renderGroupAvailabilitySharePng(data,mode).then(next=>{
      if(version!==imageRequest.current){for(const image of next)URL.revokeObjectURL(image.url);return;}
      imageRefs.current=next;setImages(next);setGeneratedMode(mode);
    }).catch(failure=>{if(version===imageRequest.current)setError(failure.message);})
      .finally(()=>{if(version===imageRequest.current)setRendering(false);});
    return invalidateImages;
  },[data,mode,invalidateImages]);
  useEffect(()=>{const close=event=>{if(event.key==='Escape')onClose();};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[onClose]);
  useEffect(()=>()=>{for(const image of imageRefs.current)URL.revokeObjectURL(image.url);},[]);
  const filename=index=>`время-групп-${mode==='free'?'свободное':'все'}-${data.fromDate}${images.length>1?`-${index+1}`:''}.png`;
  const download=(onlyIndex)=>{
    images.forEach((image,index)=>{if(Number.isInteger(onlyIndex)&&index!==onlyIndex)return;const link=document.createElement('a');link.href=image.url;link.download=filename(index);link.click();});setNotice(images.length>1&&!Number.isInteger(onlyIndex)?'Картинки скачаны.':'Картинка скачана.');
  };
  const share=async()=>{
    try {const files=images.map((image,index)=>new File([image.blob],filename(index),{type:'image/png'}));
      if(navigator.share && (!navigator.canShare || navigator.canShare({files}))){await navigator.share({files,title:'Время для занятий в мини-группах'});setNotice('Картинка отправлена.');}
      else download();
    }catch(failure){if(failure.name!=='AbortError')setError(failure.message || 'Не удалось отправить картинку.');}
  };
  const count=(data?.groups || []).reduce((sum,group)=>sum+group.slots.filter(slot=>mode==='all'||slot.busy===false).length,0);
  const ready=Boolean(images.length && generatedMode===mode && count && !loading && !rendering && !(mode==='free' && data?.calendarError));
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="group-availability-share-title">
    <section className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5"><div><h2 id="group-availability-share-title" className="text-xl font-black text-slate-900">Поделиться временем всех групп</h2><p className="mt-1 text-sm text-slate-500">Только совпадения у всех текущих участников — включая «Могу подстроиться». Имена учеников в картинку не попадают.</p></div><button type="button" onClick={onClose} aria-label="Закрыть картинку времени групп" className="rounded-xl border p-2"><X size={20}/></button></header>
      <div className="overflow-y-auto p-5"><div className="flex flex-wrap items-center gap-2">
        {[['free','Только свободное у преподавателя'],['all','Все совпадения · включая занятое']].map(([value,label])=><button type="button" key={value} disabled={value==='free' && Boolean(data?.calendarError)} onClick={()=>setMode(value)} aria-pressed={mode===value} className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40 ${mode===value?'bg-violet-600 text-white':'bg-violet-50 text-violet-700'}`}>{label}</button>)}
        <button type="button" onClick={()=>void load()} disabled={loading} className="ml-auto inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><RefreshCcw size={16}/>Обновить</button>
      </div><p className="mt-3 text-sm text-slate-500">Занятие самой группы не считается конфликтом. Занятость проверяется на ближайшие 8 недель от даты подбора каждой группы.</p>
      {(loading||rendering)&&<p role="status" className="mt-4 flex items-center gap-2"><Loader2 size={18} className="animate-spin"/>{loading?'Собираем отметки групп и проверяем календарь…':'Формируем картинку…'}</p>}
      {error&&<p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
      {data?.calendarError&&<p role="alert" className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-800">{data.calendarError}</p>}
      {data&&<div className="my-4 flex flex-wrap gap-2">{data.groups.map(group=><span key={group.groupId} className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{group.groupName} · ответили {group.answeredCount}/{group.memberCount} · {group.slots.filter(slot=>mode==='all'||slot.busy===false).length} совпадений{!group.config?' · подбор не открыт':''}</span>)}</div>}
      {data&&!loading&&!rendering&&!count&&<p role="status" className="rounded-xl bg-violet-50 p-4 text-violet-800">{mode==='free'?'Совпадений, свободных у преподавателя, пока нет. Можно посмотреть все совпадения.':'Пока нет времени, подходящего всем участникам. Группы без подбора или без ответов всех участников не дают совпадений.'}</p>}
      {images.map((image,index)=><figure key={image.url} className="mt-4"><img src={image.url} alt={`Время всех групп · ${mode==='free'?'только свободное':'все совпадения'} · картинка ${index+1}`} className="h-auto w-full rounded-xl border border-slate-200"/>{images.length>1&&<figcaption className="mt-2 flex items-center justify-between text-sm text-slate-500">Картинка {index+1} из {images.length}<button type="button" disabled={!ready} onClick={()=>download(index)} className="rounded-lg border px-3 py-1 font-semibold text-violet-700 disabled:opacity-40">Скачать картинку {index+1}</button></figcaption>}</figure>)}
      </div><footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 p-4">{notice&&<p role="status" className="mr-auto text-sm text-emerald-700">{notice}</p>}{images.length>1&&<span className="mr-auto text-sm text-slate-500">{images.length} картинки — все варианты сохранены</span>}<button type="button" disabled={!ready} onClick={download} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 font-bold text-violet-700 disabled:opacity-40"><Download size={18}/>Скачать PNG</button><button type="button" disabled={!ready} onClick={()=>void share()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 font-bold text-white disabled:opacity-40"><Share2 size={18}/>Отправить картинку</button></footer>
    </section>
  </div>;
}
