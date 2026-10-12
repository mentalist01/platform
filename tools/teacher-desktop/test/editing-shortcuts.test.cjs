'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isPageHistoryShortcut, routeEditingShortcuts } = require('../editing-shortcuts.cjs');

test('canvas and editor history shortcuts pass through the native menu in both layouts', () => {
  for (const input of [
    { key:'z', code:'KeyZ', control:true }, { key:'я', code:'KeyZ', control:true },
    { key:'н', code:'KeyY', control:true }, { key:'Z', meta:true, shift:true },
  ]) assert.equal(isPageHistoryShortcut({type:'keyDown',...input}),true);
  for (const input of [
    {key:'z'}, {key:'c',control:true}, {key:'r',control:true}, {key:'z',control:true,alt:true},
  ]) assert.equal(isPageHistoryShortcut({type:'keyDown',...input}),false);
  assert.equal(isPageHistoryShortcut({type:'keyUp',key:'z',control:true}),false);
});

test('routing leaves the original key event intact and restores other menu shortcuts', () => {
  const calls=[],contents=new EventEmitter();contents.isDestroyed=()=>false;contents.setIgnoreMenuShortcuts=value=>calls.push(value);
  routeEditingShortcuts(contents);
  const event={preventDefault(){throw Error('The page must receive its original keydown');}};
  contents.emit('before-input-event',event,{type:'keyDown',code:'KeyZ',control:true});
  contents.emit('before-input-event',event,{type:'keyDown',key:'c',control:true});
  contents.emit('before-input-event',event,{type:'keyDown',code:'KeyY',control:true});
  contents.emit('blur');
  assert.deepEqual(calls,[true,false,true,false]);
  contents.emit('destroyed');assert.equal(contents.listenerCount('before-input-event'),0);
});
