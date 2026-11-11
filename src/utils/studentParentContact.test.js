import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentParentContact, normalizeStudentContact, studentContactChannel, studentContactDraft, studentContactLinks, copyParentMessage } from './studentParentContact.js';

test('first contact opens an empty editor when the service has no saved contact', () => {
  for (const absent of [null, undefined, {}]) {
    assert.equal(studentContactChannel(absent), 'auto');
    const draft = studentContactDraft(absent);
    assert.deepEqual(draft, { name: '', contacts: [{ label: '', value: '', channel: 'auto' }], notes: '' });
    for (const normalize of [normalizeStudentContact, normalizeStudentParentContact]) {
      draft.contacts[0] = { label: 'Telegram', value: '@example_pupil', channel: 'telegram' };
      const saved = normalize(draft);
      assert.equal(saved.url, 'https://t.me/example_pupil');
      assert.deepEqual(normalize(studentContactDraft(saved)), saved);
    }
  }
});

test('pupil contacts accept the same safe messenger formats with their own validation labels', () => {
  assert.equal(normalizeStudentContact({url:'@example_pupil'}).url,'https://t.me/example_pupil');
  assert.equal(normalizeStudentContact({url:'+7 (999) 000-00-00'}).url,'https://t.me/+79990000000');
  assert.equal(normalizeStudentContact({url:'https://wa.me/79990000000'}).url,'https://wa.me/79990000000');
  assert.deepEqual(normalizeStudentContact({}),{name:'',url:''});
  assert.throws(()=>normalizeStudentContact({url:'javascript:alert(1)'}),/ученика/);
  assert.throws(()=>normalizeStudentContact({name:'Иван'}),/ученика/);
});

test('parent contact accepts full links, a messenger address and an empty contact', () => {
  assert.deepEqual(normalizeStudentParentContact({ name: ' Мама ', url: 't.me/example_parent' }), { name: 'Мама', url: 'https://t.me/example_parent' });
  assert.equal(normalizeStudentParentContact({ url: '@example_parent' }).url, 'https://t.me/example_parent');
  assert.equal(normalizeStudentParentContact({ url: 'https://wa.me/79990000000?text=hello' }).url, 'https://wa.me/79990000000?text=hello');
  assert.equal(normalizeStudentParentContact({ url: 'https://max.ru/u/test-contact' }).url, 'https://max.ru/u/test-contact');
  assert.equal(normalizeStudentParentContact({ url: 'web.max.ru/123456789' }).url, 'https://web.max.ru/123456789');
  assert.deepEqual(normalizeStudentParentContact({}), { name: '', url: '' });
});

test('phone inputs and formatted Telegram phone links become canonical chat links', () => {
  for (const url of ['+7 (999) 000-00-00', '8 (999) 000-00-00', '79990000000', '+7\u00a0999\u202f000-00-00', 'https://t.me/+7 9990000000', 't.me/+7 (999) 000-00-00/']) {
    assert.equal(normalizeStudentParentContact({ url }).url, 'https://t.me/+79990000000', url);
  }
  assert.equal(normalizeStudentParentContact({ url: '+44 7700 900123' }).url, 'https://t.me/+447700900123');
  assert.equal(normalizeStudentParentContact({ url: 'https://t.me/+7 (999) 000-00-00?text=Hello%20there' }).url, 'https://t.me/+79990000000?text=Hello%20there');
  for (const url of ['9990000000', '+123', '+1234567890123456', '+0000000000', '+7\t9990000000', 'https://t.me/+7\n9990000000']) {
    assert.throws(() => normalizeStudentParentContact({ url }), undefined, url);
  }
});

test('normalization preserves messenger links and only strips phone formatting on the exact Telegram host', () => {
  for (const url of ['https://t.me/+AbcDef_12345', 'https://t.me/parent?text=Hello%20there', 'https://max.ru/u/example', 'https://wa.me/79990000000?text=Hello%20there']) {
    assert.equal(normalizeStudentParentContact({ url }).url, url);
  }
  for (const url of ['https://t.me.evil.example/+7 9990000000', 'https://t.me/+79990000000?text=hello there', 'https://wa.me/7 9990000000', 'https://user:password@t.me/+7 9990000000']) {
    assert.throws(() => normalizeStudentParentContact({ url }), undefined, url);
  }
});

test('explicit messenger selection routes phone numbers and survives save, reload and editing', () => {
  for (const normalize of [normalizeStudentParentContact, normalizeStudentContact]) {
    const contact = normalize({name:'Александр',contacts:[{label:'Папа',value:'+7 926 365-17-87',channel:'whatsapp'}]});
    assert.equal(contact.url,'https://wa.me/79263651787');
    assert.equal(contact.contacts[0].value,'+7 926 365-17-87');
    assert.equal(studentContactDraft(contact).contacts[0].channel,'whatsapp');
    assert.deepEqual(normalize(JSON.parse(JSON.stringify(contact))),contact,'canonical links retain the messenger when normalized again');
    assert.deepEqual(normalize(studentContactDraft(contact)),contact);
    const changed=studentContactDraft(contact);changed.contacts[0].channel='telegram';
    assert.equal(normalize(changed).url,'https://t.me/+79263651787');
    assert.throws(()=>normalize({contacts:[{value:'+7 926 365-17-87',channel:'auto'}]}),/выберите Telegram или WhatsApp/);
    assert.throws(()=>normalize({contacts:[{value:'@example_parent',channel:'whatsapp'}]}),/WhatsApp/);
    assert.throws(()=>normalize({contacts:[{value:'https://wa.me.evil.example/79263651787',channel:'whatsapp'}]}),/WhatsApp/);
  }
  assert.equal(normalizeStudentParentContact({url:'https://wa.me/447700900123'}).url,'https://wa.me/447700900123');
  assert.equal(normalizeStudentParentContact({url:'https://t.me/+79263651787',channel:'whatsapp'}).url,'https://wa.me/79263651787');
  assert.equal(normalizeStudentParentContact({url:'8 (926) 365-17-87',channel:'whatsapp'}).url,'https://wa.me/79263651787');
  assert.equal(normalizeStudentParentContact({url:'https://wa.me/79263651787',channel:'telegram'}).url,'https://t.me/+79263651787');
});

test('stored parent links cannot execute script, expose URL credentials or silently keep malformed contacts', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.example', '/parent', 'https://user:secret@example.com/', 'https://vk.com/a\nb']) {
    assert.throws(() => normalizeStudentParentContact({ url }), undefined, url);
  }
  assert.throws(() => normalizeStudentParentContact({ name: 'Мама' }));
  assert.throws(() => normalizeStudentParentContact({ name: 'a'.repeat(81), url: 'https://t.me/example' }));
});

test('copying a parent report preserves the reviewed text and never marks or sends it', async () => {
  const text = 'Добрый день!\nОтчёт с правками учителя.';
  let copied;
  await copyParentMessage(text, { clipboard: { writeText: async value => { copied = value; } } }, { createElement: () => { throw Error('fallback not needed'); } });
  assert.equal(copied, text);
});

test('multiple named contact channels preserve display values, notes and a compatible primary URL',()=>{
  const contact=normalizeStudentParentContact({name:' Мама ',contacts:[{label:'Телефон',value:'8 (999) 000-00-00'},{label:'VK',value:'vk.com/example_parent'},{label:'',value:''}],notes:' После 18:00\nЛучше написать. '});
  assert.equal(contact.url,'https://t.me/+79990000000');
  assert.equal(contact.contacts.length,2);assert.equal(contact.contacts[1].url,'https://vk.com/example_parent');
  assert.equal(contact.notes,'После 18:00\nЛучше написать.');
  assert.deepEqual(normalizeStudentParentContact(studentContactDraft(contact)),contact);
  assert.equal(studentContactLinks(contact)[0].value,'8 (999) 000-00-00');
  assert.equal(studentContactLinks({name:'Мама',url:'https://t.me/parent'})[0].url,'https://t.me/parent');
  assert.deepEqual(normalizeStudentContact({name:'',contacts:[],notes:'Предпочитает Telegram'}),{name:'',url:'',contacts:[],notes:'Предпочитает Telegram'});
  for(const contacts of [[{value:'@example_pupil'},{value:'javascript:alert(1)'}],[{label:'Телефон',value:''}],Array(11).fill({value:'@example_pupil'}),'wrong'])
    assert.throws(()=>normalizeStudentContact({contacts}));
  assert.throws(()=>normalizeStudentContact({contacts:[],notes:'a'.repeat(2001)}));
});
