import fs from 'node:fs';

export const MAX_WORKBOOK_PARTS = 12;
export const validWorkbookTask = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 10000;
export const validWorkbookPartCount = value => Number.isInteger(value) && value >= 1 && value <= MAX_WORKBOOK_PARTS;

export class WorkbookPartSettings {
  constructor(filename, write) { this.filename = filename; this.write = write; }
  read() {
    try { return JSON.parse(fs.readFileSync(this.filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  count(teacherId, taskNumber) {
    const value = this.read()?.[teacherId]?.[Number(taskNumber)];
    return validWorkbookPartCount(value) ? value : 1;
  }
  set(teacherId, taskNumber, count) {
    const data = this.read();
    data[teacherId] = { ...data[teacherId], [Number(taskNumber)]: count };
    this.write(this.filename, data);
  }
}

export function workbookPartState(existing, count) {
  if (existing && Number.isInteger(existing.workbookPartNumber) && existing.workbookPartNumber > 0) {
    return { workbookPartNumber: existing.workbookPartNumber, workbookPartPending: false };
  }
  // Existing files without part metadata keep their location on the next Ctrl+S.
  // Only newly created solutions and explicitly pending solutions need a choice.
  if (existing && !existing.workbookPartPending) return {};
  return count > 1 ? { workbookPartPending: true } : { workbookPartNumber: 1, workbookPartPending: false };
}

export function registerWorkbookPartRoutes(app, { settings, readFiles, writeFiles, findStudent, ensureStudentAccess, ensureFolder, canWrite, lock }) {
  const accessible = (auth, student) => student && (
    auth?.role === 'admin' || (auth?.role === 'teacher' && student.teacherId === auth.id)
    || (auth?.role === 'student' && student.id === auth.id)
  );
  app.get('/api/workbook-parts/pending', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const items = readFiles().filter(file => {
      if (!file.workbookPartPending || !file.workbookSourceFileId || file.savedBy?.id !== req.auth?.id || file.savedBy?.role !== req.auth?.role) return false;
      return accessible(req.auth, findStudent(file.studentId));
    }).sort((a,b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0,100).map(file => {
      const student = findStudent(file.studentId);
      return { id:file.id, name:file.name, taskNumber:file.taskNumber, studentId:student.id, studentName:student.name, count:settings.count(student.teacherId,file.taskNumber) };
    });
    return res.json({ items });
  });
  app.get('/api/workbook-parts/:taskNumber', (req, res) => {
    if (!validWorkbookTask(req.params.taskNumber)) return res.status(400).json({error:'Некорректное задание'});
    const studentId = req.auth?.role === 'student' ? req.auth.id : String(req.query.studentId || '');
    const student = studentId ? ensureStudentAccess(req,res,studentId) : null;
    if (studentId && !student) return;
    const teacherId = student?.teacherId || (req.auth?.role === 'teacher' ? req.auth.id : '');
    if (!teacherId) return res.status(403).json({error:'Выберите ученика'});
    return res.json({count:settings.count(teacherId,req.params.taskNumber),maxCount:MAX_WORKBOOK_PARTS});
  });
  app.put('/api/workbook-parts/:taskNumber', (req, res) => {
    if (req.auth?.role !== 'teacher') return res.status(403).json({error:'Настройка доступна преподавателю'});
    if (!validWorkbookTask(req.params.taskNumber) || !validWorkbookPartCount(req.body?.count)) return res.status(400).json({error:`Укажите от 1 до ${MAX_WORKBOOK_PARTS} частей`});
    settings.set(req.auth.id,req.params.taskNumber,req.body.count);
    return res.json({count:req.body.count,maxCount:MAX_WORKBOOK_PARTS});
  });
  app.post('/api/workbook-parts/files/:id', async (req, res) => {
    const initial = readFiles().find(file => file.id === req.params.id);
    if (!initial?.workbookSourceFileId || !accessible(req.auth,findStudent(initial.studentId)) || !canWrite(req.auth,initial,findStudent(initial.studentId))) return res.status(404).json({error:'Решение не найдено'});
    try {
      const result = await lock(initial.workbookSolutionKey || initial.id, () => {
        const files = readFiles(), index = files.findIndex(file => file.id === initial.id);
        const current = files[index], student = current && findStudent(current.studentId);
        if (!current || !accessible(req.auth,student) || !canWrite(req.auth,current,student)) return {status:404,error:'Решение не найдено'};
        const count = settings.count(student.teacherId,current.taskNumber), part = req.body?.partNumber;
        if (!Number.isInteger(part) || part < 1 || part > count) return {status:400,error:'Выберите существующую часть задания'};
        if (req.body?.pendingOnly === true && !current.workbookPartPending) return { file:current };
        const folder = ensureFolder({studentId:student.id,taskNumber:current.taskNumber,category:current.category,partNumber:count > 1 ? part : 0});
        const file = {...current,folderId:folder.id,folderName:folder.name,workbookPartNumber:part,workbookPartPending:false};
        files[index] = file; writeFiles(files);
        return {file};
      });
      return result.error ? res.status(result.status).json({error:result.error}) : res.json(result);
    } catch (error) { console.error('[workbook-parts] assignment failed',error); return res.status(500).json({error:'Не удалось выбрать часть. Файл сохранён, попробуйте ещё раз.'}); }
  });
}
