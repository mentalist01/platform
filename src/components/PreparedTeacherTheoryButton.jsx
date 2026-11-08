import {useState} from 'react';
import {NotebookPen} from 'lucide-react';
import {teacherTheoryUrl} from '../utils/teacherTheoryFormat.js';

export default function PreparedTeacherTheoryButton({setId,beforeOpen,compact=false}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const open=async()=>{
    if(busy)return;setBusy(true);setError('');
    let popup;
    try{
      const desktop=window.teacherDesktop;
      if(desktop&&!desktop.openTeacherTheory)throw Error('Обновите приложение учителя: «Обновления» → «Обновить». В новой версии текст открывается в отдельном защищённом окне.');
      if(!desktop){popup=window.open('about:blank','teacher-theory-'+setId,'popup,width=920,height=850');if(!popup)throw Error('Разрешите отдельное окно для текста учителя.');popup.opener=null;}
      await beforeOpen?.();
      const url=teacherTheoryUrl(setId);
      if(desktop)await desktop.openTeacherTheory(url);else popup.location.replace(url);
    }catch(error){popup?.close();setError(error.message);}finally{setBusy(false);}
  };
  return <span className="prepared-teacher-theory-trigger"><button type="button" disabled={busy} title="Личный текст преподавателя в отдельном окне" onClick={()=>void open()}><NotebookPen size={15}/>{compact?'Текст учителя':'Текст учителя ↗'}</button>{error&&<small role="alert">{error}</small>}</span>;
}
