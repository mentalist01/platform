import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

// Kept outside student records so ordinary roster and student APIs never carry credentials.
export function createStudentAccessCodeStore({ dataDir }) {
  const filename = path.join(dataDir, 'student-access-codes.json');
  const keyfile = path.join(dataDir, 'student-access-codes.key');
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (data.version !== 1 || !data.codes || typeof data.codes !== 'object' || Array.isArray(data.codes)) throw Error('Invalid code vault');
      return data;
    } catch (error) { if (error.code === 'ENOENT') return { version: 1, codes: {} }; throw error; }
  };
  const key = data => {
    try {
      const value = fs.readFileSync(keyfile);
      if (value.length !== 32) throw Error('Invalid code vault key');
      return value;
    } catch (error) {
      if (error.code !== 'ENOENT' || Object.keys(data.codes).length) throw error;
      fs.mkdirSync(dataDir, { recursive: true });
      try { fs.writeFileSync(keyfile, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
      const value = fs.readFileSync(keyfile);
      if (value.length !== 32) throw Error('Invalid code vault key');
      return value;
    }
  };
  const fingerprint = hash => createHash('sha256').update(hash).digest('hex');
  const decrypt = (student, data) => {
    const record = data.codes[student.id];
    if (!record || !student.codeHash || record.credential !== fingerprint(student.codeHash)) return null;
    const cipher = createDecipheriv('aes-256-gcm', key(data), Buffer.from(record.iv, 'base64'));
    cipher.setAAD(Buffer.from(`${student.id}:${record.credential}`));
    cipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(record.value, 'base64')), cipher.final()]).toString('utf8');
  };
  return {
    get(student) { return decrypt(student, read()); },
    remember(student, code) {
      if (!student?.id || !student.codeHash || typeof code !== 'string' || !code || code.length > 128) throw Error('Invalid credential');
      const data = read();
      if (decrypt(student, data) === code) return;
      const iv = randomBytes(12), credential = fingerprint(student.codeHash);
      const cipher = createCipheriv('aes-256-gcm', key(data), iv);
      cipher.setAAD(Buffer.from(`${student.id}:${credential}`));
      const value = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
      data.codes[student.id] = { credential, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: value.toString('base64') };
      const temporary = `${filename}.${randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
        fs.renameSync(temporary, filename);
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    },
  };
}

export function registerStudentAccessCodes(app, { students, store, verify, normalize }) {
  const route = action => async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!['teacher', 'admin'].includes(req.auth?.role)) return res.status(403).json({ error: 'Код доступен только преподавателю.' });
    const student = students().find(row => row.id === req.params.id && !row.deletedAt
      && (req.auth.role === 'admin' || row.teacherId === req.auth.id));
    if (!student) return res.status(404).json({ error: 'Ученик не найден.' });
    try { res.json(await action(req, student)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Не удалось открыть сохранённый код. Попробуйте ещё раз.' }); }
  };
  app.get('/api/students/:id/access-code', route((req, student) => {
    const code = store.get(student);
    return { available: Boolean(code), ...(code ? { code } : {}) };
  }));
  app.put('/api/students/:id/access-code', route(async (req, student) => {
    const code = typeof req.body?.code === 'string' && req.body.code.length <= 128 ? normalize(req.body.code) : '';
    if (!code || !await verify(code, student.codeHash)) throw Object.assign(Error('Этот код не подходит ученику. Проверьте его или дождитесь следующего входа ученика.'), { status: 400 });
    store.remember(student, code);
    return { available: true, code };
  }));
}
