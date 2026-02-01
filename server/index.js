import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5175;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'files.json');
const foldersFile = path.join(dataDir, 'folders.json');
const studentsFile = path.join(dataDir, 'students.json');
const teachersFile = path.join(dataDir, 'teachers.json');
const progressFile = path.join(dataDir, 'progress.json');
const testsFile = path.join(dataDir, 'tests.json');
const authFile = path.join(dataDir, 'auth.json');
const usageFile = path.join(dataDir, 'usage.json');
const MAX_TASK_BYTES = 100 * 1024 * 1024;
const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'admin-7264';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Администратор';
const TEACHER_CODE = process.env.TEACHER_CODE || 'admin100';
const TEACHER_NAME = process.env.TEACHER_NAME || '\u0423\u0447\u0438\u0442\u0435\u043b\u044c';
const STUDENT_TRAFFIC_LIMIT_BYTES = (() => {
  const bytesRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_BYTES);
  if (Number.isFinite(bytesRaw) && bytesRaw > 0) return bytesRaw;
  const gbRaw = Number(process.env.STUDENT_TRAFFIC_LIMIT_GB);
  if (Number.isFinite(gbRaw) && gbRaw > 0) return Math.round(gbRaw * 1024 * 1024 * 1024);
  return 2 * 1024 * 1024 * 1024;
})();
const STUDENT_TRAFFIC_WARN_RATIO = (() => {
  const ratio = Number(process.env.STUDENT_TRAFFIC_WARN_RATIO);
  if (Number.isFinite(ratio) && ratio > 0 && ratio < 1) return ratio;
  return 0.8;
})();
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

const readTeachersDb = () => {
  try {
    const raw = fs.readFileSync(teachersFile, 'utf8');
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

const writeTeachersDb = (data) => {
  fs.writeFileSync(teachersFile, JSON.stringify(data, null, 2), 'utf8');
};

const writeProgressDb = (data) => {
  fs.writeFileSync(progressFile, JSON.stringify(data, null, 2), 'utf8');
};

const readUsageDb = () => {
  try {
    const raw = fs.readFileSync(usageFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeUsageDb = (data) => {
  fs.writeFileSync(usageFile, JSON.stringify(data, null, 2), 'utf8');
};

const readTestsDb = () => {
  try {
    const raw = fs.readFileSync(testsFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const writeTestsDb = (data) => {
  fs.writeFileSync(testsFile, JSON.stringify(data, null, 2), 'utf8');
};

const getMonthKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getStudentUsage = (studentId) => {
  const monthKey = getMonthKey();
  const db = readUsageDb();
  const used = Number(db?.[studentId]?.[monthKey]) || 0;
  const limit = STUDENT_TRAFFIC_LIMIT_BYTES;
  const remaining = Math.max(0, limit - used);
  return { monthKey, used, limit, remaining };
};

const addStudentUsage = (studentId, bytes) => {
  if (!studentId || !Number.isFinite(bytes) || bytes <= 0) return;
  const monthKey = getMonthKey();
  const db = readUsageDb();
  const studentEntry = db[studentId] && typeof db[studentId] === 'object' ? db[studentId] : {};
  const used = Number(studentEntry[monthKey]) || 0;
  studentEntry[monthKey] = used + bytes;
  db[studentId] = studentEntry;
  writeUsageDb(db);
  return studentEntry[monthKey];
};

const getRangeSize = (rangeHeader, totalSize) => {
  if (!rangeHeader || typeof rangeHeader !== 'string') return totalSize;
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return totalSize;
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && endRaw) {
    const tail = Number(endRaw);
    if (Number.isFinite(tail) && tail > 0) return Math.min(totalSize, tail);
    return totalSize;
  }
  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : totalSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return totalSize;
  }
  return Math.min(totalSize, end - start + 1);
};

const registerUsageOnFinish = (studentId, res, fallbackBytes) => {
  if (!studentId) return;
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const headerLen = Number(res.getHeader('Content-Length'));
    const bytes = Number.isFinite(headerLen) && headerLen > 0 ? headerLen : fallbackBytes;
    if (!Number.isFinite(bytes) || bytes <= 0) return;
    addStudentUsage(studentId, bytes);
  });
};

const readAuthDb = () => {
  try {
    const raw = fs.readFileSync(authFile, 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
};

const writeAuthDb = (data) => {
  fs.writeFileSync(authFile, JSON.stringify(data, null, 2), 'utf8');
};

const normalizeAccessCode = (value) => (typeof value === 'string' ? value.trim() : '');

const hashCode = (code) => {
  const salt = crypto.randomBytes(16).toString('base64');
  const hash = crypto.scryptSync(code, salt, 64).toString('base64');
  return `scrypt$${salt}$${hash}`;
};

const verifyCode = (code, stored) => {
  if (!code || typeof stored !== 'string') return false;
  const [method, salt, hash] = stored.split('$');
  if (method !== 'scrypt' || !salt || !hash) return false;
  const derived = crypto.scryptSync(code, salt, 64);
  const storedBuf = Buffer.from(hash, 'base64');
  if (storedBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(storedBuf, derived);
};

const getCodeHint = (code) => {
  const normalized = normalizeAccessCode(code);
  if (!normalized) return '';
  return normalized.slice(-4);
};

const ensureAdminAuth = () => {
  const existing = readAuthDb();
  if (existing?.adminCodeHash) return existing;
  const seedCode = normalizeAccessCode(ADMIN_CODE) || 'admin-root';
  const next = {
    adminCodeHash: hashCode(seedCode),
    updatedAt: new Date().toISOString(),
  };
  writeAuthDb(next);
  return next;
};

const loginAttempts = new Map();

const getClientKey = (req) => req.ip || req.connection?.remoteAddress || 'unknown';

const getRateInfo = (key) => {
  const entry = loginAttempts.get(key);
  if (!entry) return { blocked: false };
  const now = Date.now();
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return { blocked: false };
  }
  return { blocked: false };
};

const registerLoginFailure = (key) => {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now - entry.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now, blockedUntil: null });
    return { blocked: false };
  }
  entry.count += 1;
  if (entry.count >= LOGIN_LIMIT) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
    return { blocked: true, retryAfter: Math.ceil(LOGIN_BLOCK_MS / 1000) };
  }
  return { blocked: false };
};

const clearLoginFailures = (key) => {
  loginAttempts.delete(key);
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

const normalizeStudentNickname = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeTeacherName = (name) => {
  if (typeof name !== 'string') return '';
  return name.trim();
};

const isPlaceholderName = (value) => typeof value === 'string' && /^\?+$/.test(value.trim());

const codeMatchesStudents = (code, students) => students.some((student) => {
  if (student?.codeHash) return verifyCode(code, student.codeHash);
  if (student?.code) return student.code === code;
  return false;
});

const codeMatchesTeachers = (code, teachers) => teachers.some((teacher) => {
  if (teacher?.codeHash) return verifyCode(code, teacher.codeHash);
  return false;
});

const generateStudentCode = (students, teachers = []) => {
  let code = '';
  while (!code || codeMatchesStudents(code, students) || codeMatchesTeachers(code, teachers)) {
    code = String(crypto.randomInt(100000, 999999));
  }
  return code;
};

const generateTeacherCode = (teachers, students = []) => {
  let code = '';
  while (!code || codeMatchesTeachers(code, teachers) || codeMatchesStudents(code, students)) {
    code = String(crypto.randomInt(100000, 999999));
  }
  return code;
};

const migrateStudentCodes = (students) => {
  let changed = false;
  students.forEach((student) => {
    if (student?.code && !student?.codeHash) {
      const plain = normalizeAccessCode(student.code);
      if (plain) {
        student.codeHash = hashCode(plain);
        student.codeHint = getCodeHint(plain);
      }
      delete student.code;
      changed = true;
    }
    if (student?.codeHash && typeof student.codeHint !== 'string') {
      student.codeHint = '';
      changed = true;
    }
  });
  if (changed) writeStudentsDb(students);
  return students;
};

const ensureDefaultTeacher = () => {
  const teachers = readTeachersDb();
  if (teachers.length === 0) {
    const plainCode = normalizeAccessCode(TEACHER_CODE) || generateTeacherCode(teachers, readStudentsDb());
    const entry = {
      id: crypto.randomUUID(),
      name: TEACHER_NAME,
      codeHash: hashCode(plainCode),
      codeHint: getCodeHint(plainCode),
      createdAt: new Date().toISOString(),
    };
    teachers.push(entry);
    writeTeachersDb(teachers);
  } else {
    const normalizedDefaultName = normalizeTeacherName(TEACHER_NAME);
    if (normalizedDefaultName) {
      let changed = false;
      teachers.forEach((teacher, idx) => {
        if (isPlaceholderName(teacher?.name)) {
          teachers[idx] = { ...teacher, name: normalizedDefaultName };
          changed = true;
        }
      });
      if (changed) writeTeachersDb(teachers);
    }
  }
  return teachers;
};

const ensureDefaultStudent = () => {
  const teachers = ensureDefaultTeacher();
  const defaultTeacherId = teachers[0]?.id || null;
  const students = readStudentsDb();
  if (students.length === 0) {
    const plainCode = generateStudentCode(students, teachers);
    const entry = {
      id: crypto.randomUUID(),
      name: 'Ученик 1',
      teacherId: defaultTeacherId,
      nickname: '',
      codeHash: hashCode(plainCode),
      codeHint: getCodeHint(plainCode),
      createdAt: new Date().toISOString(),
    };
    students.push(entry);
    writeStudentsDb(students);
  }
  return students;
};

const ensureStudentIds = () => {
  const teachers = ensureDefaultTeacher();
  const defaultTeacherId = teachers[0]?.id || null;
  const students = migrateStudentCodes(ensureDefaultStudent());
  const defaultStudentId = students[0]?.id || null;
  if (!defaultTeacherId || !defaultStudentId) return;

  const files = readFilesDb();
  let filesChanged = false;
  for (const file of files) {
    if (!file.studentId) {
      file.studentId = defaultStudentId;
      filesChanged = true;
    }
  }
  if (filesChanged) writeFilesDb(files);

  const folders = readFoldersDb();
  let foldersChanged = false;
  for (const folder of folders) {
    if (!folder.studentId) {
      folder.studentId = defaultStudentId;
      foldersChanged = true;
    }
  }
  if (foldersChanged) writeFoldersDb(folders);

  const updatedStudents = students.map((student) => {
    if (!student.teacherId) return { ...student, teacherId: defaultTeacherId };
    return student;
  });
  if (updatedStudents.some((s, idx) => s.teacherId !== students[idx].teacherId)) {
    writeStudentsDb(updatedStudents);
    return updatedStudents;
  }

  return students;
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

let adminAuth = ensureAdminAuth();

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

const handleUploadRequest = (req, res) => {
  const rawName = req.params.storageName || '';
  const safeName = path.basename(rawName);
  if (!safeName) return res.status(400).send('Некорректное имя файла');

  const filePath = path.join(uploadsDir, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).send('Файл не найден');

  const stat = fs.statSync(filePath);
  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
  if (studentId) {
    const students = readStudentsDb();
    if (!students.some((s) => s.id === studentId)) {
      return res.status(404).send('Ученик не найден');
    }
    const requestSize = getRangeSize(req.headers.range, stat.size);
    const usage = getStudentUsage(studentId);
    if (usage.remaining <= 0 || usage.used + requestSize > usage.limit) {
      return res.status(429).json({ error: 'Превышен лимит трафика для ученика' });
    }
    if (usage.used / usage.limit >= STUDENT_TRAFFIC_WARN_RATIO) {
      res.setHeader('X-Traffic-Warn', '1');
    }
    res.setHeader('X-Traffic-Used', String(usage.used));
    res.setHeader('X-Traffic-Limit', String(usage.limit));
    if (req.method === 'GET') {
      registerUsageOnFinish(studentId, res, requestSize);
    }
  }

  return res.sendFile(filePath);
};

app.get('/uploads/:storageName', handleUploadRequest);
app.head('/uploads/:storageName', handleUploadRequest);

app.post('/api/login', (req, res) => {
  const { code } = req.body || {};
  const normalizedCode = normalizeAccessCode(code);
  if (!normalizedCode) return res.status(400).json({ error: 'Введите код доступа' });

  const clientKey = getClientKey(req);
  const rateInfo = getRateInfo(clientKey);
  if (rateInfo.blocked) {
    return res.status(429).json({
      error: 'Слишком много попыток. Попробуйте позже.',
      retryAfter: rateInfo.retryAfter,
    });
  }

  if (verifyCode(normalizedCode, adminAuth?.adminCodeHash)) {
    clearLoginFailures(clientKey);
    return res.json({ id: 'admin1', name: ADMIN_NAME, role: 'admin' });
  }

  const teachers = readTeachersDb();
  const teacher = teachers.find((entry) => entry?.codeHash && verifyCode(normalizedCode, entry.codeHash));
  if (teacher) {
    clearLoginFailures(clientKey);
    return res.json({ id: teacher.id, name: teacher.name, role: 'teacher' });
  }

  const students = readStudentsDb();
  const student = students.find((entry) => {
    if (entry?.codeHash) return verifyCode(normalizedCode, entry.codeHash);
    if (entry?.code) return entry.code === normalizedCode;
    return false;
  });
  if (!student) {
    const blocked = registerLoginFailure(clientKey);
    if (blocked.blocked) {
      return res.status(429).json({
        error: 'Слишком много попыток. Попробуйте позже.',
        retryAfter: blocked.retryAfter,
      });
    }
    return res.status(401).json({ error: 'Неверный код доступа' });
  }

  clearLoginFailures(clientKey);
  res.json({ id: student.id, name: student.name, role: 'student', teacherId: student.teacherId || null });
});

app.get('/api/students', (req, res) => {
  const { teacherId } = req.query;
  let students = readStudentsDb();
  if (teacherId) {
    students = students.filter((s) => s.teacherId === teacherId);
  }
  const sanitized = students.map(({ codeHash, code, ...rest }) => rest);
  res.json(sanitized);
});

app.post('/api/students', (req, res) => {
  const { name, teacherId } = req.body || {};
  const studentName = normalizeStudentName(name);
  if (!studentName) return res.status(400).json({ error: 'Введите имя ученика' });
  if (studentName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[\/\\]/.test(studentName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const resolvedTeacherId = teacherId || teachers[0]?.id || null;
  if (!resolvedTeacherId || !teachers.some((t) => t.id === resolvedTeacherId)) {
    return res.status(400).json({ error: 'Укажите учителя' });
  }

  const students = readStudentsDb();
  const plainCode = generateStudentCode(students, teachers);
  const entry = {
    id: crypto.randomUUID(),
    name: studentName,
    teacherId: resolvedTeacherId,
    nickname: '',
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
    createdAt: new Date().toISOString(),
  };
  students.unshift(entry);
  writeStudentsDb(students);
  res.json({
    id: entry.id,
    name: entry.name,
    nickname: entry.nickname || '',
    teacherId: entry.teacherId,
    code: plainCode,
    codeHint: entry.codeHint,
    createdAt: entry.createdAt
  });
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

app.get('/api/teachers', (_req, res) => {
  const teachers = readTeachersDb();
  const sanitized = teachers.map(({ codeHash, ...rest }) => rest);
  res.json(sanitized);
});

app.post('/api/teachers', (req, res) => {
  const { name } = req.body || {};
  const teacherName = normalizeTeacherName(name);
  if (!teacherName) return res.status(400).json({ error: 'Введите имя учителя' });
  if (teacherName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[\/\\]/.test(teacherName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const students = readStudentsDb();
  const plainCode = generateTeacherCode(teachers, students);
  const entry = {
    id: crypto.randomUUID(),
    name: teacherName,
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
    createdAt: new Date().toISOString(),
  };
  teachers.unshift(entry);
  writeTeachersDb(teachers);
  res.json({ id: entry.id, name: entry.name, code: plainCode, codeHint: entry.codeHint, createdAt: entry.createdAt });
});

app.patch('/api/teachers/:id', (req, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const teacherName = normalizeTeacherName(name);
  if (!teacherName) return res.status(400).json({ error: 'Введите имя учителя' });
  if (teacherName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
  if (/[\/\\]/.test(teacherName)) return res.status(400).json({ error: 'Недопустимые символы' });

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const updated = { ...teachers[idx], name: teacherName };
  teachers[idx] = updated;
  writeTeachersDb(teachers);
  res.json({ id: updated.id, name: updated.name, codeHint: updated.codeHint, createdAt: updated.createdAt });
});

app.delete('/api/teachers/:id', (req, res) => {
  const { id } = req.params;
  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const removed = teachers.splice(idx, 1)[0];
  writeTeachersDb(teachers);

  const students = readStudentsDb();
  const toRemove = students.filter((s) => s.teacherId === id);
  if (toRemove.length > 0) {
    const remaining = students.filter((s) => s.teacherId !== id);
    writeStudentsDb(remaining);

    const files = readFilesDb();
    const remainingFiles = [];
    const removedFiles = [];
    for (const file of files) {
      if (toRemove.some((s) => s.id === file.studentId)) removedFiles.push(file);
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

    const folders = readFoldersDb().filter((f) => !toRemove.some((s) => s.id === f.studentId));
    writeFoldersDb(folders);

    const progressDb = readProgressDb();
    let changed = false;
    for (const student of toRemove) {
      if (progressDb[student.id]) {
        delete progressDb[student.id];
        changed = true;
      }
    }
    if (changed) writeProgressDb(progressDb);
  }

  res.json({ ok: true, removedTeacher: { id: removed.id, name: removed.name } });
});

app.post('/api/teachers/:id/reset-code', (req, res) => {
  const { id } = req.params;
  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });

  const students = readStudentsDb();
  const plainCode = generateTeacherCode(teachers, students);
  const updated = {
    ...teachers[idx],
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
  };
  teachers[idx] = updated;
  writeTeachersDb(teachers);
  res.json({ id: updated.id, code: plainCode, codeHint: updated.codeHint });
});

app.patch('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const { name, nickname } = req.body || {};
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, 'name');
  const hasNickname = Object.prototype.hasOwnProperty.call(req.body || {}, 'nickname');

  if (!hasName && !hasNickname) {
    return res.status(400).json({ error: 'Некорректные параметры' });
  }

  let studentName = null;
  if (hasName) {
    studentName = normalizeStudentName(name);
    if (!studentName) return res.status(400).json({ error: 'Введите имя ученика' });
    if (studentName.length > 60) return res.status(400).json({ error: 'Имя слишком длинное' });
    if (/[\/\\]/.test(studentName)) return res.status(400).json({ error: 'Недопустимые символы' });
  }

  let studentNickname = null;
  if (hasNickname) {
    studentNickname = normalizeStudentNickname(nickname);
    if (studentNickname.length > 60) return res.status(400).json({ error: 'Прозвище слишком длинное' });
    if (/[\/\\]/.test(studentNickname)) return res.status(400).json({ error: 'Недопустимые символы' });
  }

  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });

  const updated = { ...students[idx] };
  if (hasName) updated.name = studentName;
  if (hasNickname) updated.nickname = studentNickname;

  students[idx] = updated;
  writeStudentsDb(students);
  res.json({
    id: updated.id,
    name: updated.name,
    nickname: updated.nickname || '',
    codeHint: updated.codeHint,
    teacherId: updated.teacherId,
    createdAt: updated.createdAt
  });
});

app.post('/api/students/:id/reset-code', (req, res) => {
  const { id } = req.params;
  const students = readStudentsDb();
  const idx = students.findIndex((s) => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Ученик не найден' });

  const teachers = readTeachersDb();
  const plainCode = generateStudentCode(students, teachers);
  const updated = {
    ...students[idx],
    codeHash: hashCode(plainCode),
    codeHint: getCodeHint(plainCode),
  };
  students[idx] = updated;
  writeStudentsDb(students);
  res.json({ id: updated.id, code: plainCode, codeHint: updated.codeHint });
});

app.get('/api/tests', (_req, res) => {
  const data = readTestsDb();
  res.json(data || {});
});

app.put('/api/tests', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  writeTestsDb(payload);
  res.json({ ok: true });
});

app.patch('/api/teacher-code', (req, res) => {
  const { teacherId, currentCode, newCode } = req.body || {};
  const current = normalizeAccessCode(currentCode);
  const next = normalizeAccessCode(newCode);
  if (!teacherId) return res.status(400).json({ error: 'teacherId required' });
  if (!current || !next) return res.status(400).json({ error: 'Введите текущий и новый код' });
  if (next.length < 4 || next.length > 32) {
    return res.status(400).json({ error: 'Код должен быть от 4 до 32 символов' });
  }

  const teachers = readTeachersDb();
  const idx = teachers.findIndex((t) => t.id === teacherId);
  if (idx === -1) return res.status(404).json({ error: 'Учитель не найден' });
  if (!verifyCode(current, teachers[idx]?.codeHash)) {
    return res.status(401).json({ error: 'Текущий код неверный' });
  }

  teachers[idx] = {
    ...teachers[idx],
    codeHash: hashCode(next),
    codeHint: getCodeHint(next),
  };
  writeTeachersDb(teachers);
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
    return res.status(404).json({ error: 'Ученик не найден' });
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
    return res.status(404).json({ error: 'Ученик не найден' });
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

const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return res.status(404).end();
    }
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

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
