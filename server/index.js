import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 5175;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'files.json');
const foldersFile = path.join(dataDir, 'folders.json');
const studentsFile = path.join(dataDir, 'students.json');
const progressFile = path.join(dataDir, 'progress.json');
const MAX_TASK_BYTES = 100 * 1024 * 1024;
const TEACHER_CODE = process.env.TEACHER_CODE || 'admin100';
const TEACHER_NAME = process.env.TEACHER_NAME || 'Иван Викторович';
const LEVEL_WEIGHTS = {
  basic: 70,
  advanced: 20,
  expert: 10,
};


fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

app.use(express.json());

const readFilesDb = () => {
  try {
    const raw = fs.readFileSync(dataFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const migrateFileNames = () => {
  const files = readFilesDb();
  let changed = false;
  for (const file of files) {
    if (typeof file?.name !== 'string') continue;
    const fixed = normalizeFileName(file.name);
    if (fixed && fixed !== file.name) {
      file.name = fixed;
      changed = true;
    }
  }
  if (changed) writeFilesDb(files);
};

const readFoldersDb = () => {
  try {
    const raw = fs.readFileSync(foldersFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const readStudentsDb = () => {
  try {
    const raw = fs.readFileSync(studentsFile, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const readProgressDb = () => {
  try {
    const raw = fs.readFileSync(progressFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeFilesDb = (data) => {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeFoldersDb = (data) => {
  fs.writeFileSync(foldersFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeStudentsDb = (data) => {
  fs.writeFileSync(studentsFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeProgressDb = (data) => {
  fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), 'utf8');
};

const computeTaskProgress = (taskEntry = {}) => {
  const levelProgressValues = Object.entries(taskEntry).map(([levelKey, entry]) => {
    const entryTotal = Number(entry?.totalQuestions) || 0;
    const entrySolved = Array.isArray(entry?.solved) ? entry.solved.length : 0;
    if (!entryTotal || entrySolved === 0) return 0;

    const weight = LEVEL_WEIGHTS[levelKey];
    if (Number.isFinite(weight)) {
      const raw = (entrySolved / entryTotal) * weight;
      return Math.max(0, raw);
    }

    const entryMax = Number(entry?.levelMax) || 0;
    if (!entryMax) return 0;
    const raw = (entrySolved / entryTotal) * entryMax;
    return Math.max(0, raw);
  });
  return Math.round(levelProgressValues.reduce((sum, val) => sum + val, 0));
};

const recomputeProgressFromSolved = (data) => {
  const baseProgress = { ...(data.progress || {}) };
  const solvedByTask = data.solvedByTask && typeof data.solvedByTask === 'object' ? data.solvedByTask : {};
  Object.entries(solvedByTask).forEach(([taskKey, entry]) => {
    baseProgress[taskKey] = computeTaskProgress(entry || {});
  });
  return baseProgress;
};

const getStudentData = (studentId) => {
  const db = readProgressDb();
  const raw = db[studentId];
  if (!raw) return { progress: {}, notes: '', notesByTask: {}, mocks: [], schedule: [], solvedByTask: {}, nextLesson: { homeWork: '', lessonLink: '', boardLink: '' } };
  if (raw.progress || raw.notes || raw.notesByTask || raw.mocks || raw.schedule || raw.solvedByTask) {
    return {
      progress: raw.progress || {},
      notes: raw.notes || '',
      notesByTask: raw.notesByTask && typeof raw.notesByTask === 'object' ? raw.notesByTask : {},
      mocks: Array.isArray(raw.mocks) ? raw.mocks : [],
      schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
      solvedByTask: raw.solvedByTask && typeof raw.solvedByTask === 'object' ? raw.solvedByTask : {},
      nextLesson: raw.nextLesson && typeof raw.nextLesson === 'object' ? raw.nextLesson : { homeWork: '', lessonLink: '', boardLink: '' },
    };
  }
  return { progress: raw, notes: '', notesByTask: {}, mocks: [], schedule: [], solvedByTask: {}, nextLesson: { homeWork: '', lessonLink: '', boardLink: '' } };
};

const setStudentData = (studentId, data) => {
  const db = readProgressDb();
  const payload = {
    progress: data.progress || {},
    notes: data.notes || '',
    notesByTask: data.notesByTask && typeof data.notesByTask === 'object' ? data.notesByTask : {},
    mocks: Array.isArray(data.mocks) ? data.mocks : [],
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
    solvedByTask: data.solvedByTask && typeof data.solvedByTask === 'object' ? data.solvedByTask : {},
    nextLesson: data.nextLesson && typeof data.nextLesson === 'object' ? data.nextLesson : { homeWork: '', lessonLink: '', boardLink: '' },
  };
  db[studentId] = payload;
  writeProgressDb(db);
  return payload;
};

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const parseSizeString = (value) => {
  if (typeof value !== 'string') return 0;
  const normalized = value.replace(',', '.').trim();
  const match = normalized.match(/^([\d.]+)\s*(KB|MB|GB)?$/i);
  if (!match) return 0;
  const num = Number(match[1]);
  if (!Number.isFinite(num)) return 0;
  const unit = (match[2] || 'MB').toUpperCase();
  if (unit === 'KB') return Math.round(num * 1024);
  if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
  return Math.round(num * 1024 * 1024);
};

const normalizeFolderName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const normalizeStudentName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const generateStudentCode = (students) => {
  let code = '';
  const existing = new Set(students.map((s) => s.code));
  while (!code || existing.has(code)) {
    code = String(crypto.randomInt(100000, 999999));
  }
  return code;
};

const ensureDefaultStudent = () => {
  const students = readStudentsDb();
  if (students.length === 0) {
    const entry = {
      id: crypto.randomUUID(),
      name: 'Ученик 1',
      code: generateStudentCode(students),
      createdAt: new Date().toISOString(),
    };
    students.push(entry);
    writeStudentsDb(students);
  }
  return students;
};

const ensureStudentIds = () => {
  const students = ensureDefaultStudent();
  const defaultId = students[0]?.id;
  if (!defaultId) return;

  const files = readFilesDb();
  let filesChanged = false;
  for (const file of files) {
    if (!file.studentId) {
      file.studentId = defaultId;
      filesChanged = true;
    }
  }
  if (filesChanged) writeFilesDb(files);

  const folders = readFoldersDb();
  let foldersChanged = false;
  for (const folder of folders) {
    if (!folder.studentId) {
      folder.studentId = defaultId;
      foldersChanged = true;
    }
  }
  if (foldersChanged) writeFoldersDb(folders);
};

const looksMojibake = (name) => {
  if (!name) return false;
  // Typical UTF-8 bytes read as Latin-1: "Ð", "Ñ"
  return /[ÐÑ]/.test(name) && !/[\u0400-\u04FF]/.test(name);
};

const normalizeFileName = (name) => {
  if (typeof name !== 'string') return '';
  if (looksMojibake(name)) {
    try {
      const fixed = Buffer.from(name, 'latin1').toString('utf8');
      if (fixed) return fixed;
    } catch {}
  }
  return name;
};

migrateFileNames();
ensureStudentIds();

const getEntrySizeBytes = (entry) => {
  if (!entry) return 0;
  if (Number.isFinite(entry.sizeBytes)) return entry.sizeBytes;
  if (entry.storageName) {
    try {
      const stat = fs.statSync(path.join(uploadsDir, entry.storageName));
      return stat.size || 0;
    } catch {}
  }
  return parseSizeString(entry.size);
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    req.fileId = id;
    const safeName = path.basename(normalizeFileName(file.originalname));
    cb(null, `${id}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use('/uploads', express.static(uploadsDir));

app.post('/api/login', (req, res) => {
  const { email, code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Введите код доступа' });
  if (code === TEACHER_CODE) {
    return res.json({ id: 'admin1', name: TEACHER_NAME, email, role: 'teacher' });
  }
  const students = readStudentsDb();
  const student = students.find((s) => s.code === code);
  if (!student) {
    return res.status(401).json({ error: 'Неверный код доступа' });
  }
  res.json({ id: student.id, name: student.name, email, role: 'student' });
});

app.get('/api/students', (_req, res) => {
  const students = readStudentsDb();
  res.json(students);
});

app.post('/api/students', (req, res) => {
  const { name } = req.body || {};
  const studentName = normalizeStudentName(name);
  if (!studentName) return res.status(400).json({ error: 'Введите имя ученика' });
  if (studentName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[/\\]/.test(studentName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const students = readStudentsDb();
  const entry = {
    id: crypto.randomUUID(),
    name: studentName,
    code: generateStudentCode(students),
    createdAt: new Date().toISOString(),
  };
  students.unshift(entry);
  writeStudentsDb(students);
  res.json(entry);
});

app.delete('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });

  students.splice(idx, 1);
  writeStudentsDb(students);

  const files = readFilesDb();
  const remainingFiles = [];
  const removedFiles = [];
  for (const file of files) {
    if (file.studentId === id) removedFiles.push(file);
    else remainingFiles.push(file);
  }
  if (removedFiles.length > 0) {
    writeFilesDb(remainingFiles);
    for (const file of removedFiles) {
      if (file?.storageName) {
        const filePath = path.join(uploadsDir, file.storageName);
        fs.unlink(filePath, () => {});
      }
    }
  }

  const folders = readFoldersDb().filter((f) => f.studentId !== id);
  writeFoldersDb(folders);

  const progressDb = readProgressDb();
  if (progressDb[id]) {
    delete progressDb[id];
    writeProgressDb(progressDb);
  }

  res.json({ ok: true });
});

app.get('/api/progress', (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const data = getStudentData(studentId);
  const progress = recomputeProgressFromSolved(data);
  res.json(progress || {});
});

app.patch('/api/progress', (req, res) => {
  const { studentId, taskId, value } = req.body || {};
  if (!studentId || !Number.isFinite(Number(taskId))) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return res.status(400).json({ error: 'Некорректное значение' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }

  const data = getStudentData(studentId);
  const key = String(taskId);
  const clamped = Math.max(0, Math.min(100, score));
  const progress = { ...(data.progress || {}) };
  progress[key] = clamped;
  const updated = setStudentData(studentId, { ...data, progress });
  res.json(updated.progress);
});

app.post('/api/progress/solve', (req, res) => {
  const { studentId, taskNumber, levelId, questionId, totalQuestions, levelMax, levelTotals } = req.body || {};
  if (!studentId || !taskNumber || !levelId || !questionId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const taskNum = Number(taskNumber);
  const total = Number(totalQuestions);
  const maxScore = Number(levelMax);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }

  const data = getStudentData(studentId);
  const solvedByTask = { ...(data.solvedByTask || {}) };
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const taskEntry = { ...(solvedByTask[taskKey] || {}) };
  const levelEntry = { ...(taskEntry[levelKey] || {}) };

  const solvedList = Array.isArray(levelEntry.solved) ? [...levelEntry.solved] : [];
  const qKey = String(questionId);
  if (!solvedList.includes(qKey)) {
    solvedList.push(qKey);
  }
  if (Number.isFinite(total) && total > 0) levelEntry.totalQuestions = total;
  if (Number.isFinite(maxScore) && maxScore > 0) levelEntry.levelMax = maxScore;

  levelEntry.solved = solvedList;
  taskEntry[levelKey] = levelEntry;
  solvedByTask[taskKey] = taskEntry;

  if (levelTotals && typeof levelTotals === 'object') {
    Object.entries(levelTotals).forEach(([lvl, count]) => {
      const totalCount = Number(count);
      if (!Number.isFinite(totalCount) || totalCount <= 0) return;
      const key = String(lvl);
      const existing = taskEntry[key] || {};
      taskEntry[key] = { ...existing, totalQuestions: totalCount };
    });
  }
  const taskProgress = computeTaskProgress(taskEntry);

  const progress = { ...(data.progress || {}) };
  progress[taskKey] = taskProgress;

  const updated = setStudentData(studentId, { ...data, solvedByTask, progress });
  res.json({ taskProgress, progress: updated.progress });
});

app.get('/api/progress/solved', (req, res) => {
  const { studentId, taskNumber, levelId } = req.query;
  if (!studentId || !taskNumber || !levelId) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const taskNum = Number(taskNumber);
  if (!Number.isFinite(taskNum)) {
    return res.status(400).json({ error: 'Некорректный номер задания' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  const taskKey = String(taskNum);
  const levelKey = String(levelId);
  const solved = data?.solvedByTask?.[taskKey]?.[levelKey]?.solved || [];
  res.json(Array.isArray(solved) ? solved : []);
});

app.get('/api/student-data', (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  const progress = recomputeProgressFromSolved(data);
  res.json({ ...data, progress });
});

app.patch('/api/student-notes', (req, res) => {
  const { studentId, notes, notesByTask } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  const payload = { ...data };
  if (typeof notesByTask === 'object' && notesByTask !== null) {
    payload.notesByTask = notesByTask;
  } else {
    payload.notes = String(notes ?? '').trim();
  }
  const updated = setStudentData(studentId, payload);
  res.json({ notes: updated.notes, notesByTask: updated.notesByTask || {} });
});

app.post('/api/mocks', (req, res) => {
  const { studentId, date, score, comment } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const examDate = typeof date === 'string' && date.trim() ? date.trim() : new Date().toISOString().slice(0, 10);
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return res.status(400).json({ error: 'Некорректный балл' });
  }
  const clamped = Math.max(0, Math.min(100, numericScore));
  const entry = {
    id: crypto.randomUUID(),
    date: examDate,
    score: clamped,
    comment: typeof comment === 'string' ? comment.trim() : '',
    createdAt: new Date().toISOString(),
  };
  const data = getStudentData(studentId);
  const mocks = [entry, ...(data.mocks || [])];
  setStudentData(studentId, { ...data, mocks });
  res.json(entry);
});

app.delete('/api/mocks/:id', (req, res) => {
  const { id } = req.params;
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  const mocks = (data.mocks || []).filter((m) => m.id !== id);
  setStudentData(studentId, { ...data, mocks });
  res.json({ ok: true });
});

app.get('/api/student-schedule', (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  res.json(data.schedule || []);
});

app.post('/api/student-schedule', (req, res) => {
  const { studentId, day, date, time, subject, note, boardLink, lessonLink } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const trimmedDate = typeof date === 'string' ? date.trim() : '';
  const trimmedDay = typeof day === 'string' ? day.trim() : '';
  if ((!trimmedDate && !trimmedDay) || !time || !subject) {
    return res.status(400).json({ error: '\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0434\u0430\u0442\u0443, \u0432\u0440\u0435\u043c\u044f \u0438 \u043f\u0440\u0435\u0434\u043c\u0435\u0442' });
  }
  if (trimmedDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmedDate)) {
    return res.status(400).json({ error: '\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u0430\u044f \u0434\u0430\u0442\u0430' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const resolvedDay = (() => {
    if (trimmedDay) return trimmedDay;
    if (!trimmedDate) return '';
    const dt = new Date(`${trimmedDate}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '';
    const label = dt.toLocaleDateString('ru-RU', { weekday: 'long' });
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
  })();

  const entry = {
    id: crypto.randomUUID(),
    date: trimmedDate || null,
    day: resolvedDay,
    time: String(time).trim(),
    subject: String(subject).trim(),
    note: typeof note === 'string' ? note.trim() : '',
    boardLink: typeof boardLink === 'string' ? boardLink.trim() : '',
    lessonLink: typeof lessonLink === 'string' ? lessonLink.trim() : '',
    createdAt: new Date().toISOString(),
  };
  const data = getStudentData(studentId);
  const schedule = [entry, ...(data.schedule || [])];
  setStudentData(studentId, { ...data, schedule });
  res.json(entry);
});

app.delete('/api/student-schedule/:id', (req, res) => {
  const { id } = req.params;
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  const data = getStudentData(studentId);
  const schedule = (data.schedule || []).filter((item) => item.id !== id);
  setStudentData(studentId, { ...data, schedule });
  res.json({ ok: true });
});

app.get('/api/student-next-lesson', (req, res) => {
  const { studentId } = req.query;
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: '?????? ?? ??????' });
  }
  const data = getStudentData(studentId);
  const nextLesson = data.nextLesson && typeof data.nextLesson === 'object'
    ? data.nextLesson
    : { homeWork: '', lessonLink: '', boardLink: '' };
  res.json(nextLesson);
});

app.patch('/api/student-next-lesson', (req, res) => {
  const { studentId, homeWork, lessonLink, boardLink } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required' });
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: '?????? ?? ??????' });
  }
  const data = getStudentData(studentId);
  const nextLesson = {
    homeWork: typeof homeWork === 'string' ? homeWork.trim() : '',
    lessonLink: typeof lessonLink === 'string' ? lessonLink.trim() : '',
    boardLink: typeof boardLink === 'string' ? boardLink.trim() : '',
  };
  const updated = setStudentData(studentId, { ...data, nextLesson });
  res.json(updated.nextLesson);
});


app.post('/api/test-files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });
  const id = req.fileId || crypto.randomUUID();
  res.json({
    id,
    name: normalizeFileName(req.file.originalname),
    size: formatSize(req.file.size),
    sizeBytes: req.file.size,
    url: `/uploads/${req.file.filename}`,
    storageName: req.file.filename,
  });
});

app.delete('/api/test-files/:storageName', (req, res) => {
  const rawName = req.params.storageName || '';
  const safeName = path.basename(rawName);
  if (!safeName) return res.status(400).json({ error: 'Некорректное имя файла' });
  const filePath = path.join(uploadsDir, safeName);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(404).json({ error: 'Файл не найден' });
    res.json({ ok: true });
  });
});

app.get('/api/folders', (req, res) => {
  const { taskNumber, category, studentId } = req.query;
  let folders = readFoldersDb();
  if (studentId) {
    folders = folders.filter((f) => f.studentId === studentId);
  }
  if (taskNumber) {
    const taskNum = Number(taskNumber);
    folders = folders.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    folders = folders.filter((f) => f.category === category);
  }
  res.json(folders);
});

app.post('/api/folders', (req, res) => {
  const { taskNumber, category, name, studentId } = req.body || {};
  const taskNum = Number(taskNumber);
  const folderName = normalizeFolderName(name);

  if (!studentId || !Number.isFinite(taskNum) || !category || !folderName) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    return res.status(404).json({ error: 'Ученик не найден' });
  }
  if (folderName.length > 60) {
    return res.status(400).json({ error: 'Название слишком длинное' });
  }
  if (/[/\\]/.test(folderName)) {
    return res.status(400).json({ error: 'Недопустимые символы' });
  }

  const folders = readFoldersDb();
  const exists = folders.some(
    (f) =>
      f.studentId === studentId &&
      f.taskNumber === taskNum &&
      f.category === category &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const entry = {
    id: crypto.randomUUID(),
    studentId,
    taskNumber: taskNum,
    category,
    name: folderName,
    date: new Date().toLocaleDateString('ru-RU'),
  };

  folders.unshift(entry);
  writeFoldersDb(folders);
  res.json(entry);
});

app.patch('/api/folders/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const folderName = normalizeFolderName(name);

  if (!folderName) return res.status(400).json({ error: 'Введите название папки' });
  if (folderName.length > 60) return res.status(400).json({ error: 'Название слишком длинное' });
  if (/[/\\]/.test(folderName)) {
    return res.status(400).json({ error: 'Недопустимые символы' });
  }

  const folders = readFoldersDb();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Папка не найдена' });

  const current = folders[idx];
  const exists = folders.some(
    (f) =>
      f.id !== id &&
      f.studentId === current.studentId &&
      f.taskNumber === current.taskNumber &&
      f.category === current.category &&
      f.name?.toLowerCase() === folderName.toLowerCase()
  );
  if (exists) {
    return res.status(409).json({ error: 'Такая папка уже существует' });
  }

  const updated = { ...current, name: folderName };
  folders[idx] = updated;
  writeFoldersDb(folders);

  const files = readFilesDb();
  let changed = false;
  const updatedFiles = files.map((file) => {
    if (file.folderId === id) {
      changed = true;
      return { ...file, folderName };
    }
    return file;
  });
  if (changed) writeFilesDb(updatedFiles);

  res.json(updated);
});

app.get('/api/files', (req, res) => {
  const { taskNumber, category, studentId } = req.query;
  let files = readFilesDb();
  if (studentId) {
    files = files.filter((f) => f.studentId === studentId);
  }
  if (taskNumber) {
    const taskNum = Number(taskNumber);
    files = files.filter((f) => f.taskNumber === taskNum);
  }
  if (category) {
    files = files.filter((f) => f.category === category);
  }
  res.json(files);
});

app.post('/api/files', upload.single('file'), (req, res) => {
  const { taskNumber, category, folderId, studentId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

  const taskNum = Number(taskNumber);
  if (!studentId || !Number.isFinite(taskNum) || !category) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(400).json({ error: 'Некорректные параметры' });
  }
  const students = readStudentsDb();
  if (!students.some((s) => s.id === studentId)) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(404).json({ error: 'Ученик не найден' });
  }

  let folderName = null;
  let folderRef = null;
  if (folderId) {
    const folders = readFoldersDb();
    folderRef = folders.find(
      (f) =>
        f.id === folderId &&
        f.studentId === studentId &&
        f.taskNumber === taskNum &&
        f.category === category
    );
    if (!folderRef) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
      return res.status(400).json({ error: 'Папка не найдена' });
    }
    folderName = folderRef.name;
  }

  const db = readFilesDb();
  const currentTotal = db
    .filter((f) => f.taskNumber === taskNum && f.studentId === studentId)
    .reduce((sum, f) => sum + getEntrySizeBytes(f), 0);
  if (currentTotal + req.file.size > MAX_TASK_BYTES) {
    try {
      fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(413).json({ error: 'Превышен лимит 100 МБ для этого задания' });
  }

  const id = req.fileId || crypto.randomUUID();
  const entry = {
    id,
    studentId,
    taskNumber: taskNum,
    category,
    folderId: folderRef?.id || null,
    folderName,
    name: normalizeFileName(req.file.originalname),
    size: formatSize(req.file.size),
    sizeBytes: req.file.size,
    date: new Date().toLocaleDateString('ru-RU'),
    url: `/uploads/${req.file.filename}`,
    storageName: req.file.filename,
  };

  db.unshift(entry);
  writeFilesDb(db);

  res.json(entry);
});

app.delete('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const db = readFilesDb();
  const idx = db.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });

  const [removed] = db.splice(idx, 1);
  writeFilesDb(db);

  if (removed?.storageName) {
    const filePath = path.join(uploadsDir, removed.storageName);
    fs.unlink(filePath, () => {});
  }

  res.json({ ok: true });
});

app.patch('/api/files/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};

  const db = readFilesDb();
  const idx = db.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Файл не найден' });

  let updated = { ...db[idx] };

  if (typeof name !== 'undefined') {
    const newName = normalizeFolderName(name);
    if (!newName) return res.status(400).json({ error: 'Введите название файла' });
    if (newName.length > 120) return res.status(400).json({ error: 'Название слишком длинное' });
    updated.name = newName;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'folderId')) {
    const folderId = req.body.folderId;
    if (!folderId) {
      updated.folderId = null;
      updated.folderName = null;
    } else {
      const folders = readFoldersDb();
      const folderRef = folders.find(
        (f) =>
          f.id === folderId &&
          f.studentId === updated.studentId &&
          f.taskNumber === updated.taskNumber &&
          f.category === updated.category
      );
      if (!folderRef) return res.status(400).json({ error: 'Папка не найдена' });
      updated.folderId = folderRef.id;
      updated.folderName = folderRef.name;
    }
  }

  db[idx] = updated;
  writeFilesDb(db);
  res.json(updated);
});

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл больше 20 МБ' });
  }
  console.error(err);
  res.status(500).json({ error: 'Ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
