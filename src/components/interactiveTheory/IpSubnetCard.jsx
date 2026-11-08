import {useEffect,useState} from 'react';
import {ArrowRight,Check,ChevronDown,Eye,Lightbulb,Network,RotateCcw} from 'lucide-react';
import {ipv4Subnet,parseIPv4,subnetExamples} from '../../utils/interactiveTheoryCatalog.js';

const countLabel=n=>n.toLocaleString('ru-RU');
const binaryOctets=address=>address.split('.').map(octet=>Number(octet).toString(2).padStart(8,'0'));
function SubnetBitwiseAnd({result}) {
  const ip=binaryOctets(result.ip),mask=binaryOctets(result.mask),network=binaryOctets(result.network);
  const rows=[{id:'ip',label:'IP',address:result.ip,bits:ip},{id:'mask',label:'Маска',operator:'AND',address:result.mask,bits:mask},{id:'network',label:'Сеть',operator:'=',address:result.network,bits:network}];
  return <section className="ip-subnet__and" aria-label="Побитовое И: IP-адрес и маска">
    <header><strong>Находим адрес сети</strong><span>Побитовое И · AND</span></header>
    <div className="ip-subnet__and-scroll" tabIndex={0} aria-label="IP, маска и адрес сети в двоичном виде">
      <table><tbody>{rows.map(row=><tr key={row.id} className={`ip-subnet__and-row is-${row.id}`} aria-label={`${row.label}: ${row.address}`}>
        <th scope="row">{row.operator&&<small>{row.operator}</small>}{row.label}</th>
        {row.bits.map((octet,i)=><td key={i}><span className="ip-subnet__and-octet" aria-hidden="true">{octet.split('').map((bit,j)=><b key={j} className={i*8+j<result.prefix?'is-network':'is-host'} title={`${ip[i][j]} AND ${mask[i][j]} = ${network[i][j]}${mask[i][j]==='1'?' · маска сохраняет бит IP':' · маска обнуляет бит IP'}`}>{bit}</b>)}</span><small aria-hidden="true">{row.address.split('.')[i]}</small></td>)}
      </tr>)}</tbody></table>
    </div>
    <p><span><i/>1 в маске — сохраняем бит IP</span><span><i/>0 — обнуляем</span></p>
  </section>;
}
export default function IpSubnetCard({state,onChange,onReset,disabled=false,compact=false}) {
  const result=ipv4Subnet(state.ip,state.prefix),[draft,setDraft]=useState(state.ip),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setDraft(state.ip);setInvalid(false);},[state.ip]);
  if(!result)return <p>Проверьте настройки IPv4-адреса.</p>;
  const octet=Math.min(3,Math.floor(state.prefix/8)),remaining=32-(octet+1)*8;
  const blockStart=Math.floor(result.networkValue/2**remaining)%256,blockEnd=Math.floor(result.broadcastValue/2**remaining)%256;
  const ipOctet=Number(state.ip.split('.')[octet]);
  const applyIp=()=>{if(parseIPv4(draft)===null){setInvalid(true);return;}setInvalid(false);onChange({ip:draft,answer:false});};
  return <div className={`ip-subnet${compact?' is-compact':''}`}>
    <header className="ip-subnet__heading"><span className="ip-subnet__icon"><Network size={22}/></span><div><small>ИССЛЕДУЕМ СЕТЬ</small><h3>Маска и границы подсети</h3></div><span className="ip-subnet__prefix">/{state.prefix}</span></header>
    <div className="ip-subnet__controls">
      <label>Готовый пример<select aria-label="Пример подсети" disabled={disabled} value={subnetExamples.find(row=>row.ip===state.ip&&row.prefix===state.prefix)?.id||''} onChange={event=>{const example=subnetExamples.find(row=>row.id===event.target.value);if(example)onChange({ip:example.ip,prefix:example.prefix,answer:false,explanation:false});}}><option value="" disabled>Свой пример</option>{subnetExamples.map(example=><option value={example.id} key={example.id}>{example.label}</option>)}</select></label>
      <label>IP-адрес<div className="ip-subnet__ip-input"><input aria-label="IP-адрес" aria-invalid={invalid} disabled={disabled} value={draft} inputMode="decimal" onChange={event=>setDraft(event.target.value)} onBlur={applyIp} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();applyIp();}}}/><button type="button" aria-label="Применить IP-адрес" disabled={disabled} onClick={applyIp}><Check size={16}/></button></div></label>
    </div>
    {invalid&&<p className="ip-subnet__error" role="alert">Нужны четыре числа от 0 до 255, например 192.168.1.70.</p>}
    <section className="ip-subnet__mask"><div><label>Длина маски <strong>/{state.prefix}</strong></label><code>{result.mask}</code></div><input type="range" min="0" max="32" step="1" value={state.prefix} aria-label="Длина маски подсети" disabled={disabled} onChange={event=>onChange({prefix:Number(event.target.value)})}/><div className="ip-subnet__range-labels"><span>/0 · больше адресов</span><span>меньше адресов · /32</span></div></section>
    <SubnetBitwiseAnd result={result}/>
    <section className="ip-subnet__visual" aria-label="Границы подсети"><div><strong>Октет {octet+1}: границы меняются вместе с маской</strong><small>0–255</small></div><div className="ip-subnet__track"><span className="ip-subnet__interval" style={{left:`${blockStart/256*100}%`,width:`${Math.max(.8,(blockEnd-blockStart+1)/256*100)}%`}}/><i className="ip-subnet__pin" style={{left:`${ipOctet/255*100}%`}} title={state.ip}/></div><div className="ip-subnet__bounds"><code>{result.network}</code><span><ArrowRight size={15}/></span><code>{result.broadcast}</code></div></section>
    <div className="ip-subnet__counts"><div><strong>{countLabel(result.count)}</strong><span>всего адресов</span></div><div><strong>{countLabel(result.hosts)}</strong><span>{state.prefix<=30?'доступно компьютерам':'адресов узлов · спецслучай'}</span></div></div>
    <div className="ip-subnet__actions"><button type="button" className="ip-subnet__primary" disabled={disabled} aria-expanded={state.answer} onClick={()=>onChange({answer:!state.answer})}><Eye size={16}/>{state.answer?'Скрыть ответ':'Показать ответ'}</button><button type="button" disabled={disabled} aria-expanded={state.explanation} onClick={()=>onChange({explanation:!state.explanation})}><Lightbulb size={16}/>Объяснить<ChevronDown size={13}/></button><button type="button" aria-label="Сбросить карточку" disabled={disabled} onClick={onReset}><RotateCcw size={16}/>Сбросить</button></div>
    <div className="ip-subnet__details" aria-live="polite">{state.prefix>30&&<p className="ip-subnet__special">{state.prefix===31?'/31: два адреса для связи точка-точка. Отдельного broadcast нет.':'/32: один адрес узла. Отдельного broadcast нет.'}</p>}
      {state.answer&&<dl className="ip-subnet__answers"><div><dt>Адрес сети</dt><dd>{result.network}</dd></div><div><dt>{state.prefix<=30?'Broadcast':'Верхняя граница'}</dt><dd>{result.broadcast}</dd></div><div><dt>Первый компьютер</dt><dd>{result.firstHost||'—'}</dd></div><div><dt>Последний компьютер</dt><dd>{result.lastHost||'—'}</dd></div></dl>}
      {state.explanation&&<p className="ip-subnet__explanation">Адрес сети = IP AND маска. Умножаем биты попарно: 1 сохраняет бит IP, 0 обнуляет его. Поэтому получаем <b>{result.network}</b>. Маска /{state.prefix} закрепляет {state.prefix} бит сети. Остаётся {32-state.prefix} бит: это 2<sup>{32-state.prefix}</sup> = {countLabel(result.count)} адресов. Заполним все биты компьютера единицами — получим <b>{result.broadcast}</b>.{state.prefix<=30?' Первый и последний адреса оставляем сети и broadcast; остальные доступны компьютерам.':' /31 и /32 — специальные случаи: /31 используют для связи точка-точка, /32 обозначает один адрес. Правило «минус два» для них не применяется.'}</p>}
      {!state.answer&&!state.explanation&&<p className="ip-subnet__hint">Попробуйте /27 вместо /26. В какой половине подсети окажется IP-адрес?</p>}
    </div>
  </div>;
}
