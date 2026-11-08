import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {IP_SUBNET_CARD,ipv4Subnet,normalizeTheoryItems,preparedTheoryItems,interactiveTheoryDefinition} from './interactiveTheoryCatalog.js';
import {interactiveTheoryState,updateInteractiveTheory} from './interactiveTheoryState.js';

test('IPv4 subnet boundaries match the requested example and changes cross octets without signed overflow',()=>{
  const result=ipv4Subnet('192.168.1.70',26);
  assert.deepEqual([result.network,result.broadcast,result.firstHost,result.lastHost,result.mask,result.count,result.hosts],
    ['192.168.1.64','192.168.1.127','192.168.1.65','192.168.1.126','255.255.255.192',64,62]);
  const narrower=ipv4Subnet('192.168.1.70',27);
  assert.deepEqual([narrower.network,narrower.broadcast,narrower.count,narrower.hosts],['192.168.1.64','192.168.1.95',32,30]);
  const crossing=ipv4Subnet('172.16.5.200',22);
  assert.deepEqual([crossing.network,crossing.broadcast,crossing.firstHost,crossing.lastHost],['172.16.4.0','172.16.7.255','172.16.4.1','172.16.7.254']);
  const all=ipv4Subnet('255.255.255.255',0);
  assert.deepEqual([all.network,all.broadcast,all.count,all.hosts],['0.0.0.0','255.255.255.255',4294967296,4294967294]);
  for(const prefix of [31,32]){const special=ipv4Subnet('192.168.1.70',prefix);assert.equal(special.firstHost,'192.168.1.70');assert.equal(special.hosts,2**(32-prefix));}
  for(const [ip,prefix] of [['256.1.2.3',24],['1.2.3',24],['<script>',2],['1.2.3.4',-1],['1.2.3.4',33],['1.2.3.4',1.5]])assert.equal(ipv4Subnet(ip,prefix),null);
});

test('registry contains data-only validated instances and legacy images keep their identities',()=>{
  assert.deepEqual(preparedTheoryItems({theoryImages:['image-a']}),[{id:'image-a',kind:'image',assetId:'image-a'}]);
  const cards=normalizeTheoryItems([{id:'interactive-a',kind:'interactive',typeId:IP_SUBNET_CARD,params:{ip:'10.0.0.6',prefix:30,script:'evil'},html:'evil'}]);
  assert.deepEqual(cards,[{id:'interactive-a',kind:'interactive',typeId:IP_SUBNET_CARD,params:{ip:'10.0.0.6',prefix:30}}]);
  assert.equal(interactiveTheoryDefinition('__proto__'),null);
  assert.throws(()=>normalizeTheoryItems([{id:'a',kind:'interactive',typeId:'javascript:anything'}]),/Неизвестный/);
  assert.throws(()=>normalizeTheoryItems([...cards,...cards]),/разные/);
  assert.throws(()=>normalizeTheoryItems([{...cards[0],params:{ip:'999.0.0.1'}}]),/IPv4/);
});

test('existing Yjs board synchronizes live controls independently from layout and saved defaults, supports concurrent changes and reset',()=>{
  const teacher=new Y.Doc(),pupil=new Y.Doc(),card={id:'card-a',interactive:{typeId:IP_SUBNET_CARD,params:{ip:'192.168.1.70',prefix:26}}};
  teacher.getArray('items').push([{id:'anchor',x:10,y:20,width:640,height:760}]);
  Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  updateInteractiveTheory(teacher,card,{prefix:27});
  Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.equal(interactiveTheoryState(pupil,card).prefix,27);
  updateInteractiveTheory(pupil,card,{answer:true});updateInteractiveTheory(teacher,card,{explanation:true});
  Y.applyUpdate(teacher,Y.encodeStateAsUpdate(pupil));Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(interactiveTheoryState(teacher,card),interactiveTheoryState(pupil,card));
  assert.equal(interactiveTheoryState(pupil,card).answer,true);assert.equal(interactiveTheoryState(pupil,card).explanation,true);
  assert.equal(card.interactive.params.prefix,26);
  assert.deepEqual(teacher.getArray('items').toJSON(),[{id:'anchor',x:10,y:20,width:640,height:760}]);
  assert.equal(interactiveTheoryState(pupil,{...card,id:'other-card'}).prefix,26);
  assert.equal(updateInteractiveTheory(pupil,card,{prefix:5},{readOnly:true}),false);
  updateInteractiveTheory(teacher,card,{}, {reset:true});Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(interactiveTheoryState(pupil,card),{ip:'192.168.1.70',prefix:26,answer:false,explanation:false});
  teacher.destroy();pupil.destroy();
});
