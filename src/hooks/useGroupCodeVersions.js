import {useEffect,useRef,useState} from 'react';
import {api} from '../services/api.js';

const timestamp=new Intl.DateTimeFormat('ru-RU',{
  day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow',
});
const empty={scope:'',entries:[],nextOffset:null,error:false,loading:false};
const formatEntries=versions=>versions.flatMap(version=>version.entries.map((entry,index)=>({
  key:version.id+':'+index,
  text:entry.text,
  label:version.date && Number.isFinite(Date.parse(version.date))
    ? timestamp.format(new Date(version.date))+(version.entries.length>1?' · '+entry.name:'')
    : 'Ранее сохранённый · '+entry.name,
})));

export function useGroupCodeVersions(groupId,pageId,solutionId) {
  const scope=groupId ? JSON.stringify([groupId,pageId,solutionId]) : '';
  const [result,setResult]=useState(empty);
  const [request,setRequest]=useState(null);
  const [choice,setChoice]=useState(null);
  const current=scope && result.scope===scope ? result : empty;
  const readMore=useRef(null);

  useEffect(()=>{
    if(!scope)return;
    const controller=new AbortController();
    const load=async (offset=0)=>{
      try{
        const {versions,nextOffset}=await api.getLearningGroupCodeWork(
          groupId,pageId,solutionId,offset,controller.signal,
        );
        if(controller.signal.aborted)return;
        const entries=formatEntries(versions);
        setResult(previous=>({
          scope,entries:offset && previous.scope===scope ? [...previous.entries,...entries] : entries,
          nextOffset,error:false,loading:false,
        }));
      }catch{
        if(!controller.signal.aborted)setResult(previous=>({
          ...(previous.scope===scope ? previous : empty),scope,error:true,loading:false,
        }));
      }
    };
    readMore.current=load;
    void load();
    return()=>{
      controller.abort();
      if(readMore.current===load)readMore.current=null;
    };
  },[groupId,pageId,request,scope,solutionId]);

  const select=key=>setChoice({scope,key});
  const selected=choice?.scope===scope ? choice.key : '';
  const active=current.entries.find(entry=>entry.key===selected) || null;
  const retry=()=>setRequest({});
  const loadEarlier=()=>{
    if(current.nextOffset===null||current.loading||!readMore.current)return;
    setResult({...current,error:false,loading:true});
    void readMore.current(current.nextOffset);
  };
  return {active,entries:current.entries,error:current.error,
    hasEarlier:current.nextOffset!==null,loadingEarlier:current.loading,select,retry,loadEarlier};
}
