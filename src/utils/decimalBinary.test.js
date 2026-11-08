import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {DECIMAL_BINARY_CARD,decimalBinary} from './decimalBinary.js';
import {interactiveTheoryDefinition,normalizeTheoryItems} from './interactiveTheoryCatalog.js';
import {interactiveTheoryState,updateInteractiveTheory} from './interactiveTheoryState.js';

test('decimal converter handles octets, dotted IPv4 and integers without floating point rounding',()=>{
  assert.deepEqual(decimalBinary('252'),['11111100']);
  assert.deepEqual(decimalBinary('5'),['00000101']);
  assert.deepEqual(decimalBinary('0'),['00000000']);
  assert.deepEqual(decimalBinary('256'),['100000000']);
  assert.deepEqual(decimalBinary('192.168.159.86'),['11000000','10101000','10011111','01010110']);
  assert.deepEqual(decimalBinary('0.1.128.255'),['00000000','00000001','10000000','11111111']);
  assert.deepEqual(decimalBinary(' 192 . 168 . 001 . 070 '),['11000000','10101000','00000001','01000110']);
  assert.deepEqual(decimalBinary('9007199254740993'),['1'+'0'.repeat(52)+'1']);
  for(const value of ['', '192.', '192.168', '256.1.1.1','1..1.1','1.2.3.4.5','-1','1.5','Infinity','<script>', '1'.repeat(81)])assert.equal(decimalBinary(value),null,value);
});
test('converter registry accepts only initial data and validates it independently from other card types',()=>{
  const definition=interactiveTheoryDefinition(DECIMAL_BINARY_CARD);
  assert.deepEqual(definition.reset(),{value:'252'});assert.equal(definition.height,260);
  const item={id:'converter',kind:'interactive',typeId:DECIMAL_BINARY_CARD,params:{value:'192.168.1.70',prefix:26,script:'bad'}};
  assert.deepEqual(normalizeTheoryItems([item])[0].params,{value:'192.168.1.70'});
  assert.throws(()=>normalizeTheoryItems([{...item,params:{value:'256.0.0.1'}}]),/IPv4/);
});
test('typing, incomplete drafts, complete addresses and reset share the existing board state without affecting a second instance',()=>{
  const teacher=new Y.Doc(),pupil=new Y.Doc(),card={id:'converter',interactive:{typeId:DECIMAL_BINARY_CARD,params:{value:'252'}}};
  teacher.getArray('items').push([{id:'anchor',x:100,y:200,width:640,height:260}]);
  updateInteractiveTheory(teacher,card,{value:'192.'});Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.equal(interactiveTheoryState(pupil,card).value,'192.');assert.equal(decimalBinary(interactiveTheoryState(pupil,card).value),null);
  updateInteractiveTheory(pupil,card,{value:'192.168.1.70'});Y.applyUpdate(teacher,Y.encodeStateAsUpdate(pupil));
  assert.equal(decimalBinary(interactiveTheoryState(teacher,card).value).join('.'),'11000000.10101000.00000001.01000110');
  assert.deepEqual(interactiveTheoryState(teacher,{...card,id:'other-converter'}),{value:'252'});
  updateInteractiveTheory(teacher,card,{}, {reset:true});Y.applyUpdate(pupil,Y.encodeStateAsUpdate(teacher));
  assert.deepEqual(interactiveTheoryState(pupil,card),{value:'252'});
  assert.deepEqual(teacher.getArray('items').toJSON(),[{id:'anchor',x:100,y:200,width:640,height:260}]);
  teacher.destroy();pupil.destroy();
});
