import crypto from 'node:crypto';
import {isDeepStrictEqual as equal} from 'node:util';

export const LIVE_WORKBOOK_LIMITS=Object.freeze({sheets:16,cells:250000,changes:10000,text:8192,bytes:18*1024*1024,rows:1048576,columns:16384});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const clone=value=>structuredClone(value);
export const liveDigest=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const liveEmpty=()=>({content:{kind:'empty'},fill:null});
export const liveCellKey=(sheet,address,property)=>`${sheet}/${address}/${property}`;
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,90}$/.test(value);
export function liveAddress(value){
  if(typeof value!=='string'||!/^\$?[A-Z]{1,3}\$?[1-9]\d{0,6}$/.test(value))return false;
  const match=value.replaceAll('$','').match(/^([A-Z]+)(\d+)$/);let column=0;
  for(const letter of match[1])column=column*26+letter.charCodeAt(0)-64;
  return column<=LIVE_WORKBOOK_LIMITS.columns&&Number(match[2])<=LIVE_WORKBOOK_LIMITS.rows;
}
export function normalizeLiveContent(value){
  if(!value||!['empty','number','text','formula','boolean'].includes(value.kind))fail('Неподдерживаемое содержимое ячейки');
  if(value.kind==='empty')return {kind:'empty'};
  if(value.kind==='number'){if(typeof value.value!=='number'||!Number.isFinite(value.value))fail('Некорректное число');return {kind:'number',value:value.value};}
  if(value.kind==='boolean'){if(typeof value.value!=='boolean')fail('Некорректное логическое значение');return {kind:'boolean',value:value.value};}
  if(typeof value.value!=='string'||value.value.length>LIVE_WORKBOOK_LIMITS.text||value.value.includes('\0'))fail('Слишком длинное значение ячейки');
  if(value.kind==='formula'&&(!value.value.startsWith('=')||/\[[^\]]*\]|\b(?:WEBSERVICE|DDE|HYPERLINK|RTD|CALL|REGISTER|EXEC)\s*\(|(?:https?|file):|\|/i.test(value.value)))fail('В совместной таблице внешние ссылки и вызывающие программы формулы недоступны');
  return {kind:value.kind,value:value.value};
}
const normalizeFill=value=>{if(value!==null&&(!Number.isInteger(value)||value<0||value>0xffffff))fail('Некорректная заливка');return value;};
const borderStyles=new Set(['thin','medium','thick','hair','dashed','mediumDashed','dotted','double','dashDot','mediumDashDot','dashDotDot','mediumDashDotDot','slantDashDot']);
export function normalizeLiveBorders(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['left','right','top','bottom'].includes(key)))fail('Некорректные границы ячейки');
  const result={};
  for(const edge of ['left','right','top','bottom'])if(value[edge]!=null){
    const line=value[edge];if(!borderStyles.has(line?.style)||!Number.isInteger(line.color)||line.color<0||line.color>0xffffff)fail('Некорректная линия границы');
    result[edge]={style:line.style,color:line.color};
  }
  return Object.keys(result).length?result:null;
}
const emptyCell=cell=>cell.content.kind==='empty'&&cell.fill===null&&!cell.borders;
function normalizeFilter(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.columns)||value.columns.length>LIVE_WORKBOOK_LIMITS.columns||!Array.isArray(value.hiddenRows)||value.hiddenRows.length>100000)fail('Некорректный фильтр таблицы');
  const range=value.range??null,parts=typeof range==='string'?range.split(':'):[];
  if(range!==null&&(parts.length!==2||!parts.every(address=>liveAddress(address)&&!address.includes('$'))))fail('Некорректный диапазон фильтра');
  const at=address=>{const [,letters,row]=address.match(/^([A-Z]+)(\d+)$/);return {column:[...letters].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0),row:Number(row)};};
  const start=range?at(parts[0]):null,end=range?at(parts[1]):null;
  if(start&&(start.row>end.row||start.column>end.column))fail('Некорректные границы фильтра');
  const seen=new Set();
  const columns=value.columns.map(field=>{
    if(!Number.isInteger(field?.column)||field.column<0||field.column>=LIVE_WORKBOOK_LIMITS.columns||start&&field.column>end.column-start.column||seen.has(field.column)||typeof field.and!=='boolean'||!Array.isArray(field.tests)||!field.tests.length||field.tests.length>10000||field.and&&field.tests.length>2)fail('Некорректное условие фильтра');
    seen.add(field.column);
    const tests=field.tests.map(test=>{
      if(!['equal','notEqual','lessThan','lessThanOrEqual','greaterThan','greaterThanOrEqual'].includes(test?.operator)||typeof test.value!=='string'||test.value.length>8192||test.value.includes('\0'))fail('Некорректное значение фильтра');
      return {operator:test.operator,value:test.value};
    });
    return {column:field.column,and:field.and,tests};
  });
  let previous=0;
  const hiddenRows=value.hiddenRows.map(pair=>{
    if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isInteger)||pair[0]<=previous||pair[1]<pair[0]||pair[1]>LIVE_WORKBOOK_LIMITS.rows)fail('Некорректные скрытые строки');
    previous=pair[1];return [...pair];
  });
  if(range===null&&columns.length)fail('Для фильтра нужен диапазон');
  return {range,columns,hiddenRows};
}
export function normalizeLiveBook(value){
  if(!value||!Array.isArray(value.sheets)||!value.sheets.length||value.sheets.length>LIVE_WORKBOOK_LIMITS.sheets)fail('В книге должно быть от 1 до 16 листов');
  let count=0;const ids=new Set(),names=new Set();
  const sheets=value.sheets.map(sheet=>{
    if(!id(sheet.id)||ids.has(sheet.id)||typeof sheet.name!=='string'||!sheet.name.trim()||sheet.name.length>31||/[\[\]:*?/\\\0]/.test(sheet.name)||names.has(sheet.name.toLowerCase()))fail('Некорректные листы книги');
    ids.add(sheet.id);names.add(sheet.name.toLowerCase());
    if(!sheet.cells||typeof sheet.cells!=='object'||Array.isArray(sheet.cells))fail('Некорректные ячейки');
    const cells={};
    for(const address of Object.keys(sheet.cells).sort()){
      if(!liveAddress(address)||address.includes('$'))fail('Некорректный адрес ячейки');
      const source=sheet.cells[address],cell={content:normalizeLiveContent(source?.content),fill:normalizeFill(source?.fill??null)};
      const borders=normalizeLiveBorders(source?.borders);if(borders)cell.borders=borders;
      if(emptyCell(cell))continue;
      if(++count>LIVE_WORKBOOK_LIMITS.cells)fail('Для совместного режима слишком много заполненных ячеек',413);
      cells[address]=cell;
    }
    return {id:sheet.id,name:sheet.name,cells,...(sheet.filter?{filter:normalizeFilter(sheet.filter)}:{})};
  });
  const result={sheets};if(Buffer.byteLength(JSON.stringify(result))>LIVE_WORKBOOK_LIMITS.bytes)fail('Книга слишком велика для совместного режима',413);
  return result;
}

export function createLiveState(book,sourceHash){
  return {format:1,revision:0,structureRevision:0,book:normalizeLiveBook(book),sourceHash,versions:{},receipts:{},history:[],checkpointRevision:0};
}
export function liveResponse(state,since=-1){
  if(!state)return {initialized:false,revision:0};
  const result={initialized:true,revision:state.revision,structureRevision:state.structureRevision||0,checkpointRevision:state.checkpointRevision,sourceHash:state.sourceHash};
  const history=state.history.filter(entry=>entry.revision>since);
  if(Number.isInteger(since)&&since>=0&&since<=state.revision&&(since===state.revision||history[0]?.revision===since+1))return {...result,events:clone(history)};
  return {...result,book:clone(state.book),versions:clone(state.versions)};
}

// Returns a new state. The caller durably journals it before replacing the live
// reference or acknowledging the operation; partial batches are never visible.
export function applyLiveBatch(state,actor,input,now=Date.now()){
  if(!state)fail('Сначала подключите исходную таблицу',409);
  if(!id(input?.id)||!['patch','replace','filter','undo','redo'].includes(input.type))fail('Некорректная команда таблицы');
  const receiptKey=liveDigest(`${actor}\0${input.id}`),fingerprint=liveDigest(input),prior=state.receipts[receiptKey];
  if(prior){if(prior.fingerprint!==fingerprint)fail('Команда с таким номером уже использована',409);return {state,receipt:clone(prior.receipt),duplicate:true};}
  let changes=[],replacement=null,filters=null,undoOf='';
  const sheets=new Map(state.book.sheets.map(sheet=>[sheet.id,sheet]));
  if(input.type==='replace'){
    if(input.baseRevision!==state.revision)fail('Таблицу успел изменить другой участник. Структурные изменения сохранены в вашей копии; сначала согласуйте версии.',409);
    replacement=normalizeLiveBook(input.book);
  }else if(input.type==='filter'){
    if(input.baseRevision!==state.revision)fail('Таблицу успел изменить другой участник. Сначала согласуйте фильтр и последние правки.',409);
    if(!Array.isArray(input.filters)||!input.filters.length||input.filters.length>LIVE_WORKBOOK_LIMITS.sheets)fail('Некорректные фильтры листов');
    const seen=new Set();filters=input.filters.map(item=>{
      if(!sheets.has(item?.sheetId)||seen.has(item.sheetId))fail('Некорректный лист фильтра');seen.add(item.sheetId);
      return {sheetId:item.sheetId,value:item.value===null?null:normalizeFilter(item.value)};
    });
    replacement={...state.book,sheets:state.book.sheets.map(sheet=>{
      const update=filters.find(item=>item.sheetId===sheet.id);if(!update)return sheet;
      const result={...sheet};if(update.value)result.filter=clone(update.value);else delete result.filter;return result;
    })};
    if(Buffer.byteLength(JSON.stringify(replacement))>LIVE_WORKBOOK_LIMITS.bytes)fail('Книга слишком велика для совместного режима',413);
  }else if(input.type==='undo'||input.type==='redo'){
    const target=state.history.find(entry=>entry.id===input.targetId&&entry.actor===actor);
    if(!target||!target.changes?.length)fail('Это изменение больше нельзя отменить. Локальная копия сохранена.',409);
    changes=target.changes.map(change=>({sheetId:change.sheetId,address:change.address,property:change.property,value:clone(change.before),baseVersion:target.revision}));
    undoOf=target.id;
  }else{
    if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>LIVE_WORKBOOK_LIMITS.changes)fail('Некорректный диапазон изменений');
    const seen=new Set();
    changes=input.changes.map(change=>{
      if(!sheets.has(change?.sheetId)||!liveAddress(change.address)||change.address.includes('$')||!['content','fill','borders'].includes(change.property)||!Number.isSafeInteger(change.baseVersion)||change.baseVersion<0)fail('Некорректная правка ячейки');
      const key=liveCellKey(change.sheetId,change.address,change.property);if(seen.has(key))fail('Ячейка повторяется в команде');seen.add(key);
      return {...change,value:change.property==='content'?normalizeLiveContent(change.value):change.property==='borders'?normalizeLiveBorders(change.value):normalizeFill(change.value)};
    });
  }
  const conflicts=[];
  for(const change of changes){
    const sheet=sheets.get(change.sheetId);if(!sheet)fail('Лист уже изменён',409);
    const current=(sheet.cells[change.address]||liveEmpty())[change.property]??null,key=liveCellKey(change.sheetId,change.address,change.property);
    if(!equal(current,change.value)&&(state.versions[key]||state.structureRevision||0)!==change.baseVersion)conflicts.push({sheetId:change.sheetId,address:change.address,property:change.property,local:change.value,remote:current,version:state.versions[key]||state.structureRevision||0});
  }
  if(conflicts.length)return {state,receipt:{id:input.id,status:'conflict',revision:state.revision,conflicts},conflict:true};
  const next={...state,book:{...state.book,sheets:state.book.sheets.map(sheet=>({...sheet,cells:sheet.cells}))},versions:{...state.versions},receipts:{...state.receipts},history:[...state.history]},revision=state.revision+1;
  const actual=[];
  if(replacement){next.book=replacement;next.structureRevision=revision;next.versions={};}
  else{
    const touched=new Set(changes.map(change=>change.sheetId));for(const sheet of next.book.sheets)if(touched.has(sheet.id))sheet.cells={...sheet.cells};
    const targetSheets=new Map(next.book.sheets.map(sheet=>[sheet.id,sheet]));
    for(const change of changes){
      const sheet=targetSheets.get(change.sheetId),before=clone((sheet.cells[change.address]||liveEmpty())[change.property]??null);
      if(equal(before,change.value))continue;
      const cell={...(sheet.cells[change.address]||liveEmpty())};if(change.property==='borders'&&change.value===null)delete cell.borders;else cell[change.property]=clone(change.value);
      if(emptyCell(cell))delete sheet.cells[change.address];else sheet.cells[change.address]=cell;
      next.versions[liveCellKey(change.sheetId,change.address,change.property)]=revision;
      actual.push({...change,before});
    }
  }
  const changed=Boolean(replacement)||actual.length>0;
  const receipt={id:input.id,status:changed?'accepted':'unchanged',revision:changed?revision:state.revision};
  next.receipts[receiptKey]={fingerprint,receipt,at:now};
  // Bound duplicate receipts by age and size; still longer than reconnects in
  // a lesson. Clients retain the unacknowledged command on disk.
  const receiptKeys=Object.keys(next.receipts);for(const key of receiptKeys)if(next.receipts[key].at<now-7*86400000)delete next.receipts[key];
  for(const key of Object.keys(next.receipts).slice(0,Math.max(0,Object.keys(next.receipts).length-10000)))delete next.receipts[key];
  if(changed){
    next.revision=revision;
    next.history.push({id:input.id,actor,revision,at:now,...(filters?{filters:clone(filters)}:replacement?{book:clone(replacement)}:{changes:actual}),...(undoOf?{undoOf}:{})});
    next.history=next.history.slice(-300);
    let bytes=0,start=next.history.length-1;for(;start>=0;start--){bytes+=Buffer.byteLength(JSON.stringify(next.history[start]));if(bytes>2*1024*1024)break;}
    if(start>=0)next.history=next.history.slice(start+1);
  }
  return {state:next,receipt,event:changed?next.history.at(-1):null};
}
