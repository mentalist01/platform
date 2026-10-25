import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ArrowRight,Check,Scissors,Undo2,X} from 'lucide-react';
import {preparedAssetUrl,preparedRequest} from '../services/preparedLessonTasks.js';
import {imageStripGeometry} from '../utils/imageStrip.js';
import './PreparedImageStripEditor.css';

export default function PreparedImageStripEditor({imageId,onReplace,onClose,dark}) {
  const [current,setCurrent]=useState(imageId),[info,setInfo]=useState(null),[selection,setSelection]=useState(null);
  const [dimensions,setDimensions]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const image=useRef(null),frame=useRef(null),gesture=useRef(null),close=useRef(null);
  useEffect(()=>{close.current?.focus();},[]);
  useEffect(()=>{
    const abort=new AbortController();
    void preparedRequest(`/api/lesson-task-images/${current}/edit`,undefined,'GET',abort.signal).then(setInfo).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
    return()=>abort.abort();
  },[current]);
  const geometry=dimensions&&selection?imageStripGeometry(dimensions.width,dimensions.height,selection.top,selection.bottom):null;
  const source=preparedAssetUrl(`/api/lesson-task-assets/${current}`);
  const fraction=clientY=>{
    const box=frame.current.getBoundingClientRect(),pixel=1/(dimensions?.height||1000);
    return Math.max(pixel,Math.min(1-pixel,(clientY-box.top)/box.height));
  };
  const pointerDown=event=>{
    if(busy||!dimensions||event.button!==0)return;
    event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
    const value=fraction(event.clientY),kind=event.target.dataset.boundary||'new';
    gesture.current={pointerId:event.pointerId,start:value,kind};
    if(kind==='new')setSelection({top:value,bottom:value});
    setNotice('');
  };
  const pointerMove=event=>{
    const drag=gesture.current;if(!drag||drag.pointerId!==event.pointerId)return;
    const value=fraction(event.clientY),pixel=1/dimensions.height;
    setSelection(old=>drag.kind==='top'?{...old,top:Math.min(value,old.bottom-pixel)}
      :drag.kind==='bottom'?{...old,bottom:Math.max(value,old.top+pixel)}
      :{top:Math.min(drag.start,value),bottom:Math.max(drag.start,value)});
  };
  const update=(key,value)=>{
    const percent=Number(value);if(!Number.isFinite(percent))return;
    const pixel=1/(dimensions?.height||1000);
    setSelection(old=>({top:.4,bottom:.6,...old,[key]:Math.max(pixel,Math.min(1-pixel,percent/100))}));setNotice('');
  };
  const replace=asset=>{
    onReplace(asset,current);setCurrent(asset.id);setInfo(null);setSelection(null);setDimensions(null);setError('');
  };
  const apply=async()=>{
    if(busy||!geometry)return;setBusy(true);setError('');
    try{const asset=await preparedRequest(`/api/lesson-task-images/${current}/remove-strip`,selection);replace(asset);setNotice('Полоса вырезана. Можно убрать ещё одну или нажать «Готово».');}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const undo=()=>{if(!busy&&info?.previous){replace(info.previous);setNotice('Последнее вырезание отменено.');}};
  return createPortal(<div className={`prepared-dialog-backdrop prepared-strip-backdrop${dark?' prepared-dark':''}`} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="prepared-dialog prepared-strip-editor" role="dialog" aria-modal="true" aria-labelledby="prepared-strip-title" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!busy)onClose();}} onPaste={e=>e.stopPropagation()}>
      <header><div><small>Редактирование картинки</small><h2 id="prepared-strip-title"><Scissors size={21}/>Вырезать полосу</h2></div><button ref={close} type="button" disabled={busy} aria-label="Закрыть вырезание полосы" onClick={onClose}><X size={20}/></button></header>
      <p className="prepared-muted">Протяни мышью по пустому месту сверху вниз. Красная полоса исчезнет, верх и низ склеятся. Границы можно подвинуть за линии.</p>
      {error&&<p className="prepared-error" role="alert">{error}</p>}
      <div className="prepared-strip-workspace">
        <section aria-label="Выделение полосы"><div className="prepared-strip-pane-title"><strong>Исходная картинка</strong><span>{dimensions?`${dimensions.width} × ${dimensions.height}`:'Загружаем…'}</span></div>
          <div className="prepared-strip-scroll"><div ref={frame} className={`prepared-strip-source${busy?' is-busy':''}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={()=>{gesture.current=null;}} onPointerCancel={()=>{gesture.current=null;}}>
            <img key={current} ref={image} src={source} draggable={false} alt="Картинка для выделения пустой полосы" onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onError={()=>setError('Картинка не загрузилась. Закройте окно и попробуйте ещё раз.')}/>
            {selection&&<><div className="prepared-strip-band" style={{top:`${selection.top*100}%`,height:`${Math.max(0,selection.bottom-selection.top)*100}%`}}><span>Вырезать</span></div><div className="prepared-strip-boundary" data-boundary="top" style={{top:`${selection.top*100}%`}} title="Верхняя граница полосы"><i data-boundary="top"/></div><div className="prepared-strip-boundary" data-boundary="bottom" style={{top:`${selection.bottom*100}%`}} title="Нижняя граница полосы"><i data-boundary="bottom"/></div></>}
          </div></div>
        </section>
        <section aria-label="Предпросмотр склейки"><div className="prepared-strip-pane-title"><strong><ArrowRight size={14}/>После вырезания</strong><span>{geometry?`${geometry.width} × ${geometry.outputHeight}`:'Выдели полосу слева'}</span></div>
          <div className="prepared-strip-scroll prepared-strip-result">{geometry?<div className="prepared-strip-joined" style={{aspectRatio:`${geometry.width}/${geometry.outputHeight}`}}>
            <div style={{height:`${geometry.topHeight/geometry.outputHeight*100}%`}}><img src={source} alt="Верхняя часть после склейки" style={{height:`${geometry.height/geometry.topHeight*100}%`}}/></div>
            <div style={{height:`${geometry.bottomHeight/geometry.outputHeight*100}%`}}><img src={source} alt="Нижняя часть после склейки" style={{height:`${geometry.height/geometry.bottomHeight*100}%`,bottom:0}}/></div>
          </div>:<div className="prepared-strip-empty"><Scissors size={25}/><strong>Здесь будет результат</strong><span>Текст сохраняется без изменения масштаба.</span></div>}</div>
        </section>
      </div>
      <div className="prepared-strip-adjust"><span>{geometry?`Убираем ${geometry.removed} пикс. по высоте`:'Выдели полосу мышью или укажи её границы'}</span><label>Начало, %<input aria-label="Верхняя граница полосы, проценты" type="number" min="0.1" max="99.8" step="0.1" disabled={busy||!dimensions} value={selection?Math.round(selection.top*1000)/10:''} onChange={e=>update('top',e.target.value)}/></label><label>Конец, %<input aria-label="Нижняя граница полосы, проценты" type="number" min="0.2" max="99.9" step="0.1" disabled={busy||!dimensions} value={selection?Math.round(selection.bottom*1000)/10:''} onChange={e=>update('bottom',e.target.value)}/></label><button type="button" disabled={busy||!selection} onClick={()=>setSelection(null)}>Сбросить выделение</button></div>
      {notice&&<p className="prepared-strip-notice" role="status"><Check size={15}/>{notice}</p>}
      <footer><button type="button" disabled={busy||!info?.previous} onClick={undo}><Undo2 size={15}/>Отменить вырезание</button><span className="prepared-muted">Исходная картинка сохранена</span><button type="button" disabled={busy} onClick={onClose}>Готово</button><button type="button" className="prepared-primary" disabled={busy||!geometry} onClick={()=>void apply()}><Scissors size={15}/>{busy?'Склеиваем…':'Применить вырезание'}</button></footer>
    </section>
  </div>,document.fullscreenElement||document.body);
}
