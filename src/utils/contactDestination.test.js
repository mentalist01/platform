import test from 'node:test';
import assert from 'node:assert/strict';
import {contactDestination} from './contactDestination.js';

test('contact icons follow the saved messenger URL including web clients', () => {
  for (const url of ['https://wa.me/79263651787','https://api.whatsapp.com/send?phone=79263651787','https://web.whatsapp.com/']) {
    assert.deepEqual(contactDestination(url),{id:'whatsapp',name:'WhatsApp'});
  }
  for (const url of ['https://t.me/+79263651787','https://telegram.me/example','https://web.telegram.org/a/#123','https://T.ME/example']) {
    assert.deepEqual(contactDestination(url),{id:'telegram',name:'Telegram'});
  }
});

test('unknown or misleading links keep the generic external-link icon', () => {
  for (const url of ['',undefined,'+7 926 365-17-87','https://vk.com/example','https://max.ru/u/123','https://wa.me.evil.example/','https://example.com/?url=https://t.me/example','javascript:https://t.me/example']) {
    assert.equal(contactDestination(url),null);
  }
});
