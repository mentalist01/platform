import {useEffect,useState} from 'react';
import {normalizeSubnetParams} from '../../utils/interactiveTheoryCatalog.js';

export default function IpSubnetSettings({params,disabled,onChange}) {
  const [draft,setDraft]=useState(params),[error,setError]=useState('');
  useEffect(()=>{setDraft(params);setError('');},[params.ip,params.prefix]);
  const apply=()=>{try{const next=normalizeSubnetParams(draft);setError('');if(next.ip!==params.ip||next.prefix!==params.prefix)onChange(next);}catch(cause){setError(cause.message);}};
  return <><div className="prepared-theory-params" onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();apply();}}}>
    <label>Начальный IP<input aria-label="Начальный IP карточки" disabled={disabled} value={draft.ip} onChange={event=>setDraft({...draft,ip:event.target.value})} onBlur={apply}/></label>
    <label>Маска<input type="number" aria-label="Начальная длина маски" disabled={disabled} min="0" max="32" value={draft.prefix} onChange={event=>setDraft({...draft,prefix:event.target.value})} onBlur={apply}/></label>
  </div>{error&&<small role="alert" className="prepared-error">{error}</small>}</>;
}
