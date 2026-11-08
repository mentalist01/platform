// Trusted, versioned card types only. Sets contain data, never executable code.
import {DECIMAL_BINARY_CARD,BINARY_INPUT_LIMIT,normalizeDecimalBinaryParams} from './decimalBinary.js';
export const IP_SUBNET_CARD = 'ipv4-subnet-boundaries-v1';
export const subnetExamples = [
  {id:'home',label:'Небольшая подсеть',ip:'192.168.1.70',prefix:26},
  {id:'school',label:'Школьная сеть',ip:'192.168.10.130',prefix:27},
  {id:'office',label:'Переход через октет',ip:'172.16.5.200',prefix:22},
  {id:'small',label:'Всего четыре адреса',ip:'10.0.0.6',prefix:30},
];
export const parseIPv4 = value => {
  if(typeof value!=='string'||!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))return null;
  const octets=value.split('.').map(Number);
  return octets.every(n=>n<=255)?octets.reduce((n,octet)=>n*256+octet,0):null;
};
export const formatIPv4 = value => [24,16,8,0].map(shift=>Math.floor(value/2**shift)%256).join('.');
export function ipv4Subnet(ip,prefix) {
  const address=parseIPv4(ip);
  if(address===null||!Number.isInteger(prefix)||prefix<0||prefix>32)return null;
  const count=2**(32-prefix),network=Math.floor(address/count)*count,broadcast=network+count-1;
  // /31 point-to-point links and /32 host routes follow the standard special cases.
  return {ip:formatIPv4(address),prefix,address,network:formatIPv4(network),broadcast:formatIPv4(broadcast),
    firstHost:formatIPv4(prefix<=30?network+1:network),lastHost:formatIPv4(prefix<=30?broadcast-1:broadcast),
    count,hosts:prefix<=30?count-2:count,mask:formatIPv4(2**32-count),networkValue:network,broadcastValue:broadcast};
}
export function normalizeSubnetParams(input={}) {
  const ip=input.ip??subnetExamples[0].ip,prefix=Number(input.prefix??26);
  if(input.prefix===''||!ipv4Subnet(ip,prefix))throw Error('Укажите IPv4-адрес и длину маски от 0 до 32');
  return {ip:formatIPv4(parseIPv4(ip)),prefix};
}
export const interactiveTheoryTypes = Object.freeze({
  [DECIMAL_BINARY_CARD]:Object.freeze({id:DECIMAL_BINARY_CARD,name:'Из десятичной в двоичную',
    description:'Введите число или IP-адрес через точки — двоичный результат появится сразу, каждый октет из восьми бит.',
    category:'Системы счисления · IP-адреса',width:640,height:260,
    defaultParams:Object.freeze({value:'252'}),normalizeParams:normalizeDecimalBinaryParams,
    reset:params=>normalizeDecimalBinaryParams(params),
    normalizeState:(input,params)=>({value:typeof input?.value==='string'&&input.value.length<=BINARY_INPUT_LIMIT?input.value:normalizeDecimalBinaryParams(params).value}),
  }),
  [IP_SUBNET_CARD]:Object.freeze({id:IP_SUBNET_CARD,name:'Маска подсети и границы IP-адресов',
    description:'Меняйте маску и наблюдайте, как меняются адрес сети, broadcast и диапазон компьютеров.',
    category:'IP-адреса · ЕГЭ №10 (2027)',width:640,height:760,
    defaultParams:Object.freeze({ip:'192.168.1.70',prefix:26}),normalizeParams:normalizeSubnetParams,
    reset:params=>({...normalizeSubnetParams(params),answer:false,explanation:false}),
    normalizeState:(input,params)=>{const base=normalizeSubnetParams(params);return {...base,
      ...(parseIPv4(input?.ip)!==null?{ip:formatIPv4(parseIPv4(input.ip))}:{}),
      ...(Number.isInteger(input?.prefix)&&input.prefix>=0&&input.prefix<=32?{prefix:input.prefix}:{}),
      answer:input?.answer===true,explanation:input?.explanation===true};},
  }),
});
export const interactiveTheoryDefinition = id => Object.hasOwn(interactiveTheoryTypes,id||'')?interactiveTheoryTypes[id]:null;

export function preparedTheoryItems(set={}) {
  return Array.isArray(set.theoryItems)?set.theoryItems:(set.theoryImages||[]).map(assetId=>({id:assetId,kind:'image',assetId}));
}
export const preparedTheoryItemKeys = set => preparedTheoryItems(set).map(item=>item.id);
export const theoryCardItemKeys = card => card.theoryItemId?[card.theoryItemId]:(card.images||[]).map(image=>typeof image==='string'?image:image.id);
export const theoryCardIdentity = card => card.theoryItemId||card.images?.[0];
export function normalizeTheoryItems(input) {
  if(!Array.isArray(input)||input.length>8)throw Error('Добавьте до 8 листов теории');
  const seen=new Set();
  return input.map(raw=>{
    if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)||seen.has(raw.id))throw Error('У листов теории должны быть разные идентификаторы');
    seen.add(raw.id);
    if(raw.kind==='image'&&typeof raw.assetId==='string'&&raw.id===raw.assetId)return {id:raw.id,kind:'image',assetId:raw.assetId};
    const definition=raw.kind==='interactive'&&interactiveTheoryDefinition(raw.typeId);
    if(!definition)throw Error('Неизвестный тип интерактивной карточки. Обновите платформу.');
    return {id:raw.id,kind:'interactive',typeId:definition.id,params:definition.normalizeParams(raw.params)};
  });
}
