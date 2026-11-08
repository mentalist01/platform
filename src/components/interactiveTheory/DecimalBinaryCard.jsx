import {useState} from 'react';
import {ArrowDown} from 'lucide-react';
import {BINARY_INPUT_LIMIT,decimalBinary} from '../../utils/decimalBinary.js';

export default function DecimalBinaryCard({state,onChange,disabled=false}) {
  const groups=decimalBinary(state.value),[blurred,setBlurred]=useState(false);
  const invalid=state.value.trim()!==''&&!groups;
  const isAddress=groups?.length===4,long=groups?.[0].length>16;
  return <div className={`decimal-binary${isAddress?' is-address':''}${long?' is-long':''}${invalid&&blurred?' is-invalid':''}`}>
    <input className="decimal-binary__input" aria-label="Десятичное число или IPv4-адрес" aria-invalid={invalid} inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={BINARY_INPUT_LIMIT} placeholder="252" value={state.value} disabled={disabled} onChange={event=>{setBlurred(false);onChange({value:event.target.value});}} onBlur={()=>setBlurred(true)}/>
    <ArrowDown className="decimal-binary__arrow" size={20} aria-hidden="true"/>
    <div className="decimal-binary__result" role="status" aria-label="Двоичный результат" aria-live="polite" aria-atomic="true">
      <span className="decimal-binary__accessible">{groups?.join('.')||'—'}</span>
      <div className="decimal-binary__digits" aria-hidden="true">{groups?groups.map((group,index)=><span className="decimal-binary__group" key={index}>{index>0&&<span className="decimal-binary__dot">.</span>}<span className="decimal-binary__octet">{[...group].map((bit,position)=><b key={position} className={bit==='1'?'is-one':'is-zero'}>{bit}</b>)}</span></span>):<span className="decimal-binary__empty">—</span>}</div>
    </div>
  </div>;
}
