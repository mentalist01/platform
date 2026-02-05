import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import Editor from '@monaco-editor/react';
import { 
  BookOpen, BarChart2, LogOut, Download, FileText, CheckCircle, 
  Menu, X, ChevronRight, Folder, FolderPlus, Upload, 
  ArrowLeft, Trash2, PlayCircle, Check, Plus, Flame, Snowflake,
  Settings, Save, Calendar, RefreshCcw, Pencil
} from 'lucide-react';  
import mascotApproval from './assets/mascot/Approval.png';
import mascotDisapproval from './assets/mascot/disapproval.png';
import mascotGreetings from './assets/mascot/greetings.png';
import mascotPeeking from './assets/mascot/peeking.png';
import mascotPondering from './assets/mascot/pondering.png';

/**
 * CONSTANTS & CONFIG
 */

const LEVELS = {
  BASIC: { id: 'basic', label: 'Обязательный', maxScore: 70, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  ADVANCED: { id: 'advanced', label: 'Продвинутый', maxScore: 90, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  EXPERT: { id: 'expert', label: 'Чтоб наверняка', maxScore: 100, color: 'bg-red-100 text-red-700 border-red-200' }
};
const LEVEL_WEIGHTS = {
  basic: 70,
  advanced: 20,
  expert: 10,
};
const SOFT_DELETE_DAYS = 30;
const GAME_THEORY_TASK = 19;
const PYTHON_LEVEL_ID = 'python';

const applyTaskTitles = (tasks, overrides = {}) => {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    const key = String(task.number ?? task.id ?? '');
    const override = overrides?.[key];
    if (typeof override === 'string' && override.trim()) {
      return { ...task, title: override };
    }
    return task;
  });
};

const normalizeTaskNumber = (value) => {
  if (value === '' || value === null || typeof value === 'undefined') return NaN;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return NaN;
  if (num === 20 || num === 21) return GAME_THEORY_TASK;
  return num;
};

const formatTaskNumber = (value) => {
  const num = normalizeTaskNumber(value);
  if (num === GAME_THEORY_TASK) return '19-21';
  if (!Number.isFinite(num)) return '';
  return String(num);
};

const getTaskDisplayNumber = (task) => task?.displayNumber ?? formatTaskNumber(task?.number ?? task?.id);

const normalizeOutput = (value) => String(value ?? '').replace(/\r\n/g, '\n').trimEnd();

const getLocalDayKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDayKey = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return trimmed;
};

const dayKeyToNumber = (dayKey) => {
  const normalized = normalizeDayKey(dayKey);
  if (!normalized) return NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
};

const numberToDayKey = (dayNumber) => {
  if (!Number.isFinite(dayNumber)) return null;
  return new Date(dayNumber * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

const getWeekStartKey = (dayKey) => {
  const dayNum = dayKeyToNumber(dayKey);
  if (!Number.isFinite(dayNum)) return null;
  const dt = new Date(dayNum * 24 * 60 * 60 * 1000);
  const weekday = dt.getUTCDay(); // 0 = Sunday, 1 = Monday
  const mondayIndex = (weekday + 6) % 7;
  return numberToDayKey(dayNum - mondayIndex);
};

const getDefaultStreak = () => ({
  current: 0,
  best: 0,
  lastActiveDay: null,
  freezeUsedWeekStart: null,
  freezeUsedDay: null,
});

const normalizeStreak = (value) => {
  if (!value || typeof value !== 'object') return getDefaultStreak();
  const current = Number(value.current);
  const best = Number(value.best);
  const normalized = {
    current: Number.isFinite(current) && current > 0 ? Math.floor(current) : 0,
    best: Number.isFinite(best) && best > 0 ? Math.floor(best) : 0,
    lastActiveDay: normalizeDayKey(value.lastActiveDay) || null,
    freezeUsedWeekStart: normalizeDayKey(value.freezeUsedWeekStart) || null,
    freezeUsedDay: normalizeDayKey(value.freezeUsedDay) || null,
  };
  if (normalized.best < normalized.current) normalized.best = normalized.current;
  return normalized;
};

const formatStreakDate = (dayKey) => {
  const normalized = normalizeDayKey(dayKey);
  if (!normalized) return '';
  const dt = new Date(`${normalized}T00:00:00`);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const parseTestsFromText = (content) => {
  const normalized = String(content ?? '').replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n-{3,}\n/);
  const tests = blocks.map((block) => {
    const lines = block.split('\n');
    let section = '';
    const inputLines = [];
    const outputLines = [];
    lines.forEach((line) => {
      const trimmed = line.trim().toLowerCase();
      if (trimmed === 'input:' || trimmed === 'in:' || trimmed === 'stdin:') {
        section = 'input';
        return;
      }
      if (trimmed === 'output:' || trimmed === 'out:' || trimmed === 'stdout:') {
        section = 'output';
        return;
      }
      if (section === 'input') inputLines.push(line);
      if (section === 'output') outputLines.push(line);
    });
    const input = inputLines.join('\n').trimEnd();
    const output = outputLines.join('\n').trimEnd();
    return { input, output };
  });
  return tests.filter((test) => test.input || test.output);
};

const parseTestsFileContent = (content) => {
  const trimmed = String(content ?? '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed);
    const list = Array.isArray(data) ? data : data?.tests;
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
      input: String(item?.input ?? '').trimEnd(),
      output: String(item?.output ?? '').trimEnd(),
    })).filter((test) => test.input || test.output);
  }
  return parseTestsFromText(content);
};

const extractIframeSrc = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.toLowerCase().includes('<iframe')) {
    const match = text.match(/src=["']([^"']+)["']/i);
    if (match) return match[1];
  }
  return text;
};

const buildGoogleDocEmbedUrl = (value) => {
  const raw = extractIframeSrc(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (!url.hostname.includes('docs.google.com')) return '';
  const path = url.pathname;
  const publishedMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/);
  if (publishedMatch) {
    const pubId = publishedMatch[1];
    return `https://docs.google.com/document/d/e/${pubId}/pub?embedded=true`;
  }
  const docMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  if (!docMatch) return '';
  const docId = docMatch[1];
  return `https://docs.google.com/document/d/${docId}/preview`;
};

const isGoogleDocEmbedUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    if (!url.hostname.includes('docs.google.com')) return false;
    const isPub = /\/document\/(?:u\/\d+\/)?d\/(e\/)?[a-zA-Z0-9_-]+\/pub/.test(url.pathname)
      && url.searchParams.get('embedded') === 'true';
    const isPreview = /\/document\/(?:u\/\d+\/)?d\/[a-zA-Z0-9_-]+\/preview/.test(url.pathname);
    return isPub || isPreview;
  } catch {
    return false;
  }
};

const buildGoogleDocFullUrl = (value) => {
  const raw = extractIframeSrc(value);
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (!url.hostname.includes('docs.google.com')) return raw;
  const path = url.pathname;
  const docMatch = path.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
  if (docMatch && !path.includes('/d/e/')) {
    return `https://docs.google.com/document/d/${docMatch[1]}/edit`;
  }
  const pubE = path.match(/\/document\/(?:u\/\d+\/)?d\/e\/([a-zA-Z0-9_-]+)/);
  if (pubE) return `https://docs.google.com/document/d/e/${pubE[1]}/pub`;
  return raw;
};

const getAnswerCountForTask = (taskNumber) => {
  const num = Number(taskNumber);
  if (num === GAME_THEORY_TASK) return 4;
  if (num === 25) return 20;
  if (num === 27) return 4;
  if (num === 17 || num === 18 || num === 26) return 2;
  return 1;
};

const allowsPartialAnswers = (taskNumber) => Number(taskNumber) === 25;

const getExpectedAnswers = (question, count) => {
  if (!question) return Array.from({ length: count }, () => '');
  if (count <= 1) {
    const fallback = Array.isArray(question?.options)
      ? question.options[question.correctIndex]
      : '';
    return [question.answer ?? fallback ?? ''];
  }
  const fromArray = Array.isArray(question.answers) ? question.answers : [];
  if (fromArray.length) {
    const filled = [...fromArray];
    while (filled.length < count) filled.push('');
    return filled.slice(0, count);
  }
  const answers = [];
  for (let i = 1; i <= count; i += 1) {
    const key = i === 1 ? 'answer' : `answer${i}`;
    answers.push(question?.[key] ?? '');
  }
  return answers;
};

const getStudentLabel = (student) => {
  if (!student) return '';
  const nickname = typeof student.nickname === 'string' ? student.nickname.trim() : '';
  if (nickname) return `${nickname} (${student.name})`;
  return student.name;
};

const STUDENT_TOUR_KEY = 'ege_student_onboarding_v1';

const loadStudentTourStatus = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STUDENT_TOUR_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const saveStudentTourStatus = (next) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STUDENT_TOUR_KEY, JSON.stringify(next));
  } catch {}
};

const hasStudentSeenTour = (studentId) => {
  if (!studentId) return false;
  const key = String(studentId);
  const data = loadStudentTourStatus();
  return Boolean(data?.[key]);
};

const markStudentSeenTour = (studentId) => {
  if (!studentId) return;
  const key = String(studentId);
  const data = loadStudentTourStatus();
  if (data?.[key]) return;
  saveStudentTourStatus({ ...data, [key]: true });
};

const LAST_LOCATION_KEY = 'ege_last_location_v1';

const buildUserLocationKey = (user) => {
  if (!user) return '';
  const role = user.role || 'user';
  const id = typeof user.id !== 'undefined' && user.id !== null ? String(user.id) : 'unknown';
  return `${role}:${id}`;
};

const loadLastLocationStore = () => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
};

const saveLastLocationStore = (store) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(store));
  } catch {}
};

const readUserLocation = (user) => {
  const key = buildUserLocationKey(user);
  if (!key) return {};
  const store = loadLastLocationStore();
  const entry = store?.[key];
  return entry && typeof entry === 'object' ? entry : {};
};

const updateUserLocation = (user, patch) => {
  const key = buildUserLocationKey(user);
  if (!key) return;
  const store = loadLastLocationStore();
  const prev = store?.[key];
  const safePrev = prev && typeof prev === 'object' ? prev : {};
  store[key] = { ...safePrev, ...patch };
  saveLastLocationStore(store);
};

const normalizeStoredOpenTask = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const normalizedTaskNumber = normalizeTaskNumber(entry.taskNumber);
  if (!Number.isFinite(normalizedTaskNumber)) return null;
  const pythonTask = isPythonTaskNumber(normalizedTaskNumber);
  const section = pythonTask ? 'python' : 'progress';
  const rawIndex = Number(entry.questionIndex);
  const questionIndex = Number.isFinite(rawIndex) && rawIndex >= 0 ? Math.floor(rawIndex) : null;
  return {
    taskNumber: normalizedTaskNumber,
    levelId: pythonTask ? PYTHON_LEVEL_ID : entry.levelId,
    targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : null,
    section,
    questionIndex
  };
};

// Заглушка списка заданий
const RAW_TASKS = Array.from({ length: 27 }, (_, i) => ({
  id: i + 1,
  number: i + 1,
  title: [
    "Анализ информационных моделей", "Таблицы истинности", "Поиск в БД", "Кодирование (Фано)", 
    "Анализ алгоритмов", "Циклы", "Изображения/Звук", "Комбинаторика", "Excel", "Word", 
    "Вычисление информации", "Исполнители", "Графы", "Системы счисления", "Алгебра логики", 
    "Рекурсия", "Последовательности", "Робот (ДП)", "Теория игр (1)", "Теория игр (2)", 
    "Теория игр (3)", "Многопроцессорные", "Динамика (Исполнитель)", "Строки", "Маски чисел", 
    "Жадные алгоритмы", "Анализ данных (Сложная)"
  ][i] || `Задание ${i + 1}`,
  topic: "Тема задания",
  mastery: 0
}));

const MOCK_TASKS = RAW_TASKS
  .filter((task) => ![20, 21].includes(task.number))
  .map((task) => {
    if (task.number === GAME_THEORY_TASK) {
      return {
        ...task,
        title: '19-21 - Теория Игр',
        displayNumber: '19-21',
      };
    }
    return task;
  });

// Начальная база вопросов
const PYTHON_TASKS = [
  { id: 101, number: 101, title: 'Ввод и вывод данных', displayNumber: '1.0' },
  { id: 102, number: 102, title: 'Переменные', displayNumber: '1.1' },
  { id: 103, number: 103, title: 'Условия', displayNumber: '2' },
  { id: 104, number: 104, title: 'Вычисления', displayNumber: '3' },
  { id: 105, number: 105, title: 'Цикл for', displayNumber: '4' },
  { id: 106, number: 106, title: 'Строки', displayNumber: '5' },
  { id: 107, number: 107, title: 'Цикл while', displayNumber: '6' },
  { id: 108, number: 108, title: 'Списки', displayNumber: '7.0' },
  { id: 109, number: 109, title: 'Кортежи', displayNumber: '7.1' },
  { id: 110, number: 110, title: 'Функции и рекурсия', displayNumber: '8' },
  { id: 111, number: 111, title: 'Двумерные массивы', displayNumber: '9' }
];

const PYTHON_TASK_MAP = new Map(PYTHON_TASKS.map((task) => [Number(task.number), task]));

const isPythonTaskNumber = (value) => PYTHON_TASK_MAP.has(Number(value));

const getPythonTaskInfo = (value) => PYTHON_TASK_MAP.get(Number(value)) || null;

const ensurePyodideReady = (() => {
  let pyodidePromise = null;
  return async () => {
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Pyodide доступен только в браузере.'));
        return;
      }
      if (window.loadPyodide) {
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
      script.async = true;
      script.onload = () => {
        if (!window.loadPyodide) {
          reject(new Error('Не удалось загрузить Pyodide.'));
          return;
        }
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
      };
      script.onerror = () => reject(new Error('Ошибка загрузки Pyodide.'));
      document.body.appendChild(script);
    });
    return pyodidePromise;
  };
})();

const PYODIDE_RUN_TIMEOUT_MS = 8000;

const createPyodideWorker = () => {
  const workerSource = `
    let pyodidePromise = null;
    const ensurePyodide = () => {
      if (pyodidePromise) return pyodidePromise;
      pyodidePromise = new Promise((resolve, reject) => {
        try {
          importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
        } catch (err) {
          reject(err);
          return;
        }
        if (!self.loadPyodide) {
          reject(new Error('Pyodide loader not available'));
          return;
        }
        self.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/' })
          .then(resolve)
          .catch(reject);
      });
      return pyodidePromise;
    };

    const runPython = async (source, inputValue) => {
      const pyodide = await ensurePyodide();
      const safeInput = inputValue == null ? '' : String(inputValue);
      const safeSource = source == null ? '' : String(source);
      const wrapped = [
        'import sys, io, traceback',
        '_input = ' + JSON.stringify(safeInput),
        '_stdout = io.StringIO()',
        '_stderr = io.StringIO()',
        'sys.stdin = io.StringIO(_input)',
        'sys.stdout = _stdout',
        'sys.stderr = _stderr',
        '_globals = {}',
        'try:',
        '    exec(' + JSON.stringify(safeSource) + ', _globals, _globals)',
        'except Exception:',
        '    traceback.print_exc()',
        '__output = _stdout.getvalue()',
        '__error = _stderr.getvalue()',
      ].join('\\n');
      await pyodide.runPythonAsync(wrapped);
      const output = pyodide.globals.get('__output') || '';
      const error = pyodide.globals.get('__error') || '';
      pyodide.globals.delete('__output');
      pyodide.globals.delete('__error');
      return { output: String(output), error: String(error) };
    };

    self.onmessage = async (event) => {
      const data = event.data || {};
      const id = data.id;
      if (!id) return;
      try {
        const result = await runPython(data.source, data.input);
        self.postMessage({ id, output: result.output, error: result.error });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        self.postMessage({ id, output: '', error: message });
      }
    };
  `;

  const blob = new Blob([workerSource], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  return worker;
};

const INITIAL_TEST_DB = {
  1: {
    basic: [
      { id: 1, question: "Базовый вопрос №1 для задания 1: Найдите длину пути А-Д.", options: ["10", "12", "14", "15"], correctIndex: 1 },
      { id: 2, question: "Базовый вопрос №2 для задания 1: Сколько путей из А в Г?", options: ["3", "4", "5", "6"], correctIndex: 2 }
    ],
    advanced: [],
    expert: []
  }
};


/**
 * API SERVICE
 */
const parseApiError = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const data = await res.json();
      if (data?.error) return data.error;
    } catch {}
  }
  try {
    const text = await res.text();
    if (text && text.length <= 200) return text;
  } catch {}
  if (res.status === 413) {
    return '\u0421\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439 \u0437\u0430\u043f\u0440\u043e\u0441. \u0423\u043c\u0435\u043d\u044c\u0448\u0438\u0442\u0435 \u0440\u0430\u0437\u043c\u0435\u0440 \u0434\u0430\u043d\u043d\u044b\u0445.';
  }
  return `Ошибка запроса (${res.status} ${res.statusText})`;
};

const parseJsonResponse = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    if (text?.trim().startsWith('<!doctype')) {
      throw new Error('Сервер не отвечает (HTML вместо JSON). Перезапустите backend.');
    }
    throw new Error('Некорректный ответ сервера');
  }
  return res.json();
};

const api = {
  login: async (code) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudents: async (teacherId, options = {}) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', teacherId);
    if (options?.includeDeleted) params.append('includeDeleted', '1');
    if (options?.deletedOnly) params.append('deletedOnly', '1');
    const qs = params.toString();
    const res = await fetch(qs ? `/api/students?${qs}` : '/api/students');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createStudent: async (name, teacherId) => {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teacherId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteStudent: async (id) => {
    const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  restoreStudent: async (id) => {
    const res = await fetch(`/api/students/${id}/restore`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudent: async (id, payload) => {
    const res = await fetch(`/api/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetStudentCode: async (id) => {
    const res = await fetch(`/api/students/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTeachers: async () => {
    const res = await fetch('/api/teachers');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createTeacher: async (name) => {
    const res = await fetch('/api/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherName: async (id, name) => {
    const res = await fetch(`/api/teachers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteTeacher: async (id) => {
    const res = await fetch(`/api/teachers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  resetTeacherCode: async (id) => {
    const res = await fetch(`/api/teachers/${id}/reset-code`, { method: 'POST' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateTeacherCode: async (teacherId, currentCode, newCode) => {
    const res = await fetch('/api/teacher-code', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId, currentCode, newCode }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getTests: async () => {
    const res = await fetch('/api/tests');
    if (!res.ok) throw new Error(await parseApiError(res));
    const data = await parseJsonResponse(res);
    return data && typeof data === 'object' ? data : {};
  },
  saveTests: async (newDb) => {
    const res = await fetch('/api/tests', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDb),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTaskTitles: async () => {
    const res = await fetch('/api/task-titles');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateTaskTitle: async (number, title) => {
    const res = await fetch('/api/task-titles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, title }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentProgress: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/progress?${qs}` : '/api/progress');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  updateStudentProgress: async (studentId, taskId, value) => {
    const res = await fetch('/api/progress', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, taskId, value }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentData: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/student-data?${qs}` : '/api/student-data');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNotes: async (studentId, payload) => {
    const res = await fetch('/api/student-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getTeacherSolvedEvents: async (teacherId, since, limit) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', String(teacherId));
    if (since) params.append('since', String(since));
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    const res = await fetch(qs ? `/api/teacher-solved-events?${qs}` : '/api/teacher-solved-events');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentHomework: async (studentId, homeworkId, payload) => {
    const res = await fetch(`/api/student-next-lesson/${homeworkId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteStudentHomework: async (studentId, homeworkId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(
      qs ? `/api/student-next-lesson/${homeworkId}?${qs}` : `/api/student-next-lesson/${homeworkId}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  solveQuestion: async (payload) => {
    const res = await fetch('/api/progress/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedQuestions: async (studentId, taskNumber, levelId, options = {}) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
    if (options?.includeCode) params.append('includeCode', '1');
    const qs = params.toString();
    const res = await fetch(qs ? `/api/progress/solved?${qs}` : '/api/progress/solved');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  addMockExam: async (studentId, payload) => {
    const res = await fetch('/api/mocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteMockExam: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/mocks/${id}?${qs}` : `/api/mocks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadTestFile: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/test-files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  deleteTestFile: async (storageName) => {
    if (!storageName) return { ok: true };
    const res = await fetch(`/api/test-files/${encodeURIComponent(storageName)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getStudentSchedule: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/student-schedule?${qs}` : '/api/student-schedule');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  addScheduleEntry: async (studentId, payload) => {
    const res = await fetch('/api/student-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteScheduleEntry: async (studentId, id) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/student-schedule/${id}?${qs}` : `/api/student-schedule/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getStudentNextLesson: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/student-next-lesson?${qs}` : '/api/student-next-lesson');
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  updateStudentNextLesson: async (studentId, payload) => {
    const res = await fetch('/api/student-next-lesson', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, ...payload }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getFiles: async (studentId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/files?${qs}` : '/api/files');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  getFolders: async (taskNumber, category, studentId) => {
    const params = new URLSearchParams();
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (category) params.append('category', category);
    if (studentId) params.append('studentId', studentId);
    const qs = params.toString();
    const res = await fetch(qs ? `/api/folders?${qs}` : '/api/folders');
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  createFolder: async (taskNumber, category, name, studentId) => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskNumber, category, name, studentId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFolder: async (id, name) => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  uploadFile: async (file, taskNumber, category, folderId, studentId) => {
    const form = new FormData();
    form.append('file', file);
    form.append('taskNumber', String(taskNumber));
    form.append('category', category);
    form.append('studentId', studentId);
    if (folderId) form.append('folderId', folderId);

    const res = await fetch('/api/files', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  deleteFile: async (id) => {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  renameFile: async (id, name) => {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },
  moveFile: async (id, folderId) => {
    const res = await fetch(`/api/files/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId }),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  }
};

const MAX_TASK_BYTES = 200 * 1024 * 1024;
const HOMEWORK_POPUP_BG = '/homework-quest.png';

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '0 МБ';
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
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

const getEntrySizeBytes = (entry) => {
  if (!entry) return 0;
  if (Number.isFinite(entry.sizeBytes)) return entry.sizeBytes;
  return parseSizeString(entry.size);
};

const withStudentId = (url, studentId) => {
  if (!url || !studentId) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}studentId=${encodeURIComponent(studentId)}`;
};

const highlightPython = (code) => Prism.highlight(code, Prism.languages.python, 'python');

const MASCOT_IMAGES = {
  greetings: mascotGreetings,
  peeking: mascotPeeking,
  pondering: mascotPondering,
  disapproval: mascotDisapproval,
  approval: mascotApproval
};

const STUDENT_TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Добро пожаловать!',
    text: 'Покажу основные разделы и где искать материалы.',
    emotion: 'greetings',
    target: '[data-tour="main"]',
    menu: 'close'
  },
  {
    id: 'nav',
    title: 'Навигация',
    text: 'Слева меню. Через него переключаются разделы ученика.',
    emotion: 'peeking',
    target: '[data-tour="nav"]',
    menu: 'open'
  },
  {
    id: 'schedule',
    title: 'Расписание',
    text: 'Здесь домашка и ссылки к следующему занятию.',
    emotion: 'approval',
    target: '[data-tour="schedule"]',
    view: 'schedule',
    menu: 'close'
  },
  {
    id: 'progress',
    title: 'Успеваемость',
    text: 'Следи за прогрессом по заданиям и пробным.',
    emotion: 'pondering',
    target: '[data-tour="progress"]',
    view: 'progress',
    menu: 'close'
  },
  {
    id: 'notes',
    title: 'Конспекты',
    text: 'Здесь материалы по заданиям и твои файлы.',
    emotion: 'peeking',
    target: '[data-tour="notes"]',
    view: 'notes',
    menu: 'close'
  },
  {
    id: 'files',
    title: 'Конспекты',
    text: 'Выбери задание и категорию, затем загружай файлы сюда.',
    emotion: 'approval',
    target: '[data-tour="files"]',
    fallback: '[data-tour="notes"]',
    view: 'notes',
    menu: 'close'
  },
  {
    id: 'done',
    title: 'Готово',
    text: 'Если потеряешься — просто открой нужный раздел слева.',
    emotion: 'approval',
    menu: 'close'
  }
];

/**
 * SHARED COMPONENTS
 */
const Button = ({ children, onClick, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "px-4 py-2 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200",
    secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
    ghost: "text-gray-500 hover:bg-gray-100 hover:text-purple-600",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    success: "bg-green-600 text-white hover:bg-green-700"
  };
  return <button className={`${baseStyle} ${variants[variant]} ${className}`} onClick={onClick} {...props}>{children}</button>;
};

const Card = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-purple-200 active:scale-[0.99]' : ''} ${className}`}>{children}</div>
);

const ProgressBar = ({ value }) => {
  let color = 'bg-gray-200';
  if (value > 0) color = 'bg-blue-400';
  if (value >= 70) color = 'bg-purple-500';
  if (value >= 90) color = 'bg-green-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden mt-2">
      <div className={`h-2.5 rounded-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${value}%` }}></div>
    </div>
  );
};

/**
 * TEACHER PANEL COMPONENT
 */
const TeacherPanel = ({
  role,
  students,
  studentsLoading,
  studentsError,
  deletedStudents,
  deletedStudentsLoading,
  deletedStudentsError,
  tasks,
  activeStudentId,
  onSelectStudent,
  onStudentCreated,
  onStudentDeleted,
  onStudentRestored,
  onStudentUpdated,
  teacherId
}) => {
  const [testDb, setTestDb] = useState(null);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const [selectedTask, setSelectedTask] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState('basic');
  const [newStudentName, setNewStudentName] = useState('');
  const [studentActionLoading, setStudentActionLoading] = useState(false);
  const [studentActionError, setStudentActionError] = useState('');
  const [lastIssuedCode, setLastIssuedCode] = useState(null);
  const [resettingStudentId, setResettingStudentId] = useState(null);
  const [restoringStudentId, setRestoringStudentId] = useState(null);
  const [teacherCodeForm, setTeacherCodeForm] = useState({ current: '', next: '', repeat: '' });
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [teacherCodeSuccess, setTeacherCodeSuccess] = useState('');
  const [teacherCodeSaving, setTeacherCodeSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentNickname, setEditStudentNickname] = useState('');
  const [editStudentError, setEditStudentError] = useState('');
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionScreenshots, setQuestionScreenshots] = useState([]);
  const [questionFiles, setQuestionFiles] = useState([]);
  const [existingQuestionScreenshots, setExistingQuestionScreenshots] = useState([]);
  const [existingQuestionFiles, setExistingQuestionFiles] = useState([]);
  const [initialQuestionAttachments, setInitialQuestionAttachments] = useState({ screenshots: [], files: [] });
  const [screenshotPreviews, setScreenshotPreviews] = useState([]);
  const [questionUploadError, setQuestionUploadError] = useState('');
  const [isUploadingQuestion, setIsUploadingQuestion] = useState(false);
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);

  useEffect(() => {
    const previews = questionScreenshots.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setScreenshotPreviews(previews);
    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [questionScreenshots]);

  useEffect(() => {
    let cancelled = false;
    setTestsLoading(true);
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestDb(data && typeof data === 'object' ? data : {});
        setTestsError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsError(err?.message || err);
        setTestDb({});
      })
      .finally(() => {
        if (!cancelled) setTestsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  
  // Form state
  const [question, setQuestion] = useState("");
  const [answerInputs, setAnswerInputs] = useState(['']);
  const answerCount = getAnswerCountForTask(selectedTask);

  useEffect(() => {
    setAnswerInputs((prev) => {
      const next = Array.from({ length: answerCount }, (_, i) => prev[i] ?? '');
      return next;
    });
  }, [answerCount]);

  const splitUploadFileName = (name = '') => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return { base: name, ext: '' };
    }
    return { base: name.slice(0, lastDot), ext: name.slice(lastDot + 1) };
  };

  const makeQuestionFileEntry = (file) => {
    const { base, ext } = splitUploadFileName(file?.name || '');
    const id = `${file?.name || 'file'}-${file?.size || 0}-${file?.lastModified || 0}-${Math.random().toString(36).slice(2, 8)}`;
    return { id, file, base, ext, originalBase: base };
  };

  const getQuestionFileName = (entry) => {
    const base = String(entry?.base ?? '').trim();
    const ext = entry?.ext ? String(entry.ext).trim() : '';
    const fallback = entry?.file?.name || '';
    if (!base) return fallback;
    return ext ? `${base}.${ext}` : base;
  };

  const buildQuestionUploadFile = (entry) => {
    if (!entry?.file) return null;
    const name = getQuestionFileName(entry);
    if (!name || name === entry.file.name) return entry.file;
    try {
      return new File([entry.file], name, { type: entry.file.type, lastModified: entry.file.lastModified });
    } catch {
      return entry.file;
    }
  };

  const getAttachmentKey = (item) => item?.storageName || item?.url || item?.id || item?.name;

  const resetQuestionForm = (options = {}) => {
    const { keepAnswers = false } = options;
    setQuestion('');
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    setExistingQuestionScreenshots([]);
    setExistingQuestionFiles([]);
    setInitialQuestionAttachments({ screenshots: [], files: [] });
    setQuestionUploadError('');
    setEditingQuestionId(null);
    if (!keepAnswers) {
      setAnswerInputs(Array.from({ length: getAnswerCountForTask(selectedTask) }, () => ''));
    }
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  };

  const startEditQuestion = (questionItem) => {
    if (!questionItem) return;
    const requiredCount = getAnswerCountForTask(selectedTask);
    setEditingQuestionId(questionItem.id);
    setQuestion(questionItem.question || '');
    setAnswerInputs(getExpectedAnswers(questionItem, requiredCount));
    const existingScreens = Array.isArray(questionItem.screenshots) ? questionItem.screenshots : [];
    const existingFiles = Array.isArray(questionItem.files) ? questionItem.files : [];
    setExistingQuestionScreenshots(existingScreens);
    setExistingQuestionFiles(existingFiles);
    setInitialQuestionAttachments({
      screenshots: existingScreens,
      files: existingFiles
    });
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    setQuestionUploadError('');
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
  };

  const cancelEditQuestion = () => resetQuestionForm();

  useEffect(() => {
    if (editingQuestionId) {
      cancelEditQuestion();
    }
  }, [selectedTask, selectedLevel]);

  const handleSaveQuestion = async () => {
    const requiredCount = getAnswerCountForTask(selectedTask);
    const trimmedAnswers = answerInputs.map((val) => String(val ?? '').trim());
    const answersSlice = trimmedAnswers.slice(0, requiredCount);
    const hasEmpty = answersSlice.some((val) => !val);
    const hasAny = answersSlice.some((val) => val);
    if (requiredCount > 1 && allowsPartialAnswers(selectedTask)) {
      if (!hasAny) {
        alert("Введите хотя бы один правильный ответ");
        return;
      }
    } else if (hasEmpty) {
      alert(requiredCount > 1 ? "Введите все правильные ответы" : "Введите правильный ответ");
      return;
    }
    const hasAnyAttachments =
      questionScreenshots.length > 0 ||
      questionFiles.length > 0 ||
      existingQuestionScreenshots.length > 0 ||
      existingQuestionFiles.length > 0;
    if (!question.trim() && !hasAnyAttachments) {
      alert("Добавьте текст вопроса или прикрепите файл/скриншот");
      return;
    }

    setIsUploadingQuestion(true);
    setQuestionUploadError('');
    let uploadedScreenshots = [];
    let uploadedFiles = [];
    try {
      if (questionScreenshots.length > 0) {
        uploadedScreenshots = await Promise.all(
          questionScreenshots.map((file) => api.uploadTestFile(file))
        );
      }
      if (questionFiles.length > 0) {
        uploadedFiles = await Promise.all(
          questionFiles
            .map((entry) => buildQuestionUploadFile(entry) || entry?.file)
            .filter(Boolean)
            .map((file) => api.uploadTestFile(file))
        );
      }
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }

    const updatedDb = { ...(testDb || {}) };
    if (!updatedDb[selectedTask]) updatedDb[selectedTask] = { basic: [], advanced: [], expert: [] };
    if (!updatedDb[selectedTask][selectedLevel]) updatedDb[selectedTask][selectedLevel] = [];
    const levelList = updatedDb[selectedTask][selectedLevel];
    const finalScreenshots = [...existingQuestionScreenshots, ...uploadedScreenshots];
    const finalFiles = [...existingQuestionFiles, ...uploadedFiles];

    if (editingQuestionId) {
      const targetIndex = levelList.findIndex((q) => q.id === editingQuestionId);
      if (targetIndex === -1) {
        setQuestionUploadError('Не удалось найти вопрос для редактирования.');
        setIsUploadingQuestion(false);
        return;
      }
      const baseQuestion = levelList[targetIndex] || {};
      const updatedQuestion = {
        ...baseQuestion,
        question: question.trim(),
        screenshots: finalScreenshots,
        files: finalFiles,
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] })
      };
      if (requiredCount > 1) {
        delete updatedQuestion.answer;
      } else {
        delete updatedQuestion.answers;
      }
      levelList[targetIndex] = updatedQuestion;
    } else {
      const newQuestion = {
        id: Date.now(),
        question: question.trim(),
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] }),
        screenshots: finalScreenshots,
        files: finalFiles
      };
      levelList.push(newQuestion);
    }
    
    setTestDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }
    
    if (editingQuestionId) {
      const removedScreens = (initialQuestionAttachments.screenshots || []).filter((item) => {
        const key = getAttachmentKey(item);
        if (!key) return false;
        return !finalScreenshots.some((current) => getAttachmentKey(current) === key);
      });
      const removedFiles = (initialQuestionAttachments.files || []).filter((item) => {
        const key = getAttachmentKey(item);
        if (!key) return false;
        return !finalFiles.some((current) => getAttachmentKey(current) === key);
      });
      const removed = [...removedScreens, ...removedFiles].filter((file) => file?.storageName);
      if (removed.length > 0) {
        await Promise.allSettled(removed.map((file) => api.deleteTestFile(file.storageName)));
      }
    }

    resetQuestionForm();
    setIsUploadingQuestion(false);
  };

  const handleDeleteQuestion = async (taskId, level, qId) => {
    if(!confirm("Удалить этот вопрос?")) return;
    const updatedDb = { ...(testDb || {}) };
    const removed = updatedDb[taskId][level].find(q => q.id === qId);
    updatedDb[taskId][level] = updatedDb[taskId][level].filter(q => q.id !== qId);
    setTestDb(updatedDb);
    if (editingQuestionId === qId) {
      resetQuestionForm();
    }
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      alert(err?.message || err);
    }
    if (removed) {
      const attachments = [
        ...(Array.isArray(removed.screenshots) ? removed.screenshots : []),
        ...(Array.isArray(removed.files) ? removed.files : [])
      ];
      if (attachments.length > 0) {
        await Promise.allSettled(
          attachments.map((file) => api.deleteTestFile(file.storageName))
        );
      }
    }
  };

  const currentQuestions = testDb?.[selectedTask]?.[selectedLevel] || [];
  const studentsList = students || [];
  const deletedStudentsList = deletedStudents || [];
  const tasksList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const formatDeletedDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const getDeletedDaysLeft = (iso) => {
    if (!iso) return null;
    const deletedAt = new Date(iso).getTime();
    if (!Number.isFinite(deletedAt)) return null;
    const daysPassed = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
    return Math.max(0, SOFT_DELETE_DAYS - daysPassed);
  };

  const addScreenshotFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (incoming.length === 0) return;
    setQuestionScreenshots((prev) => [...prev, ...incoming]);
  };

  const addExtraFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (incoming.length === 0) return;
    const entries = incoming.map((file) => makeQuestionFileEntry(file));
    setQuestionFiles((prev) => [...prev, ...entries]);
  };

  const removeScreenshot = (idx) => {
    setQuestionScreenshots((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExtraFile = (idx) => {
    setQuestionFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleScreenshotsDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScreens(false);
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleScreenshotsDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingScreens) setIsDraggingScreens(true);
  };

  const handleScreenshotsDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingScreens(false);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleFilesDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFiles(false);
  };

  const handlePasteImages = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type && item.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    const files = imageItems
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (files.length === 0) return;
    e.preventDefault();
    addScreenshotFiles(files);
  };

  const handleCreateStudent = async () => {
    const name = newStudentName.trim();
    if (!name) {
      setStudentActionError('Введите имя ученика');
      return;
    }
    if (!teacherId) {
      setStudentActionError('Сначала выберите учителя');
      return;
    }
    setStudentActionLoading(true);
    try {
      const created = await api.createStudent(name, teacherId);
      const { code, ...rest } = created || {};
      if (rest?.id) onStudentCreated?.(rest);
      if (code) setLastIssuedCode({ name: rest?.name || name, code });
      setNewStudentName('');
      setStudentActionError('');
    } catch (err) {
      setStudentActionError(err?.message || err);
    } finally {
      setStudentActionLoading(false);
    }
  };

  const handleDeleteStudent = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Удалить ученика "${student.name}"? Ученик скроется, но его можно восстановить в течение 30 дней.`)) return;
    setStudentActionLoading(true);
    try {
      const res = await api.deleteStudent(student.id);
      const deletedAt = res?.deletedAt || new Date().toISOString();
      onStudentDeleted?.({ ...student, deletedAt });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setStudentActionLoading(false);
    }
  };

  const handleResetStudentCode = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Сгенерировать новый код для "${student.name}"? Старый код больше не будет работать.`)) return;
    setResettingStudentId(student.id);
    try {
      const res = await api.resetStudentCode(student.id);
      if (res?.code) setLastIssuedCode({ name: student.name, code: res.code });
      if (res?.codeHint) onStudentUpdated?.({ ...student, codeHint: res.codeHint });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingStudentId(null);
    }
  };

  const handleRestoreStudent = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Восстановить ученика "${student.name}"?`)) return;
    setRestoringStudentId(student.id);
    try {
      const restored = await api.restoreStudent(student.id);
      onStudentRestored?.(restored);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setRestoringStudentId(null);
    }
  };

  const startEditStudent = (student) => {
    if (!student?.id) return;
    setEditingStudentId(student.id);
    setEditStudentName(student.name || '');
    setEditStudentNickname(student.nickname || '');
    setEditStudentError('');
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setEditStudentName('');
    setEditStudentNickname('');
    setEditStudentError('');
  };

  const saveEditStudent = async (student) => {
    if (!student?.id) return;
    const nextName = editStudentName.trim();
    setEditStudentError('');
    if (!nextName) {
      setEditStudentError('Введите имя ученика');
      return;
    }
    if (nextName.length > 60) {
      setEditStudentError('Имя слишком длинное');
      return;
    }
    if (/[\/\\]/.test(nextName)) {
      setEditStudentError('Недопустимые символы');
      return;
    }

    setEditStudentSaving(true);
    try {
      const payload = { name: nextName, nickname: editStudentNickname };
      const res = await api.updateStudent(student.id, payload);
      onStudentUpdated?.({ ...student, ...res });
      cancelEditStudent();
    } catch (err) {
      setEditStudentError(err?.message || err);
    } finally {
      setEditStudentSaving(false);
    }
  };

  const handleChangeTeacherCode = async () => {
    setTeacherCodeError('');
    setTeacherCodeSuccess('');
    if (!teacherId) {
      setTeacherCodeError('Сначала выберите учителя');
      return;
    }
    const current = teacherCodeForm.current.trim();
    const next = teacherCodeForm.next.trim();
    const repeat = teacherCodeForm.repeat.trim();
    if (!current || !next) {
      setTeacherCodeError('Введите текущий и новый код');
      return;
    }
    if (next.length < 4 || next.length > 32) {
      setTeacherCodeError('Код должен быть от 4 до 32 символов');
      return;
    }
    if (next !== repeat) {
      setTeacherCodeError('Коды не совпадают');
      return;
    }
    setTeacherCodeSaving(true);
    try {
      await api.updateTeacherCode(teacherId, current, next);
      setTeacherCodeForm({ current: '', next: '', repeat: '' });
      setTeacherCodeSuccess('Код обновлён');
    } catch (err) {
      setTeacherCodeError(err?.message || err);
    } finally {
      setTeacherCodeSaving(false);
    }
  };


  return (
    <div className="animate-fadeIn pb-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="text-purple-600" />
          Панель учителя
        </h2>
        <p className="text-gray-500">Добавление и редактирование заданий для тестов</p>
        {testsLoading && <p className="text-xs text-gray-400 mt-2">Загрузка базы тестов...</p>}
        {testsError && <p className="text-xs text-red-500 mt-2">{testsError}</p>}
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Ученики</h3>
            <p className="text-xs text-gray-500">Всего: {studentsList.length}</p>
          </div>
          {studentsError && <span className="text-xs text-red-500">{studentsError}</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newStudentName}
            onChange={(e) => { setNewStudentName(e.target.value); setStudentActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateStudent(); }}
            placeholder="Имя ученика"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <Button onClick={handleCreateStudent} disabled={studentActionLoading || !newStudentName.trim()}>
            <Plus size={16}/> Добавить
          </Button>
        </div>
        {studentActionError && <p className="text-xs text-red-500 mb-3">{studentActionError}</p>}
        {lastIssuedCode && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Код доступа для <strong>{lastIssuedCode.name}</strong>:
              <span className="font-mono ml-2">{lastIssuedCode.code}</span>
            </span>
            <button
              onClick={() => setLastIssuedCode(null)}
              className="text-xs text-green-700 hover:text-green-900"
              type="button"
            >
              Скрыть
            </button>
          </div>
        )}


        <div className="space-y-2">
          {studentsLoading ? (
            <div className="text-sm text-gray-500">Загрузка списка...</div>
          ) : studentsList.length === 0 ? (
            <div className="text-sm text-gray-400">Пока нет учеников. Создайте первого.</div>
          ) : (
            studentsList.map((student) => (
              <div
                key={student.id}
                onClick={() => onSelectStudent?.(student.id)}
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-all ${
                  activeStudentId === student.id ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {editingStudentId === student.id ? (
                    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editStudentName}
                        onChange={(e) => setEditStudentName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditStudent(student);
                          if (e.key === 'Escape') cancelEditStudent();
                        }}
                        placeholder="Имя ученика"
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      <input
                        type="text"
                        value={editStudentNickname}
                        onChange={(e) => setEditStudentNickname(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditStudent(student);
                          if (e.key === 'Escape') cancelEditStudent();
                        }}
                        placeholder="Прозвище (только для вас)"
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      {editStudentError && <p className="text-xs text-red-500">{editStudentError}</p>}
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-800 truncate">{student.name}</p>
                      {student.nickname && (
                        <p className="text-xs text-purple-600 truncate">Прозвище: {student.nickname}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Код: <span className="font-mono">{student.codeHint ? `****${student.codeHint}` : 'скрыт'}</span>
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingStudentId === student.id ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); saveEditStudent(student); }}
                        className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:opacity-60"
                        disabled={editStudentSaving}
                        type="button"
                      >
                        {editStudentSaving ? '...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); cancelEditStudent(); }}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      {activeStudentId === student.id && (
                        <span className="text-xs font-semibold text-purple-600">Активный</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditStudent(student); }}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResetStudentCode(student); }}
                        className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                        title="Сбросить код"
                        disabled={resettingStudentId === student.id}
                        type="button"
                      >
                        <RefreshCcw size={16} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteStudent(student); }}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Удалить ученика"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h4 className="text-sm font-semibold text-gray-700">Удалённые ученики</h4>
            <span className="text-xs text-gray-400">восстановление {SOFT_DELETE_DAYS} дней</span>
          </div>
          {deletedStudentsError && <p className="text-xs text-red-500 mb-2">{deletedStudentsError}</p>}
          {deletedStudentsLoading ? (
            <div className="text-sm text-gray-500">Загрузка удалённых...</div>
          ) : deletedStudentsList.length === 0 ? (
            <div className="text-sm text-gray-400">Нет удалённых учеников.</div>
          ) : (
            <div className="space-y-2">
              {deletedStudentsList.map((student) => {
                const daysLeft = getDeletedDaysLeft(student.deletedAt);
                return (
                  <div
                    key={student.id}
                    className="p-3 rounded-xl border border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 truncate">{student.name}</p>
                      {student.nickname && (
                        <p className="text-xs text-purple-600 truncate">Прозвище: {student.nickname}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Удалён: {formatDeletedDate(student.deletedAt) || '—'}
                      </p>
                      {daysLeft !== null && (
                        <p className="text-xs text-gray-500">Осталось: {daysLeft} дн.</p>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestoreStudent(student); }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-60"
                      type="button"
                      disabled={restoringStudentId === student.id}
                    >
                      {restoringStudentId === student.id ? '...' : 'Восстановить'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="mb-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Смена кода учителя</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="password"
            value={teacherCodeForm.current}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, current: e.target.value }))}
            placeholder="Текущий код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <input
            type="password"
            value={teacherCodeForm.next}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, next: e.target.value }))}
            placeholder="Новый код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <input
            type="password"
            value={teacherCodeForm.repeat}
            onChange={(e) => setTeacherCodeForm((prev) => ({ ...prev, repeat: e.target.value }))}
            placeholder="Повторите код"
            className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <span className="text-xs text-gray-500">Код хранится в зашифрованном виде. Новый код вступит в силу сразу.</span>
          <Button onClick={handleChangeTeacherCode} disabled={teacherCodeSaving}>
            {teacherCodeSaving ? 'Сохранение...' : 'Обновить код'}
          </Button>
        </div>
        {teacherCodeError && <p className="text-xs text-red-500 mt-2">{teacherCodeError}</p>}
        {teacherCodeSuccess && <p className="text-xs text-green-600 mt-2">{teacherCodeSuccess}</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Controls */}
        <div className="space-y-6">
          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Выберите номер задания</label>
            <select 
              value={selectedTask} 
              onChange={(e) => setSelectedTask(Number(e.target.value))}
              className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-purple-500"
            >
              {tasksList.map(t => (
                <option key={t.id} value={t.number}>Задание {getTaskDisplayNumber(t)}: {t.title}</option>
              ))}
            </select>
          </Card>

          <Card>
            <label className="block text-sm font-medium text-gray-700 mb-2">Уровень сложности</label>
            <div className="flex flex-col gap-2">
              {Object.values(LEVELS).map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`p-3 rounded-xl border text-left flex justify-between items-center transition-all ${
                    selectedLevel === lvl.id 
                    ? `border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500` 
                    : 'border-gray-200 hover:border-purple-300 text-gray-600'
                  }`}
                >
                  <span className="font-medium">{lvl.label}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border opacity-70">до {lvl.maxScore}%</span>
                </button>
              ))}
            </div>
          </Card>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
            <strong>Всего вопросов:</strong> {currentQuestions.length}<br/>
            Минимум 11 вопросов рекомендуется для разнообразия выборки.
          </div>
        </div>

        {/* MIDDLE COLUMN: Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editingQuestionId ? <Pencil size={20} className="text-purple-600" /> : <Plus size={20} className="text-purple-600" />}
                {editingQuestionId ? 'Редактировать вопрос' : 'Добавить вопрос'}
              </h3>
              {editingQuestionId && (
                <button
                  type="button"
                  onClick={cancelEditQuestion}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Отменить
                </button>
              )}
            </div>
            
            <div className="space-y-4" onPaste={handlePasteImages}>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Текст вопроса (необязательно)</label>
                <textarea 
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 min-h-[100px] outline-none focus:border-purple-500"
                  placeholder="Введите текст задания..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Скриншоты вопроса</label>
                  <div
                    onDrop={handleScreenshotsDrop}
                    onDragOver={handleScreenshotsDragOver}
                    onDragLeave={handleScreenshotsDragLeave}
                    className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
                      isDraggingScreens ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={screenshotsRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => addScreenshotFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                      <span>Перетащите изображения сюда</span>
                      <button
                        type="button"
                        onClick={() => screenshotsRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">Можно вставить из буфера (Ctrl+V)</div>
                  </div>
                  {screenshotPreviews.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {screenshotPreviews.map((item, idx) => (
                        <div key={`${item.file.name}-${idx}`} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                          <div className="bg-gray-50 p-2 flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500 truncate">{item.file.name}</span>
                            <button
                              type="button"
                              onClick={() => removeScreenshot(idx)}
                              className="text-xs text-red-500 hover:text-red-600"
                            >
                              Удалить
                            </button>
                          </div>
                          <img
                            src={item.url}
                            alt={item.file.name}
                            className="w-full object-contain bg-white"
                            style={{ maxHeight: '360px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {existingQuestionScreenshots.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {existingQuestionScreenshots.map((item, idx) => {
                        const imgUrl = item?.url || (item?.storageName ? `/uploads/${item.storageName}` : '');
                        return (
                          <div key={item.id || item.storageName || item.url || idx} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                            <div className="bg-gray-50 p-2 flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-500 truncate">{item.name || 'Скриншот'}</span>
                              <button
                                type="button"
                                onClick={() => setExistingQuestionScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-xs text-red-500 hover:text-red-600"
                              >
                                Удалить
                              </button>
                            </div>
                            {imgUrl && (
                              <img
                                src={imgUrl}
                                alt={item.name || 'Скриншот'}
                                className="w-full object-contain bg-white"
                                style={{ maxHeight: '360px' }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Доп. файлы</label>
                  <div
                    onDrop={handleFilesDrop}
                    onDragOver={handleFilesDragOver}
                    onDragLeave={handleFilesDragLeave}
                    className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
                      isDraggingFiles ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <input
                      ref={filesRef}
                      type="file"
                      multiple
                      onChange={(e) => addExtraFiles(e.target.files)}
                      className="hidden"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                      <span>Перетащите файлы сюда</span>
                      <button
                        type="button"
                        onClick={() => filesRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  {questionFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {questionFiles.map((entry, idx) => (
                        <div key={entry.id || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-gray-400">•</span>
                            <input
                              type="text"
                              value={entry.base}
                              onChange={(e) => {
                                const value = e.target.value;
                                setQuestionFiles((prev) => prev.map((item, i) => (i === idx ? { ...item, base: value } : item)));
                              }}
                              onBlur={() => {
                                setQuestionFiles((prev) => prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const nextBase = String(item.base ?? '').trim();
                                  if (nextBase) return item;
                                  const fallback = item.originalBase || splitUploadFileName(item.file?.name || '').base || 'Файл';
                                  return { ...item, base: fallback };
                                }));
                              }}
                              className="text-xs text-gray-600 bg-transparent border-b border-dashed border-gray-300 focus:border-purple-400 outline-none min-w-[60px] max-w-[220px]"
                            />
                            {entry.ext ? <span className="text-xs text-gray-400">.{entry.ext}</span> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExtraFile(idx)}
                            className="text-red-500 hover:text-red-600"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {existingQuestionFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {existingQuestionFiles.map((file, idx) => {
                        const { base, ext } = splitUploadFileName(file?.name || '');
                        return (
                          <div key={file.id || file.storageName || file.url || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-gray-400">•</span>
                              <input
                                type="text"
                                value={base}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setExistingQuestionFiles((prev) => prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    const suffix = ext ? `.${ext}` : '';
                                    return { ...item, name: `${value}${suffix}` };
                                  }));
                                }}
                                onBlur={() => {
                                  setExistingQuestionFiles((prev) => prev.map((item, i) => {
                                    if (i !== idx) return item;
                                    const current = String(item?.name || '').trim();
                                    const parsed = splitUploadFileName(current);
                                    if (parsed.base) return item;
                                    const fallbackBase = 'Файл';
                                    const suffix = parsed.ext ? `.${parsed.ext}` : '';
                                    return { ...item, name: `${fallbackBase}${suffix}` };
                                  }));
                                }}
                                className="text-xs text-gray-600 bg-transparent border-b border-dashed border-gray-300 focus:border-purple-400 outline-none min-w-[60px] max-w-[220px]"
                              />
                              {ext ? <span className="text-xs text-gray-400">.{ext}</span> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setExistingQuestionFiles((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-600"
                            >
                              Удалить
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              {questionUploadError && <p className="text-xs text-red-500">{questionUploadError}</p>}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Правильный ответ</label>
                {answerCount > 1 ? (
                  Number(selectedTask) === GAME_THEORY_TASK ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                        <input
                          type="text"
                          value={answerInputs[0] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[0] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder="Ответ 19"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                          <input
                            type="text"
                            value={answerInputs[1] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAnswerInputs((prev) => {
                                const next = [...prev];
                                next[1] = value;
                                return next;
                              });
                            }}
                            className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                            placeholder="Ответ 20.1"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                          <input
                            type="text"
                            value={answerInputs[2] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              setAnswerInputs((prev) => {
                                const next = [...prev];
                                next[2] = value;
                                return next;
                              });
                            }}
                            className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                            placeholder="Ответ 20.2"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                        <input
                          type="text"
                          value={answerInputs[3] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[3] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder="Ответ 21"
                        />
                      </div>
                    </div>
                  ) : answerCount === 20 ? (
                    <div className="grid grid-cols-[32px_1fr_1fr] gap-2">
                      {Array.from({ length: 10 }).map((_, rowIdx) => {
                        const leftIdx = rowIdx;
                        const rightIdx = rowIdx + 10;
                        return (
                          <React.Fragment key={rowIdx}>
                            <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                              {rowIdx + 1}
                            </div>
                            <input
                              type="text"
                              value={answerInputs[leftIdx] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setAnswerInputs((prev) => {
                                  const next = [...prev];
                                  next[leftIdx] = value;
                                  return next;
                                });
                              }}
                              className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                              placeholder="Ответ 1"
                            />
                            <input
                              type="text"
                              value={answerInputs[rightIdx] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setAnswerInputs((prev) => {
                                  const next = [...prev];
                                  next[rightIdx] = value;
                                  return next;
                                });
                              }}
                              className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                              placeholder="Ответ 2"
                            />
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Array.from({ length: answerCount }).map((_, idx) => (
                        <input
                          key={idx}
                          type="text"
                          value={answerInputs[idx] ?? ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setAnswerInputs((prev) => {
                              const next = [...prev];
                              next[idx] = value;
                              return next;
                            });
                          }}
                          className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                          placeholder={`Ответ ${idx + 1}`}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <input
                    type="text"
                    value={answerInputs[0] ?? ''}
                    onChange={(e) => setAnswerInputs([e.target.value])}
                    className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                    placeholder="Введите правильный ответ"
                  />
                )}
              </div>

              <div className="pt-2">
                <Button onClick={handleSaveQuestion} className="w-full" disabled={isUploadingQuestion}>
                  <Save size={18} /> {isUploadingQuestion ? 'Загрузка...' : (editingQuestionId ? 'Сохранить изменения' : 'Сохранить вопрос в базу')}
                </Button>
              </div>
            </div>
          </Card>

          {/* Question List */}
          <div className="space-y-3">
            <h3 className="font-bold text-gray-700">Существующие вопросы ({currentQuestions.length})</h3>
            {currentQuestions.length === 0 ? (
              <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                В этой категории пока нет вопросов.
              </div>
            ) : (
              currentQuestions.map((q, idx) => (
                <div key={q.id} className={`bg-white p-4 rounded-xl border shadow-sm flex justify-between items-start gap-4 ${editingQuestionId === q.id ? 'border-purple-300 bg-purple-50/30' : 'border-gray-100'}`}>
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                    <p className="text-gray-800 font-medium mb-1">{q.question || 'Вопрос без текста'}</p>
                    <div className="text-xs text-gray-500 flex gap-2">
                       <span>
                        Ответ:{' '}
                        <span className="text-green-600 font-bold">
                          {(() => {
                            const count = getAnswerCountForTask(selectedTask);
                            const answers = getExpectedAnswers(q, count);
                            if (count <= 1) return answers[0] || '';
                            return answers.filter(Boolean).join('; ');
                          })()}
                        </span>
                      </span>
                    </div>
                    {Array.isArray(q.screenshots) && q.screenshots.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.screenshots.map((img) => {
                          const imgUrl = img?.url || (img?.storageName ? `/uploads/${img.storageName}` : '');
                          return (
                          <button
                            key={img.id || img.url || img.storageName}
                            type="button"
                            onClick={() => imgUrl && window.open(imgUrl, '_blank', 'noopener,noreferrer')}
                            className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden hover:border-purple-300"
                            title="Открыть изображение"
                          >
                            <img
                              src={imgUrl}
                              alt={img.name || 'Скриншот'}
                              className="h-24 w-24 object-contain"
                            />
                          </button>
                        );
                        })}
                      </div>
                    )}
                    {Array.isArray(q.files) && q.files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {q.files.map((file) => {
                          const fileUrl = file?.url || (file?.storageName ? `/uploads/${file.storageName}` : '');
                          return (
                            <a
                              key={file.id || file.url || file.storageName}
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                            >
                              <span className="truncate">{file.name || 'Файл'}</span>
                              <Download size={16} className="text-purple-600" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditQuestion(q)}
                      className="text-gray-400 hover:text-purple-600 transition-colors p-1"
                      title="Редактировать"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteQuestion(selectedTask, selectedLevel, q.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Удалить"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({
  teachers,
  teachersLoading,
  teachersError,
  onTeachersChanged
}) => {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [teacherActionError, setTeacherActionError] = useState('');
  const [teacherActionLoading, setTeacherActionLoading] = useState(false);
  const [lastTeacherCode, setLastTeacherCode] = useState(null);
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editTeacherName, setEditTeacherName] = useState('');
  const [editTeacherError, setEditTeacherError] = useState('');
  const [editTeacherSaving, setEditTeacherSaving] = useState(false);
  const [resettingTeacherId, setResettingTeacherId] = useState(null);
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminStudentsLoading, setAdminStudentsLoading] = useState(false);
  const [adminStudentsError, setAdminStudentsError] = useState('');

  const loadAllStudents = async () => {
    setAdminStudentsLoading(true);
    try {
      const data = await api.getStudents();
      setAdminStudents(data);
      setAdminStudentsError('');
    } catch (err) {
      setAdminStudentsError(err?.message || err);
    } finally {
      setAdminStudentsLoading(false);
    }
  };

  useEffect(() => {
    loadAllStudents();
  }, [teachers?.length]);

  const handleCreateTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) {
      setTeacherActionError('Введите имя учителя');
      return;
    }
    setTeacherActionLoading(true);
    try {
      const created = await api.createTeacher(name);
      const { code, ...rest } = created || {};
      if (code) setLastTeacherCode({ name: rest?.name || name, code });
      setNewTeacherName('');
      setTeacherActionError('');
      onTeachersChanged?.();
    } catch (err) {
      setTeacherActionError(err?.message || err);
    } finally {
      setTeacherActionLoading(false);
    }
  };

  const handleDeleteTeacher = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Удалить учителя "${teacher.name}"? Все его ученики и данные будут удалены.`)) return;
    try {
      await api.deleteTeacher(teacher.id);
      onTeachersChanged?.();
      loadAllStudents();
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleResetTeacherCode = async (teacher) => {
    if (!teacher?.id) return;
    if (!confirm(`Сгенерировать новый код для "${teacher.name}"?`)) return;
    setResettingTeacherId(teacher.id);
    try {
      const res = await api.resetTeacherCode(teacher.id);
      if (res?.code) setLastTeacherCode({ name: teacher.name, code: res.code });
      onTeachersChanged?.();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingTeacherId(null);
    }
  };

  const startEditTeacher = (teacher) => {
    if (!teacher?.id) return;
    setEditingTeacherId(teacher.id);
    setEditTeacherName(teacher.name || '');
    setEditTeacherError('');
  };

  const cancelEditTeacher = () => {
    setEditingTeacherId(null);
    setEditTeacherName('');
    setEditTeacherError('');
  };

  const saveEditTeacher = async (teacher) => {
    const name = editTeacherName.trim();
    if (!name) {
      setEditTeacherError('Введите имя учителя');
      return;
    }
    setEditTeacherSaving(true);
    try {
      await api.updateTeacherName(teacher.id, name);
      cancelEditTeacher();
      onTeachersChanged?.();
    } catch (err) {
      setEditTeacherError(err?.message || err);
    } finally {
      setEditTeacherSaving(false);
    }
  };

  const teacherMap = useMemo(() => {
    const map = new Map();
    (teachers || []).forEach((teacher) => map.set(teacher.id, teacher.name));
    return map;
  }, [teachers]);

  return (
    <div className="animate-fadeIn space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Админка</h2>
        <p className="text-gray-500">Управление учителями и всеми учениками</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Учителя</h3>
            <p className="text-xs text-gray-500">Всего: {teachers?.length || 0}</p>
          </div>
          {teachersError && <span className="text-xs text-red-500">{teachersError}</span>}
        </div>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newTeacherName}
            onChange={(e) => { setNewTeacherName(e.target.value); setTeacherActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeacher(); }}
            placeholder="Имя учителя"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <Button onClick={handleCreateTeacher} disabled={teacherActionLoading || !newTeacherName.trim()}>
            <Plus size={16}/> Добавить
          </Button>
        </div>
        {teacherActionError && <p className="text-xs text-red-500 mb-3">{teacherActionError}</p>}
        {lastTeacherCode && (
          <div className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Код доступа для <strong>{lastTeacherCode.name}</strong>:
              <span className="font-mono ml-2">{lastTeacherCode.code}</span>
            </span>
            <button
              onClick={() => setLastTeacherCode(null)}
              className="text-xs text-green-700 hover:text-green-900"
              type="button"
            >
              Скрыть
            </button>
          </div>
        )}

        <div className="space-y-2">
          {teachersLoading ? (
            <div className="text-sm text-gray-500">Загрузка списка...</div>
          ) : (teachers || []).length === 0 ? (
            <div className="text-sm text-gray-400">Пока нет учителей. Создайте первого.</div>
          ) : (
            (teachers || []).map((teacher) => (
              <div key={teacher.id} className="p-3 rounded-xl border flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingTeacherId === teacher.id ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editTeacherName}
                        onChange={(e) => setEditTeacherName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditTeacher(teacher);
                          if (e.key === 'Escape') cancelEditTeacher();
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                      />
                      {editTeacherError && <p className="text-xs text-red-500">{editTeacherError}</p>}
                    </div>
                  ) : (
                    <>
                      <p className="font-medium text-gray-800 truncate">{teacher.name}</p>
                      <p className="text-xs text-gray-500">
                        Код: <span className="font-mono">{teacher.codeHint ? `****${teacher.codeHint}` : 'скрыт'}</span>
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingTeacherId === teacher.id ? (
                    <>
                      <button
                        onClick={() => saveEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-700 disabled:opacity-60"
                        disabled={editTeacherSaving}
                        type="button"
                      >
                        {editTeacherSaving ? '...' : 'Сохранить'}
                      </button>
                      <button
                        onClick={cancelEditTeacher}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEditTeacher(teacher)}
                        className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                        type="button"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleResetTeacherCode(teacher)}
                        className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                        title="Сбросить код"
                        disabled={resettingTeacherId === teacher.id}
                        type="button"
                      >
                        <RefreshCcw size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                        title="Удалить учителя"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Все ученики</h3>
            <p className="text-xs text-gray-500">Всего: {adminStudents.length}</p>
          </div>
          {adminStudentsError && <span className="text-xs text-red-500">{adminStudentsError}</span>}
        </div>
        {adminStudentsLoading ? (
          <div className="text-sm text-gray-500">Загрузка списка учеников...</div>
        ) : adminStudents.length === 0 ? (
          <div className="text-sm text-gray-400">Пока нет учеников.</div>
        ) : (
          <div className="space-y-2">
            {adminStudents.map((student) => (
              <div key={student.id} className="p-3 rounded-xl border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{student.name}</p>
                  <p className="text-xs text-gray-500">
                    Учитель: <span className="font-medium text-gray-700">{teacherMap.get(student.teacherId) || 'Неизвестно'}</span>
                  </p>
                </div>
                <span className="text-xs text-gray-400">{student.codeHint ? `****${student.codeHint}` : 'скрыт'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

/**
 * STUDENT TEST MODAL
 */
const PythonTestModal = ({ task, onClose, onComplete, progress, studentId, testDb, initialQuestionIndex, onQuestionChange, onStreakSaved }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [expandedImage, setExpandedImage] = useState(null);
  const [code, setCode] = useState('');
  const [runnerLoading, setRunnerLoading] = useState(false);
  const [runnerError, setRunnerError] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [showTheory, setShowTheory] = useState(true);
  const currentQuestionIdRef = useRef(null);
  const runnerWorkerRef = useRef(null);
  const runnerPendingRef = useRef(new Map());

  const currentMastery = progress[task.id] || 0;
  const getQuestionIndexKey = () => {
    const safeStudentId = studentId || 'anon';
    const taskNum = task?.number || 'task';
    return `py_last_q_${safeStudentId}_${taskNum}`;
  };
  const getDraftKey = (questionId) => {
    const safeStudentId = studentId || 'anon';
    return `py_draft_${safeStudentId}_${task?.number || 'task'}_${questionId}`;
  };

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    const list = Array.isArray(qs) ? qs : [];
    let rawIndex = Number(initialQuestionIndex);
    if (!Number.isFinite(rawIndex) && typeof window !== 'undefined') {
      try {
        rawIndex = Number(window.localStorage.getItem(getQuestionIndexKey()));
      } catch {}
    }
    const safeIndex = Number.isFinite(rawIndex) && list.length > 0
      ? Math.max(0, Math.min(list.length - 1, Math.floor(rawIndex)))
      : 0;
    setQuestions(list);
    if (list.length > 0) {
      setCurrentIndex(safeIndex);
    }
    setSolvedIds(new Set());
    setSolvedCodeById({});
    setTestResults([]);
    setRunnerError('');
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, testDb, studentId, initialQuestionIndex]);

  useEffect(() => {
    if (!Number.isFinite(currentIndex)) return;
    if (!questions.length) return;
    onQuestionChange?.(currentIndex);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(getQuestionIndexKey(), String(currentIndex));
    } catch {}
  }, [currentIndex, questions.length, onQuestionChange]);

  useEffect(() => {
    const current = questions[currentIndex];
    const currentId = String(current?.id ?? currentIndex);
    currentQuestionIdRef.current = currentId;
    const starter = current?.starterCode || '';
    const solvedCode = solvedCodeById?.[currentId];
    let nextCode = typeof solvedCode === 'string' ? solvedCode : starter;
    if (typeof window !== 'undefined') {
      try {
        const draft = window.localStorage.getItem(getDraftKey(currentId));
        if (typeof draft === 'string' && draft.length > 0) {
          nextCode = draft;
        }
      } catch {}
    }
    setCode(nextCode);
    setTestResults([]);
    setRunnerError('');
  }, [questions, currentIndex, solvedCodeById, studentId, task?.number]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentId = currentQuestionIdRef.current;
    if (!currentId) return;
    try {
      if (code && code.length > 0) {
        window.localStorage.setItem(getDraftKey(currentId), code);
      } else {
        window.localStorage.removeItem(getDraftKey(currentId));
      }
    } catch {}
  }, [code, studentId, task?.number]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  const resolvePendingRuns = (message) => {
    runnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.resolve({ output: '', error: message });
    });
    runnerPendingRef.current.clear();
  };

  const disposeRunnerWorker = (message) => {
    if (runnerWorkerRef.current) {
      runnerWorkerRef.current.terminate();
      runnerWorkerRef.current = null;
    }
    if (message) resolvePendingRuns(message);
  };

  const ensureRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (runnerWorkerRef.current) return runnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = runnerPendingRef.current.get(data.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        runnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string' ? data.output : String(data.output ?? '');
        const error = typeof data.error === 'string' ? data.error : (data.error ? String(data.error) : '');
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposeRunnerWorker('Ошибка выполнения Python.');
      runnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposeRunnerWorker('Python runner stopped.'), []);

  const runPythonInMainThread = async (source, inputValue) => {
    const pyodide = await ensurePyodideReady();
    const wrapped = [
      'import sys, io, traceback',
      `_input = ${JSON.stringify(String(inputValue ?? ''))}`,
      '_stdout = io.StringIO()',
      '_stderr = io.StringIO()',
      'sys.stdin = io.StringIO(_input)',
      'sys.stdout = _stdout',
      'sys.stderr = _stderr',
      '_globals = {}',
      'try:',
      `    exec(${JSON.stringify(String(source ?? ''))}, _globals, _globals)`,
      'except Exception:',
      '    traceback.print_exc()',
      '__output = _stdout.getvalue()',
      '__error = _stderr.getvalue()',
    ].join('\n');
    await pyodide.runPythonAsync(wrapped);
    const output = pyodide.globals.get('__output') || '';
    const error = pyodide.globals.get('__error') || '';
    pyodide.globals.delete('__output');
    pyodide.globals.delete('__error');
    return { output: String(output), error: String(error) };
  };

  const runPythonCode = async (source, inputValue) => {
    const worker = ensureRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          runnerPendingRef.current.delete(id);
          resolve({
            output: '',
            error: `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`
          });
          disposeRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        runnerPendingRef.current.set(id, { resolve, timer });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    return runPythonInMainThread(source, inputValue);
  };

  const handleRunTests = async () => {
    const currentQuestion = questions[currentIndex];
    if (!currentQuestion) return;
    setRunnerLoading(true);
    setRunnerError('');
    const rawTests = Array.isArray(currentQuestion.tests)
      ? currentQuestion.tests
      : (currentQuestion.answer ? [{ input: '', output: currentQuestion.answer }] : []);
    const sanitizedTests = rawTests.map((test) => ({
      input: String(test?.input ?? ''),
      output: String(test?.output ?? ''),
    }));
    if (sanitizedTests.length === 0) {
      setRunnerLoading(false);
      setRunnerError('Для этой задачи пока нет тестов.');
      setTestResults([]);
      return;
    }
    try {
      const resultsList = [];
      for (const test of sanitizedTests) {
        const res = await runPythonCode(code, test.input);
        const normalizedOut = normalizeOutput(res.output);
        const normalizedExpected = normalizeOutput(test.output);
        const passed = !res.error && normalizedOut === normalizedExpected;
        resultsList.push({
          input: test.input,
          expected: test.output,
          output: res.output,
          error: res.error,
          passed
        });
      }
      setTestResults(resultsList);

      const allPassed = resultsList.length > 0 && resultsList.every((item) => item.passed);
      if (allPassed) {
        const currentId = String(currentQuestion?.id ?? currentIndex);
        if (studentId) {
          try {
            const resp = await api.solveQuestion({
              studentId,
              taskNumber: task.number,
              levelId: PYTHON_LEVEL_ID,
              questionId: currentQuestion.id,
              totalQuestions: questions.length,
              levelMax: 100,
              levelTotals: { [PYTHON_LEVEL_ID]: questions.length },
              code,
              localDay: getLocalDayKey(),
            });
            setSolvedIds((prev) => {
              const next = new Set(prev);
              next.add(currentId);
              return next;
            });
            setSolvedCodeById((prev) => ({ ...prev, [currentId]: code }));
            if (typeof onStreakSaved === 'function') {
              if (resp?.streak) {
                onStreakSaved(resp.streak);
              } else {
                api.getStudentData(studentId)
                  .then((data) => {
                    if (data?.streak) onStreakSaved(data.streak);
                  })
                  .catch(() => {});
              }
            }
            if (typeof resp?.taskProgress === 'number') {
              onComplete(task.id, resp.taskProgress, { skipServer: true });
              setRunnerLoading(false);
              return;
            }
          } catch (err) {
            console.error(err);
          }
        }
        const totalCount = questions.length;
        if (totalCount > 0) {
          const prevSolved = solvedIds.size;
          const nextSolved = solvedIds.has(currentId) ? prevSolved : prevSolved + 1;
          const nextProgress = Math.round((nextSolved / totalCount) * 100);
          onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
        }
      }
    } catch (err) {
      setRunnerError(err?.message || err);
    } finally {
      setRunnerLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };

  if (!task) return null;

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative animate-fadeIn text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Учитель еще не добавил задания для этой темы.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
  const rawTests = Array.isArray(currentQuestion?.tests)
    ? currentQuestion.tests
    : (currentQuestion?.answer ? [{ input: '', output: currentQuestion.answer }] : []);
  const testsToShow = rawTests.map((test) => ({
    input: String(test?.input ?? ''),
    output: String(test?.output ?? '')
  }));
  const solvedAllTests = isSolved && testResults.length === 0;
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoIndent: 'advanced',
    formatOnType: true,
    formatOnPaste: true
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden animate-fadeIn">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (idx === currentIndex) {
                btnClass += "border-purple-600 ring-2 ring-purple-100 text-purple-600 bg-white";
              } else {
                btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 ";
              }

              if (solved) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
              if (idx === currentIndex && solved) {
                btnClass = btnClass
                  .replace('border-purple-600', 'border-green-400')
                  .replace('ring-purple-100', 'ring-green-100')
                  .replace('text-purple-600', 'text-green-700')
                  .replace('bg-white', 'bg-green-100');
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : undefined}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-3">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-${task.number}`}
                        src={theory.content}
                        className="w-full h-[360px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {screenshots.length > 0 && (
            <div className="space-y-3 mb-6">
              {screenshots.map((img) => (
                <div
                  key={img.id || img.url}
                  className="border rounded-2xl overflow-hidden bg-gray-900/5"
                  style={{ maxHeight: '65vh' }}
                >
                  <img
                    src={img.url}
                    alt={img.name || 'Скриншот'}
                    className="w-full object-contain cursor-zoom-in"
                    style={{ maxHeight: '65vh' }}
                    onClick={() => setExpandedImage(img)}
                  />
                </div>
              ))}
            </div>
          )}

          {extraFiles.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
              <div className="space-y-2">
                {extraFiles.map((file) => (
                  <a
                    key={file.id || file.url}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                  >
                    <span className="truncate">{file.name}</span>
                    <Download size={16} className="text-purple-600" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {isSolved && (
            <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
          )}
          {currentQuestion?.question && (
            <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-400 uppercase">Код</label>
              <button
                type="button"
                onClick={() => setCode(currentQuestion?.starterCode || '')}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                Сбросить
              </button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height="260px"
                language="python"
                theme="vs-dark"
                value={code}
                onChange={(value) => {
                  setCode(value ?? '');
                  if (testResults.length > 0) setTestResults([]);
                }}
                options={editorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
          </div>

          {runnerError && (
            <div className="mb-4 text-sm text-red-500">{runnerError}</div>
          )}

          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-gray-400 uppercase">Тесты</div>
              <Button onClick={handleRunTests} disabled={runnerLoading || !code.trim()}>
                {runnerLoading ? 'Запуск...' : 'Запустить тесты'}
              </Button>
            </div>
            {testsToShow.length === 0 ? (
              <div className="text-sm text-gray-500">Учитель еще не добавил тесты.</div>
            ) : (
              <div className="space-y-2">
                {testsToShow.map((item, idx) => {
                  const result = testResults[idx];
                  const passed = result?.passed ?? (solvedAllTests ? true : undefined);
                  return (
                    <div
                      key={`${idx}-${item.input}`}
                      className={`rounded-2xl border p-3 text-sm ${
                        passed === undefined
                          ? 'border-gray-200 bg-gray-50'
                          : (passed ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Тест {idx + 1}</span>
                        <span className={`text-xs font-bold ${
                          passed === undefined ? 'text-gray-400' : (passed ? 'text-emerald-700' : 'text-red-600')
                        }`}>
                          {passed === undefined ? '—' : (passed ? 'OK' : 'Ошибка')}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-gray-600">
                        <div><span className="font-semibold">Вход:</span> {item.input || '—'}</div>
                        <div><span className="font-semibold">Ожидалось:</span> {item.output || '—'}</div>
                        {result && (
                          <>
                            <div><span className="font-semibold">Вывод:</span> {normalizeOutput(result.output) || '—'}</div>
                            {result.error && <div className="text-red-600 mt-1">{result.error}</div>}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Прогресс темы: <span className="font-semibold text-purple-700">{currentMastery}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={handleNext} disabled={currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
      {expandedImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={expandedImage.url}
              alt={expandedImage.name || 'Скриншот'}
              className="w-full h-full object-contain rounded-2xl shadow-2xl"
              style={{ maxHeight: '95vh' }}
            />
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
              type="button"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const PythonReviewModal = ({ task, onClose, studentId, testDb }) => {
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [solvedCodeById, setSolvedCodeById] = useState({});
  const [showTheory, setShowTheory] = useState(true);

  useEffect(() => {
    const qs = testDb?.[task.number]?.[PYTHON_LEVEL_ID] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setSolvedCodeById({});
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, PYTHON_LEVEL_ID, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setSolvedCodeById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setSolvedCodeById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (!task) return null;

  if (!Array.isArray(questions) || questions.length === 0) {
    const emptyModal = (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-3xl w-full max-w-xl p-6 md:p-8 shadow-2xl relative animate-fadeIn text-center">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          <h2 className="text-2xl font-bold text-gray-900">Заданий пока нет</h2>
          <p className="text-gray-500 mt-2">Для этой темы нет задач.</p>
          <div className="mt-6">
            <Button onClick={onClose}>Закрыть</Button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(emptyModal, document.body) : null;
  }

  const currentQuestion = questions[currentIndex];
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const code = typeof solvedCodeById?.[currentId] === 'string' ? solvedCodeById[currentId] : '';
  const theory = testDb?.[task.number]?.pythonTheory || null;
  const theoryFullUrl = theory?.type === 'gdoc' ? buildGoogleDocFullUrl(theory.content) : '';
  const editorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true,
    readOnly: true
  };

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden animate-fadeIn">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Тема</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

              if (idx === currentIndex) {
                btnClass += "border-purple-600 ring-2 ring-purple-100 text-purple-600 bg-white";
              } else {
                btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 ";
              }

              if (solved) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
              if (idx === currentIndex && solved) {
                btnClass = btnClass
                  .replace('border-purple-600', 'border-green-400')
                  .replace('ring-purple-100', 'ring-green-100')
                  .replace('text-purple-600', 'text-green-700')
                  .replace('bg-white', 'bg-green-100');
              }

              return (
                <button
                  key={qId}
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : 'Не решено'}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {theory?.content && (
            <div className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Теория</div>
                <div className="flex items-center gap-3">
                  {theoryFullUrl && (
                    <a
                      href={theoryFullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Открыть полностью
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowTheory((prev) => !prev)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {showTheory ? 'Свернуть' : 'Показать'}
                  </button>
                </div>
              </div>
              {showTheory && (
                theory.type === 'gdoc' ? (
                  isGoogleDocEmbedUrl(theory.content) ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-purple-100 bg-white">
                      <iframe
                        title={`theory-review-${task.number}`}
                        src={theory.content}
                        className="w-full h-[300px]"
                      />
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-red-500">
                      Нужна ссылка для встраивания Google Docs (Файл → Опубликовать в интернете → Встроить).
                    </div>
                  )
                ) : (
                  <div className="mt-3 whitespace-pre-wrap text-sm text-gray-700">
                    {theory.content}
                  </div>
                )
              )}
            </div>
          )}
          {currentQuestion?.question && (
            <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
          )}
          <div className="rounded-2xl overflow-hidden border border-gray-800">
            <Editor
              height="280px"
              language="python"
              theme="vs-dark"
              value={code || '# Решение еще не сохранено'}
              options={editorOptions}
              loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
            />
          </div>
          {!isSolved && (
            <div className="mt-3 text-sm text-gray-500">Ученик еще не решил эту задачу.</div>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))} disabled={currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const ProgressReviewModal = ({ task, onClose, studentId, testDb }) => {
  const levelOptions = Object.values(LEVELS);
  const [levelId, setLevelId] = useState(levelOptions[0]?.id || 'basic');
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [answerById, setAnswerById] = useState({});

  useEffect(() => {
    if (!task) return;
    const available = levelOptions.filter((lvl) => {
      const list = testDb?.[task.number]?.[lvl.id];
      return Array.isArray(list) && list.length > 0;
    });
    const nextLevel = available[0]?.id || levelOptions[0]?.id || 'basic';
    setLevelId(nextLevel);
  }, [task?.number, testDb]);

  useEffect(() => {
    if (!task || !levelId) return;
    const qs = testDb?.[task.number]?.[levelId] || [];
    setQuestions(Array.isArray(qs) ? qs : []);
    setCurrentIndex(0);
    setSolvedIds(new Set());
    setAnswerById({});
    if (studentId) {
      api.getSolvedQuestions(studentId, task.number, levelId, { includeCode: true })
        .then((payload) => {
          if (Array.isArray(payload)) {
            setSolvedIds(new Set(payload.map((id) => String(id))));
            setAnswerById({});
          } else {
            const ids = Array.isArray(payload?.ids) ? payload.ids : [];
            const codeById = payload?.codeById && typeof payload.codeById === 'object' ? payload.codeById : {};
            setSolvedIds(new Set(ids.map((id) => String(id))));
            setAnswerById(codeById);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [task?.number, levelId, testDb, studentId]);

  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (!task) return null;

  const parseStoredAnswers = (raw) => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (looksJson) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((val) => String(val ?? ''));
        if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.answers)) return parsed.answers.map((val) => String(val ?? ''));
          if (typeof parsed.answer === 'string') return [parsed.answer];
        }
      } catch {}
    }
    return [trimmed];
  };

  const buildAnswerLabels = (count) => {
    if (Number(task?.number) === GAME_THEORY_TASK && count === 4) {
      return ['19', '20.1', '20.2', '21'];
    }
    return Array.from({ length: count }, (_, idx) => String(idx + 1));
  };

  const hasQuestions = Array.isArray(questions) && questions.length > 0;
  const currentQuestion = hasQuestions ? questions[currentIndex] : null;
  const currentId = String(currentQuestion?.id ?? currentIndex);
  const isSolved = solvedIds.has(currentId);
  const answerCount = getAnswerCountForTask(task?.number);
  const answerLabels = buildAnswerLabels(answerCount);
  const storedAnswers = parseStoredAnswers(answerById?.[currentId]);
  const expectedAnswers = currentQuestion ? getExpectedAnswers(currentQuestion, answerCount) : Array.from({ length: answerCount }, () => '');
  const hasStoredAnswer = Array.isArray(storedAnswers) && storedAnswers.some((val) => String(val ?? '').trim());
  const showingCorrectFallback = !hasStoredAnswer;
  const answerValues = showingCorrectFallback
    ? expectedAnswers
    : (storedAnswers || Array.from({ length: answerCount }, () => ''));
  const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
    .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
  const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
    .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));

  const modal = (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden animate-fadeIn">
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Задание</div>
              <div className="text-lg font-bold text-gray-900">{task.title}</div>
            </div>
            <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          </div>

          <div className="flex flex-wrap gap-2">
            {levelOptions.map((lvl) => (
              <button
                key={lvl.id}
                type="button"
                onClick={() => setLevelId(lvl.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  levelId === lvl.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>

          {hasQuestions && (
            <div className="flex flex-wrap gap-2">
              {questions.map((q, idx) => {
                const qId = String(q?.id ?? idx);
                const solved = solvedIds.has(qId);
                let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";

                if (idx === currentIndex) {
                  btnClass += "border-purple-600 ring-2 ring-purple-100 text-purple-600 bg-white";
                } else {
                  btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 ";
                }

              if (solved) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
              if (idx === currentIndex && solved) {
                btnClass = btnClass
                  .replace('border-purple-600', 'border-green-400')
                  .replace('ring-purple-100', 'ring-green-100')
                  .replace('text-purple-600', 'text-green-700')
                  .replace('bg-white', 'bg-green-100');
              }

              return (
                  <button
                    key={qId}
                    onClick={() => setCurrentIndex(idx)}
                    className={btnClass}
                    title={solved ? 'Решено' : 'Не решено'}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {!hasQuestions && (
            <div className="text-center text-gray-500 py-10">Для этого уровня пока нет задач.</div>
          )}

          {hasQuestions && (
            <>
              {screenshots.length > 0 && (
                <div className="space-y-3 mb-6">
                  {screenshots.map((img) => (
                    <div
                      key={img.id || img.url}
                      className="border rounded-2xl overflow-hidden bg-gray-900/5"
                      style={{ maxHeight: '65vh' }}
                    >
                      <img
                        src={img.url}
                        alt={img.name || 'Скриншот'}
                        className="w-full object-contain"
                        style={{ maxHeight: '65vh' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {extraFiles.length > 0 && (
                <div className="mb-6">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                  <div className="space-y-2">
                    {extraFiles.map((file) => (
                      <a
                        key={file.id || file.url}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                      >
                        <span className="truncate">{file.name}</span>
                        <Download size={16} className="text-purple-600" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {currentQuestion?.question && (
                <p className="text-lg font-medium text-gray-900 mb-6 whitespace-pre-wrap">{currentQuestion.question}</p>
              )}

              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Ответ ученика</label>
                  {isSolved && <span className="text-xs font-semibold text-emerald-600">Решено</span>}
                </div>
                {answerCount > 1 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                      <div key={`answer-${idx}`} className="space-y-1">
                        <div className="text-xs font-semibold text-gray-500">Ответ {answerLabels[idx]}</div>
                        <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                          {answerValues[idx] ? answerValues[idx] : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                    {answerValues[0] ? answerValues[0] : '—'}
                  </div>
                )}
                {!hasStoredAnswer && (
                  <div className="text-xs text-gray-500">
                    {isSolved ? 'Ответ ученика не сохранён.' : 'Ученик ещё не решил эту задачу.'}
                  </div>
                )}
                {showingCorrectFallback && (
                  <div className="text-xs text-purple-600">
                    Показан правильный ответ из базы.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Решено: {Array.from(solvedIds).length}/{questions.length}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Закрыть</Button>
            <Button onClick={() => setCurrentIndex((prev) => Math.min(prev + 1, Math.max(questions.length - 1, 0)))} disabled={!hasQuestions || currentIndex >= questions.length - 1}>
              Дальше
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const StudentTestModal = ({ task, onClose, onComplete, progress, studentId, testDb, initialLevel, targetQuestions, onLevelSelect, initialQuestionIndex, onQuestionChange, onStreakSaved }) => {
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: string | { a: string, b: string } }
  const [results, setResults] = useState({}); // { [idx]: boolean }
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [expandedImage, setExpandedImage] = useState(null);
  const autoStartRef = useRef(false);

  const currentMastery = progress[task.id] || 0;

  const startTest = async (lvlId, options = {}) => {
    if (!testDb) {
      if (!options?.silent) {
        alert("База тестов еще загружается. Попробуйте чуть позже.");
      }
      return false;
    }

    const qs = testDb[task.number]?.[lvlId] || [];
    
    if (qs.length === 0) {
      if (!options?.silent) {
        alert("Учитель еще не загрузил задания для этого уровня.");
      }
      return false;
    }

    setQuestions(qs);
    setLevel(lvlId);
    const wantsStoredIndex = Number.isFinite(Number(options?.initialIndex));
    const rawIndex = wantsStoredIndex ? Number(options.initialIndex) : 0;
    const safeIndex = qs.length > 0
      ? Math.max(0, Math.min(qs.length - 1, Math.floor(rawIndex)))
      : 0;
    setCurrentIndex(safeIndex);
    setUserAnswers({});
    setResults({});
    setSolvedIds(new Set());
    setStage('testing');
    onLevelSelect?.(lvlId);

    if (studentId) {
      try {
        const solved = await api.getSolvedQuestions(studentId, task.number, lvlId);
        setSolvedIds(new Set((solved || []).map((id) => String(id))));
      } catch (err) {
        console.error(err);
      }
    }
    return true;
  };

  useEffect(() => {
    if (stage !== 'select_level') return;
    if (!initialLevel || autoStartRef.current) return;
    if (!['basic', 'advanced', 'expert'].includes(initialLevel)) return;
    if (!testDb) return;
    autoStartRef.current = true;
    startTest(initialLevel, { silent: true, initialIndex: initialQuestionIndex });
  }, [stage, initialLevel, initialQuestionIndex, testDb]);

  useEffect(() => {
    autoStartRef.current = false;
  }, [task?.number]);

  useEffect(() => {
    if (stage !== 'testing') return;
    if (!Number.isFinite(currentIndex)) return;
    onQuestionChange?.(currentIndex);
  }, [currentIndex, stage, onQuestionChange]);

  const normalizeAnswer = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const handleCheck = async () => {
    const currentQuestion = questions[currentIndex];
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const answerCount = getAnswerCountForTask(task?.number);
    const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);

    let correct = false;
    let answerPayload = null;
    if (answerCount > 1) {
      const answerEntry = Array.isArray(userAnswers[currentIndex]) ? userAnswers[currentIndex] : [];
      const provided = Array.from({ length: answerCount }, (_, i) => String(answerEntry[i] ?? ''));
      const allowPartial = allowsPartialAnswers(task?.number);
      if (!allowPartial && provided.some((val) => !val.trim())) return;
      if (allowPartial && provided.every((val) => !val.trim())) return;
      const trimmedProvided = provided.map((val) => String(val ?? '').trim());
      if (trimmedProvided.some((val) => val)) {
        answerPayload = JSON.stringify({ answers: trimmedProvided });
      }
      correct = expectedAnswers.every((exp, i) => {
        const expectedNorm = normalizeAnswer(exp);
        const providedNorm = normalizeAnswer(provided[i]);
        if (!expectedNorm) return !providedNorm;
        return providedNorm === expectedNorm;
      });
    } else {
      const answerValue = userAnswers[currentIndex];
      if (!String(answerValue ?? '').trim()) return;
      answerPayload = String(answerValue ?? '').trim();
      correct = normalizeAnswer(answerValue) === normalizeAnswer(expectedAnswers[0]);
    }
    const newResults = { ...results, [currentIndex]: correct };
    setResults(newResults);
    
    // Если ответ верный, обновляем прогресс
    if (correct) {
      const levelConfig = Object.values(LEVELS).find(l => l.id === level);
      if (studentId) {
        try {
          const taskLevels = testDb?.[task.number] || {};
          const levelTotals = {
            basic: Array.isArray(taskLevels.basic) ? taskLevels.basic.length : 0,
            advanced: Array.isArray(taskLevels.advanced) ? taskLevels.advanced.length : 0,
            expert: Array.isArray(taskLevels.expert) ? taskLevels.expert.length : 0,
          };
          const resp = await api.solveQuestion({
            studentId,
            taskNumber: task.number,
            levelId: level,
            questionId: currentQuestion.id,
            totalQuestions: questions.length,
            levelMax: levelConfig?.maxScore || 100,
            levelTotals,
            ...(answerPayload ? { code: answerPayload } : {}),
            localDay: getLocalDayKey(),
          });
          setSolvedIds((prev) => {
            const next = new Set(prev);
            next.add(String(currentQuestion.id));
            return next;
          });
            if (typeof onStreakSaved === 'function') {
              if (resp?.streak) {
                onStreakSaved(resp.streak);
              } else {
                api.getStudentData(studentId)
                  .then((data) => {
                    if (data?.streak) onStreakSaved(data.streak);
                  })
                  .catch(() => {});
              }
            }
            if (typeof resp?.taskProgress === 'number') {
              onComplete(task.id, resp.taskProgress, { skipServer: true });
              return;
            }
        } catch (err) {
          console.error(err);
        }
      }
      const weight = LEVEL_WEIGHTS[level] ?? levelConfig?.maxScore ?? 100;
      const totalCount = questions.length;
      if (Number.isFinite(weight) && totalCount > 0) {
        const prevSolved = solvedIds.size;
        const nextSolved = solvedIds.has(String(currentQuestion.id)) ? prevSolved : prevSolved + 1;
        const prevContribution = (prevSolved / totalCount) * weight;
        const nextContribution = (nextSolved / totalCount) * weight;
        const nextProgress = Math.round(Math.max(0, currentMastery - prevContribution + nextContribution));
        onComplete(task.id, Math.min(100, nextProgress), { skipServer: true });
      } else if (levelConfig?.maxScore > currentMastery) {
        onComplete(task.id, levelConfig.maxScore);
      }
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) setCurrentIndex(currentIndex + 1);
    else onClose();
  };


  useEffect(() => {
    document.body.classList.add('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, []);

  if (stage === 'select_level') {
    const modal = (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 md:p-8 overflow-y-auto backdrop-blur-sm">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative animate-fadeIn">
          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Выберите уровень сложности</h2>
            <p className="text-gray-500">Задание №{getTaskDisplayNumber(task)}: {task.title}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(LEVELS).map((lvl) => {
              const isCompleted = currentMastery >= lvl.maxScore;

              return (
                <div 
                  key={lvl.id}
                  onClick={() => {
                    const shouldRestoreIndex = initialLevel && initialLevel === lvl.id;
                    startTest(lvl.id, shouldRestoreIndex ? { initialIndex: initialQuestionIndex } : {});
                  }}
                  className={`border-2 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 ${isCompleted ? 'border-green-200 bg-green-50 opacity-80' : 'hover:shadow-lg bg-white'} ${lvl.color.replace('bg-', 'border-')}`}
                >
                  <div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${lvl.color}`}>
                      {isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{lvl.label}</h3>
                    <p className="text-xs text-gray-500">
                      {lvl.id === 'basic' && "Прототипы с реальных ЕГЭ и Демоверсий."}
                      {lvl.id === 'advanced' && "Усложненные условия."}
                      {lvl.id === 'expert' && "Статград и сложнее."}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <span className="text-sm font-bold text-gray-700">до {lvl.maxScore}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }

  if (stage === 'testing' && questions.length > 0) {
    const currentQuestion = questions[currentIndex];
    const isChecked = results[currentIndex] !== undefined;
    const isCorrect = results[currentIndex];
    const answerCount = getAnswerCountForTask(task?.number);
    const expectedAnswers = getExpectedAnswers(currentQuestion, answerCount);
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const isSolved = solvedIds.has(currentId);
    const storedAnswer = userAnswers[currentIndex];
    const answerValue = answerCount === 1
      ? (isSolved ? String(expectedAnswers[0] ?? '') : String(storedAnswer ?? ''))
      : '';
    const answerValues = answerCount > 1
      ? (
        isSolved
          ? expectedAnswers.map((val) => String(val ?? ''))
          : Array.from({ length: answerCount }, (_, i) => String((Array.isArray(storedAnswer) ? storedAnswer[i] : '') ?? ''))
      )
      : [];
    const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
      .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
    const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
      .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
    const isAnswerReady = isSolved
      ? true
      : (
        answerCount > 1
          ? (allowsPartialAnswers(task?.number)
              ? answerValues.some((val) => String(val ?? '').trim())
              : answerValues.every((val) => String(val ?? '').trim()))
          : Boolean(answerValue.trim())
      );
    const computedChecked = isSolved || isChecked;
    const computedCorrect = isSolved ? true : isCorrect;
    const rawTargets = Array.isArray(targetQuestions) ? targetQuestions : [];
    const targetNumbers = Array.from(new Set(
      rawTargets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
    ));
    const targetStatus = targetNumbers.map((num) => {
      const question = questions[num - 1];
      const qId = question?.id;
      const solved = qId ? solvedIds.has(String(qId)) : false;
      return { num, solved };
    });
    const targetSolvedCount = targetStatus.filter((item) => item.solved).length;

    const modal = (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] p-6 md:p-8 shadow-2xl relative flex flex-col overflow-hidden animate-fadeIn">
          {/* Header & Navigation */}
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex justify-between items-start">
               <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${LEVELS[level.toUpperCase()].color}`}>
                {LEVELS[level.toUpperCase()].label}
              </span>
              <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={20}/></button>
            </div>
            {targetStatus.length > 0 && (
              <div className="rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-xs text-purple-700">
                <div className="font-semibold">Цель — решить эти задания:</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {targetStatus.map((item) => (
                    <span
                      key={item.num}
                      className={`px-2 py-1 rounded-lg border text-xs font-semibold ${
                        item.solved
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                          : 'border-purple-200 bg-white text-purple-700'
                      }`}
                    >
                      №{item.num}{item.solved ? ' ✓' : ''}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-purple-600">
                  Выполнено {targetSolvedCount}/{targetStatus.length}
                </div>
              </div>
            )}
            
            {/* Question Navigation Bar */}
          <div className="flex flex-wrap gap-2">
            {questions.map((q, idx) => {
              const qId = String(q?.id ?? idx);
              const solved = solvedIds.has(qId);
              const status = results[idx]; // true, false or undefined
              let btnClass = "w-8 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-all border-2 ";
              
              if (idx === currentIndex) {
                btnClass += "border-purple-600 ring-2 ring-purple-100 ";
                if (status === undefined && !solved) btnClass += "text-purple-600 bg-white";
              } else {
                btnClass += "border-transparent bg-gray-100 text-gray-500 hover:bg-gray-200 ";
              }

              if (solved) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
              if (!solved && status === true) btnClass = btnClass.replace('bg-gray-100', 'bg-green-100').replace('text-gray-500', 'text-green-600').replace('border-transparent', 'border-green-200');
              if (!solved && status === false) btnClass = btnClass.replace('bg-gray-100', 'bg-red-100').replace('text-gray-500', 'text-red-600').replace('border-transparent', 'border-red-200');
              if (idx === currentIndex && (solved || status === true)) {
                btnClass = btnClass
                  .replace('border-purple-600', 'border-green-400')
                  .replace('ring-purple-100', 'ring-green-100')
                  .replace('text-purple-600', 'text-green-700')
                  .replace('bg-white', 'bg-green-100');
              }

              return (
                <button 
                  key={qId} 
                  onClick={() => setCurrentIndex(idx)}
                  className={btnClass}
                  title={solved ? 'Решено' : undefined}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {screenshots.length > 0 && (
              <div className="space-y-3 mb-6">
                {screenshots.map((img) => (
                  <div
                    key={img.id || img.url}
                    className="border rounded-2xl overflow-hidden bg-gray-900/5"
                    style={{ maxHeight: '65vh' }}
                  >
                    <img
                      src={img.url}
                      alt={img.name || 'Скриншот'}
                      className="w-full object-contain cursor-zoom-in"
                      style={{ maxHeight: '65vh' }}
                      onClick={() => setExpandedImage(img)}
                    />
                  </div>
                ))}
              </div>
            )}

            {extraFiles.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Доп. файлы</p>
                <div className="space-y-2">
                  {extraFiles.map((file) => (
                    <a
                      key={file.id || file.url}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:border-purple-300 hover:bg-purple-50"
                    >
                      <span className="truncate">{file.name}</span>
                      <Download size={16} className="text-purple-600" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isSolved && (
              <div className="mb-2 text-xs font-semibold text-green-600 uppercase tracking-wide">Решено ранее</div>
            )}
            {currentQuestion.question && (
              <p className="text-lg font-medium text-gray-900 mb-6">{currentQuestion.question}</p>
            )}

            <div className="space-y-3 mb-6">
              <label className="block text-xs font-bold text-gray-400 uppercase">Ответ</label>
              {answerCount > 1 ? (
                Number(task?.number) === GAME_THEORY_TASK ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
                      <input
                        type="text"
                        value={answerValues[0] ?? ''}
                        onChange={(e) => {
                          if (computedChecked) return;
                          const value = e.target.value;
                          setUserAnswers((prev) => {
                            const next = { ...prev };
                            const current = Array.isArray(next[currentIndex])
                              ? [...next[currentIndex]]
                              : Array.from({ length: answerCount }, () => '');
                            current[0] = value;
                            next[currentIndex] = current;
                            return next;
                          });
                        }}
                        placeholder="Ответ 19"
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                        disabled={computedChecked}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">20.1</label>
                        <input
                          type="text"
                          value={answerValues[1] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[1] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 20.1"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">20.2</label>
                        <input
                          type="text"
                          value={answerValues[2] ?? ''}
                          onChange={(e) => {
                            if (computedChecked) return;
                            const value = e.target.value;
                            setUserAnswers((prev) => {
                              const next = { ...prev };
                              const current = Array.isArray(next[currentIndex])
                                ? [...next[currentIndex]]
                                : Array.from({ length: answerCount }, () => '');
                              current[2] = value;
                              next[currentIndex] = current;
                              return next;
                            });
                          }}
                          placeholder="Ответ 20.2"
                          className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                          disabled={computedChecked}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
                      <input
                        type="text"
                        value={answerValues[3] ?? ''}
                        onChange={(e) => {
                          if (computedChecked) return;
                          const value = e.target.value;
                          setUserAnswers((prev) => {
                            const next = { ...prev };
                            const current = Array.isArray(next[currentIndex])
                              ? [...next[currentIndex]]
                              : Array.from({ length: answerCount }, () => '');
                            current[3] = value;
                            next[currentIndex] = current;
                            return next;
                          });
                        }}
                        placeholder="Ответ 21"
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                        disabled={computedChecked}
                      />
                    </div>
                  </div>
                ) : answerCount === 20 ? (
                  <div className="grid grid-cols-[32px_1fr_1fr] gap-2">
                    {Array.from({ length: 10 }).map((_, rowIdx) => {
                      const leftIdx = rowIdx;
                      const rightIdx = rowIdx + 10;
                      return (
                        <React.Fragment key={rowIdx}>
                          <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                            {rowIdx + 1}
                          </div>
                          <input
                            type="text"
                            value={answerValues[leftIdx] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                current[leftIdx] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 1"
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                          <input
                            type="text"
                            value={answerValues[rightIdx] ?? ''}
                            onChange={(e) => {
                              if (computedChecked) return;
                              const value = e.target.value;
                              setUserAnswers((prev) => {
                                const next = { ...prev };
                                const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                                current[rightIdx] = value;
                                next[currentIndex] = current;
                                return next;
                              });
                            }}
                            placeholder="Ответ 2"
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                            disabled={computedChecked}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Array.from({ length: answerCount }).map((_, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={answerValues[idx] ?? ''}
                        onChange={(e) => {
                          if (computedChecked) return;
                          const value = e.target.value;
                          setUserAnswers((prev) => {
                            const next = { ...prev };
                            const current = Array.isArray(next[currentIndex]) ? [...next[currentIndex]] : Array.from({ length: answerCount }, () => '');
                            current[idx] = value;
                            next[currentIndex] = current;
                            return next;
                          });
                        }}
                        placeholder={`Ответ ${idx + 1}`}
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                        disabled={computedChecked}
                      />
                    ))}
                  </div>
                )
              ) : (
                <input
                  type="text"
                  value={answerValue}
                  onChange={(e) => {
                    if (computedChecked) return;
                    setUserAnswers({ ...userAnswers, [currentIndex]: e.target.value });
                  }}
                  placeholder="Введите ответ..."
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                  disabled={computedChecked}
                />
              )}
            {computedChecked && (
              <div className={`text-sm ${computedCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {computedCorrect ? 'Верно!' : 'Неверно'}
              </div>
            )}
            </div>
          </div>

          <Button 
            onClick={() => {
              if (!computedChecked) {
                handleCheck();
                return;
              }
              if (!computedCorrect) {
                setResults((prev) => {
                  const next = { ...prev };
                  delete next[currentIndex];
                  return next;
                });
                return;
              }
              handleNext();
            }} 
            disabled={!computedChecked && !isAnswerReady} 
            className="w-full"
            variant={computedChecked ? (computedCorrect ? 'success' : 'danger') : 'primary'}
          >
            {!computedChecked ? 'Проверить' : (
              currentIndex < questions.length - 1 
                ? (computedCorrect ? 'Верно! Следующий вопрос' : 'Попробовать снова')
                : 'Закрыть'
            )}
          </Button>
        </div>
        {expandedImage && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
              <img
                src={expandedImage.url}
                alt={expandedImage.name || 'Скриншот'}
                className="w-full h-full object-contain rounded-2xl shadow-2xl"
                style={{ maxHeight: '95vh' }}
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-3 right-3 p-2 rounded-full bg-white/90 hover:bg-white"
                type="button"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
  }
  
  return null;
};

/**
 * PAGE COMPONENTS (Updated Login & Progress)
 */

const LoginPage = ({ onLogin }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const user = await api.login(code.trim());
      onLogin(user);
    } catch (err) { setError(err?.message || err); } 
    finally { setLoading(false); }
  };

  return (
    <div className="app-min-h bg-gray-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><CheckCircle size={32} /></div>
          <h1 className="text-2xl font-bold text-gray-900">Иван на сотку</h1>
          <p className="text-gray-500 mt-2">Вход в платформу</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="password" value={code} onChange={e => setCode(e.target.value)} required placeholder="Код доступа" className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"/>
          {error && <div className="text-red-500 text-sm text-center">{error}</div>}
          <Button type="submit" className="w-full py-3" disabled={loading}>{loading ? 'Вход...' : 'Войти'}</Button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">Код доступа выдаёт учитель</p>
      </div>
    </div>
  );
};

const ProgressSection = ({
  progress,
  onUpdateProgress,
  role,
  studentId,
  students,
  tasks,
  onTaskTitleUpdate,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  initialSection,
  onSectionChange,
  onTaskStateChange,
  onStreakSaved
}) => {
  const taskList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [autoLevel, setAutoLevel] = useState(null);
  const [autoTargetQuestions, setAutoTargetQuestions] = useState(null);
  const [activeLevel, setActiveLevel] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [section, setSection] = useState(() => (
    ['progress', 'notes', 'mocks'].includes(initialSection) ? initialSection : 'progress'
  ));
  const [studentData, setStudentData] = useState({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [notesSavingId, setNotesSavingId] = useState(null);
  const [mockForm, setMockForm] = useState({ date: '', score: '', comment: '' });
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [savingTaskTitleId, setSavingTaskTitleId] = useState(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;

  const startEditTaskTitle = (task) => {
    if (!task) return;
    setEditingTaskId(task.number);
    setEditingTaskTitle(task.title || '');
  };

  const cancelEditTaskTitle = () => {
    setEditingTaskId(null);
    setEditingTaskTitle('');
  };

  const saveTaskTitle = async (task) => {
    if (!task) return;
    const title = editingTaskTitle.trim();
    setSavingTaskTitleId(task.number);
    try {
      await api.updateTaskTitle(task.number, title);
      onTaskTitleUpdate?.(task.number, title);
      cancelEditTaskTitle();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setSavingTaskTitleId(null);
    }
  };

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData({
          progress: data?.progress || {},
          notes: data?.notes || '',
          notesByTask: data?.notesByTask && typeof data.notesByTask === 'object' ? data.notesByTask : {},
          mocks: Array.isArray(data?.mocks) ? data.mocks : []
        });
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setActiveTask(null);
    setReviewTask(null);
    setAutoLevel(null);
    setAutoTargetQuestions(null);
    setActiveLevel(null);
    setActiveQuestionIndex(null);
    cancelEditTaskTitle();
  }, [section, effectiveStudentId]);

  useEffect(() => {
    onSectionChange?.(section);
  }, [section, onSectionChange]);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    if (openTask.section === 'python' || isPythonTaskNumber(openTask.taskNumber)) {
      onOpenTaskHandled?.();
      return;
    }
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setSection('progress');
    setActiveLevel(null);
    setActiveTask(target);
    setAutoLevel(openTask.levelId || null);
    setAutoTargetQuestions(Array.isArray(openTask.targetQuestions) ? openTask.targetQuestions : null);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: activeLevel || autoLevel || null,
      targetQuestions: autoTargetQuestions,
      section: 'progress',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null
    });
  }, [activeTask, activeLevel, autoLevel, autoTargetQuestions, activeQuestionIndex, role, onTaskStateChange, openTask]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMasteryRounded)
    ? totalMasteryRounded.toString()
    : '0';
  const getBallLabel = (value) => {
    if (!Number.isFinite(value)) return 'баллов';
    if (value % 1 !== 0) return 'балла';
    const abs = Math.abs(Math.round(value));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'баллов';
    const mod10 = abs % 10;
    if (mod10 === 1) return 'балл';
    if (mod10 >= 2 && mod10 <= 4) return 'балла';
    return 'баллов';
  };
  const getProgressHeadline = (value) => {
    if (!Number.isFinite(value)) return 'Хорошее начало';
    const score = Math.max(0, Math.min(100, Math.round(value)));
    const labels = [
      { min: 0, label: 'Хорошее начало' },
      { min: 5, label: 'Разогрев в пути' },
      { min: 10, label: 'Первые победы' },
      { min: 15, label: 'Набираем темп' },
      { min: 20, label: 'Уверенный старт' },
      { min: 25, label: 'Держим курс' },
      { min: 30, label: 'Ровный прогресс' },
      { min: 35, label: 'Ритм пойман' },
      { min: 40, label: 'Середина пути' },
      { min: 45, label: 'Хорошая динамика' },
      { min: 50, label: 'Экватор' },
      { min: 55, label: 'Сильная половина' },
      { min: 60, label: 'Уровень растёт' },
      { min: 65, label: 'Уже близко' },
      { min: 70, label: 'Уверенный результат' },
      { min: 75, label: 'Фокус на детали' },
      { min: 80, label: 'Очень близко' },
      { min: 85, label: 'Финишная подготовка' },
      { min: 90, label: 'Финишная прямая' },
      { min: 95, label: 'Почти 100' },
      { min: 100, label: 'Сотка!' }
    ];
    let current = labels[0].label;
    for (const entry of labels) {
      if (score >= entry.min) current = entry.label;
    }
    return current;
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const getNotesTaskKeys = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };

  const getMergedNote = (value) => {
    const keys = getNotesTaskKeys(value);
    if (!keys.length) return '';
    for (const key of keys) {
      const noteValue = studentData.notesByTask?.[key];
      if (typeof noteValue === 'string' && noteValue.trim()) return noteValue;
    }
    const fallback = studentData.notesByTask?.[keys[0]];
    return typeof fallback === 'string' ? fallback : '';
  };

  const saveTaskNote = async (taskNumber, note) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const nextNotes = { ...(studentData.notesByTask || {}) };
    const keys = getNotesTaskKeys(taskNumber);
    if (keys.length === 0) return;
    if (note) {
      keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
      nextNotes[keys[0]] = note;
    } else {
      keys.forEach((key) => delete nextNotes[key]);
    }
    setNotesSavingId(taskNumber);
    try {
      const res = await api.updateStudentNotes(effectiveStudentId, { notesByTask: nextNotes });
      setStudentData((prev) => ({ ...prev, notesByTask: res?.notesByTask || nextNotes }));
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setNotesSavingId(null);
    }
  };

  const handleAddMock = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const scoreValue = Number(mockForm.score);
    if (!Number.isFinite(scoreValue)) {
      setDataError('Введите корректный балл');
      return;
    }
    try {
      const entry = await api.addMockExam(effectiveStudentId, {
        date: mockForm.date,
        score: scoreValue,
        comment: mockForm.comment,
      });
      setStudentData((prev) => ({ ...prev, mocks: [entry, ...(prev.mocks || [])] }));
      setMockForm({ date: '', score: '', comment: '' });
      setDataError('');
    } catch (err) {
      alert(err?.message || err);
    }
  };

  const handleDeleteMock = async (id) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    if (!confirm('Удалить пробник?')) return;
    try {
      await api.deleteMockExam(effectiveStudentId, id);
      setStudentData((prev) => ({ ...prev, mocks: (prev.mocks || []).filter((m) => m.id !== id) }));
    } catch (err) {
      alert(err?.message || err);
    }
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Успеваемость</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы посмотреть его прогресс.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-tour="progress">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{'\u0423\u0441\u043f\u0435\u0432\u0430\u0435\u043c\u043e\u0441\u0442\u044c'}</h2>
          <p className="text-gray-500">{'\u0422\u0440\u0438 \u0440\u0430\u0437\u0434\u0435\u043b\u0430 \u0434\u043b\u044f \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u044f \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441\u0430 \u0438 \u043e\u0431\u0440\u0430\u0442\u043d\u043e\u0439 \u0441\u0432\u044f\u0437\u0438'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {renderStudentPicker()}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-purple-50 p-5 shadow-md">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-full w-32 bg-gradient-to-r from-transparent via-white/70 to-transparent blur-xl" />
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-purple-600 text-white">
                {getProgressHeadline(totalMasteryRounded)}
              </div>
              <span className="text-sm text-gray-500">{'\u041e\u0431\u0449\u0438\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u0415\u0413\u042d'}</span>
            </div>
            <div className="text-3xl font-extrabold text-purple-700 drop-shadow-sm">
              {totalMasteryLabel} {getBallLabel(totalMasteryRounded)}
            </div>
          </div>
          <div className="relative h-8 w-full rounded-full bg-white/80 border border-purple-100 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.55)] transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
            />
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-[shine_3s_linear_infinite]" />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Реши все задания, чтобы сдать ЕГЭ на 100 баллов</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'progress', label: 'Тестирования' },
          { id: 'notes', label: 'Заметки учителя' },
          { id: 'mocks', label: 'Пробники' }
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setSection(item.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              section === item.id
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {dataError && <div className="text-xs text-red-500">{dataError}</div>}
      {testsDbError && <div className="text-xs text-red-500">{testsDbError}</div>}

      {section === 'progress' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {taskList.map((task) => {
              const val = progressMap[task.id] || 0;
              const clickable = role === 'student' || role === 'teacher';
              return (
                <Card
                  key={task.id}
                  className={`group relative ${clickable ? 'cursor-pointer' : ''}`}
                  onClick={
                    clickable
                      ? () => {
                          if (role === 'teacher') setReviewTask(task);
                          else {
                            setActiveLevel(null);
                            setActiveQuestionIndex(null);
                            setActiveTask(task);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="flex justify-between mb-2">
                    <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-bold">№{getTaskDisplayNumber(task)}</span>
                    <span className="font-bold text-gray-700">{val}%</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    {editingTaskId === task.number ? (
                      <input
                        type="text"
                        value={editingTaskTitle}
                        onChange={(e) => setEditingTaskTitle(e.target.value)}
                        onBlur={() => saveTaskTitle(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTaskTitle(task);
                          if (e.key === 'Escape') cancelEditTaskTitle();
                        }}
                        className="w-full px-2 py-1 rounded-lg bg-white border border-purple-200 focus:border-purple-500 outline-none text-sm font-semibold text-gray-800"
                        placeholder="Название темы"
                        autoFocus
                      />
                    ) : (
                      <h3 className="font-bold text-gray-800 truncate">{task.title}</h3>
                    )}
                    {role === 'teacher' && editingTaskId !== task.number && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); startEditTaskTitle(task); }}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200"
                        title="Переименовать тему"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {role === 'teacher' && editingTaskId === task.number && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); saveTaskTitle(task); }}
                        className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-50"
                        title="Сохранить"
                        disabled={savingTaskTitleId === task.number}
                      >
                        <Save size={14} />
                      </button>
                    )}
                  </div>
                  <ProgressBar value={val} />

                  {role === 'student' && clickable && (
                    <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                      <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                        <PlayCircle size={20} /> Решать
                      </div>
                    </div>
                  )}
                  {role === 'teacher' && (
                    <div className="mt-3 text-xs font-semibold text-purple-600">Смотреть ответы</div>
                  )}
                </Card>
              );
            })}
          </div>

          {role === 'student' && activeTask && (
        <StudentTestModal 
          task={activeTask} 
          onClose={() => {
            setActiveTask(null);
            setAutoLevel(null);
            setAutoTargetQuestions(null);
            setActiveLevel(null);
            setActiveQuestionIndex(null);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialLevel={autoLevel}
          targetQuestions={autoTargetQuestions}
          initialQuestionIndex={activeQuestionIndex}
          onLevelSelect={setActiveLevel}
          onQuestionChange={setActiveQuestionIndex}
          onStreakSaved={onStreakSaved}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
            // setActiveTask(null); // Убрали закрытие, чтобы можно было решать дальше
          }}
        />
      )}
          {role === 'teacher' && reviewTask && (
            <ProgressReviewModal
              task={reviewTask}
              onClose={() => setReviewTask(null)}
              studentId={effectiveStudentId}
              testDb={testsDb}
            />
          )}
        </>
      )}

      {section === 'notes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800">Заметки учителя</h3>
            <span className="text-xs text-gray-400">Комментируйте задания кратко</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {taskList.map((task) => {
              const num = task.number;
              const note = getMergedNote(num);
              const hasNote = Boolean(note && note.trim());
              return (
                <div
                  key={task.id ?? num}
                  className={`rounded-3xl border p-4 flex flex-col gap-3 transition-all duration-200 shadow-sm hover:shadow-md ${
                    hasNote
                      ? 'border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-emerald-50'
                      : 'border-gray-200 bg-gradient-to-br from-white via-gray-50 to-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold ${
                          hasNote ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-white text-gray-500 border border-gray-200'
                        }`}
                      >
                        {getTaskDisplayNumber(task)}
                      </div>
                      <span className={`text-xs font-semibold ${hasNote ? 'text-emerald-700' : 'text-gray-400'}`}>
                        {hasNote ? 'Есть заметка' : 'Пусто'}
                      </span>
                    </div>
                    {notesSavingId === num && (
                      <span className="text-[10px] text-gray-400">Сохранение…</span>
                    )}
                  </div>
                  {role === 'teacher' ? (
                    <textarea
                      value={note}
                      onChange={(e) => {
                        const value = e.target.value.slice(0, 80);
                        const keys = getNotesTaskKeys(num);
                        if (!keys.length) return;
                        setStudentData((prev) => ({
                          ...prev,
                          notesByTask: (() => {
                            const nextNotes = { ...(prev.notesByTask || {}) };
                            keys.forEach((key) => { if (key !== keys[0]) delete nextNotes[key]; });
                            nextNotes[keys[0]] = value;
                            return nextNotes;
                          })()
                        }));
                      }}
                      onBlur={(e) => saveTaskNote(num, e.target.value.trim())}
                      placeholder="Комментарий..."
                      className={`w-full min-h-[70px] text-xs px-3 py-2 rounded-2xl border outline-none resize-none transition-colors ${
                        hasNote
                          ? 'bg-white/80 border-emerald-200 focus:border-emerald-500'
                          : 'bg-white border-gray-200 focus:border-purple-500'
                      }`}
                    />
                  ) : (
                    <div className={`text-xs min-h-[70px] whitespace-pre-wrap ${hasNote ? 'text-gray-700' : 'text-gray-400'}`}>
                      {hasNote ? note : 'Нет заметки'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {section === 'mocks' && (
        <div className="space-y-4">
          {role === 'teacher' && (
            <Card className="space-y-3">
              <h3 className="text-lg font-bold text-gray-800">Добавить пробник</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="date"
                  value={mockForm.date}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, date: e.target.value }))}
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={mockForm.score}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, score: e.target.value }))}
                  placeholder="Баллы (0-100)"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
                <input
                  type="text"
                  value={mockForm.comment}
                  onChange={(e) => setMockForm((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Комментарий"
                  className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                />
              </div>
              <Button onClick={handleAddMock}>
                <Plus size={16}/> Добавить
              </Button>
            </Card>
          )}

          <div className="space-y-2">
            {(studentData.mocks || []).length === 0 ? (
              <div className="text-gray-500">Пробников пока нет.</div>
            ) : (
              studentData.mocks.map((mock) => (
                <div key={mock.id} className="bg-white rounded-xl border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">Пробник от {mock.date}</p>
                    <p className="text-sm text-gray-500">Баллы: <span className="font-bold text-purple-600">{mock.score}</span></p>
                    {mock.comment && <p className="text-sm text-gray-600 mt-1">{mock.comment}</p>}
                  </div>
                  {role === 'teacher' && (
                    <button
                      onClick={() => handleDeleteMock(mock.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const PythonSection = ({
  progress,
  onUpdateProgress,
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  openTask,
  onOpenTaskHandled,
  onTaskStateChange,
  onStreakSaved
}) => {
  const taskList = PYTHON_TASKS;
  const [activeTask, setActiveTask] = useState(null);
  const [reviewTask, setReviewTask] = useState(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [studentData, setStudentData] = useState({ progress: {} });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [manageTaskNumber, setManageTaskNumber] = useState(taskList[0]?.number || '');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPrompt, setNewTaskPrompt] = useState('');
  const [newStarterCode, setNewStarterCode] = useState('');
  const [newTests, setNewTests] = useState([{ input: '', output: '' }]);
  const [testsFileName, setTestsFileName] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [theoryType, setTheoryType] = useState('text');
  const [theoryText, setTheoryText] = useState('');
  const [theoryUrl, setTheoryUrl] = useState('');
  const [theorySaving, setTheorySaving] = useState(false);
  const [theoryError, setTheoryError] = useState('');
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;

  useEffect(() => {
    if (!effectiveStudentId) {
      setStudentData({ progress: {} });
      return;
    }
    let cancelled = false;
    api.getStudentData(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setStudentData({ progress: data?.progress || {} });
        setDataError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    setReviewTask(null);
    setActiveTask(null);
    setActiveQuestionIndex(null);
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (role !== 'student' || !openTask) return;
    if (!isPythonTaskNumber(openTask.taskNumber)) {
      onOpenTaskHandled?.();
      return;
    }
    const target = taskList.find((task) => Number(task.number) === Number(openTask.taskNumber));
    if (!target) {
      onOpenTaskHandled?.();
      return;
    }
    setActiveTask(target);
    if (Number.isFinite(openTask.questionIndex)) {
      setActiveQuestionIndex(openTask.questionIndex);
    } else {
      setActiveQuestionIndex(null);
    }
    onOpenTaskHandled?.();
  }, [openTask, role, taskList, onOpenTaskHandled]);

  useEffect(() => {
    if (role !== 'student') return;
    if (!activeTask) {
      if (openTask) return;
      onTaskStateChange?.(null);
      return;
    }
    onTaskStateChange?.({
      taskNumber: activeTask.number,
      levelId: PYTHON_LEVEL_ID,
      targetQuestions: null,
      section: 'python',
      questionIndex: Number.isFinite(activeQuestionIndex) ? activeQuestionIndex : null
    });
  }, [activeTask, activeQuestionIndex, role, onTaskStateChange, openTask]);

  useEffect(() => {
    if (!taskList.length) return;
    if (!taskList.some((task) => task.number === manageTaskNumber)) {
      setManageTaskNumber(taskList[0].number);
    }
    setEditingQuestionId(null);
    setReviewTask(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setQuestionError('');
    setTheoryError('');
  }, [taskList, manageTaskNumber]);

  useEffect(() => {
    if (!manageTaskNumber) return;
    const theory = testsDb?.[manageTaskNumber]?.pythonTheory || {};
    const type = theory?.type === 'gdoc' ? 'gdoc' : 'text';
    setTheoryType(type);
    setTheoryText(type === 'text' ? String(theory?.content || '') : '');
    setTheoryUrl(type === 'gdoc' ? String(theory?.content || '') : '');
    setTheoryError('');
  }, [testsDb, manageTaskNumber]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const manageQuestions = manageTaskNumber
    ? (testsDb?.[manageTaskNumber]?.[PYTHON_LEVEL_ID] || [])
    : [];

  const handleSavePythonTask = async () => {
    if (role !== 'teacher') return;
    const question = newTaskPrompt.trim();
    const title = newTaskTitle.trim();
    const starterCode = newStarterCode.trim();
    if (!manageTaskNumber) return;
    const preparedTests = newTests
      .map((test) => ({
        input: String(test?.input ?? '').trimEnd(),
        output: String(test?.output ?? '').trimEnd(),
      }))
      .filter((test) => test.input || test.output);
    if (!question) {
      setQuestionError('Введите условие задачи.');
      return;
    }
    if (preparedTests.length === 0 || preparedTests.some((test) => !test.output)) {
      setQuestionError('Добавьте хотя бы один тест и заполните ожидаемый вывод.');
      return;
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    if (!Array.isArray(updatedDb[manageTaskNumber][PYTHON_LEVEL_ID])) {
      updatedDb[manageTaskNumber][PYTHON_LEVEL_ID] = [];
    }
    const list = updatedDb[manageTaskNumber][PYTHON_LEVEL_ID];
    if (editingQuestionId) {
      const idx = list.findIndex((item) => item.id === editingQuestionId);
      if (idx === -1) {
        setQuestionError('Не удалось найти задачу для редактирования.');
        return;
      }
      list[idx] = {
        ...list[idx],
        title,
        question,
        starterCode,
        tests: preparedTests
      };
    } else {
      list.push({
        id: Date.now(),
        title,
        question,
        starterCode,
        tests: preparedTests
      });
    }
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setNewTaskTitle('');
      setNewTaskPrompt('');
      setNewStarterCode('');
      setNewTests([{ input: '', output: '' }]);
      setQuestionError('');
      setEditingQuestionId(null);
      setTestsFileName('');
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const startEditPythonTask = (task) => {
    if (!task) return;
    setEditingQuestionId(task.id);
    setNewTaskTitle(task.title || '');
    setNewTaskPrompt(task.question || '');
    setNewStarterCode(task.starterCode || '');
    if (Array.isArray(task.tests) && task.tests.length > 0) {
      setNewTests(task.tests.map((test) => ({
        input: String(test?.input ?? ''),
        output: String(test?.output ?? '')
      })));
    } else if (task.answer) {
      setNewTests([{ input: '', output: String(task.answer) }]);
    } else {
      setNewTests([{ input: '', output: '' }]);
    }
    setQuestionError('');
    setTestsFileName('');
  };

  const cancelEditPythonTask = () => {
    setEditingQuestionId(null);
    setNewTaskTitle('');
    setNewTaskPrompt('');
    setNewStarterCode('');
    setNewTests([{ input: '', output: '' }]);
    setTestsFileName('');
    setQuestionError('');
  };

  const handleTestsFileUpload = (file) => {
    if (!file) return;
    setQuestionError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseTestsFileContent(reader.result);
        if (!parsed.length || parsed.some((test) => !test.output)) {
          setQuestionError('Неверный формат тестов: проверьте наличие ожидаемого вывода.');
          return;
        }
        setNewTests(parsed);
        setTestsFileName(file.name);
      } catch (err) {
        setQuestionError(err?.message || 'Не удалось прочитать файл с тестами.');
      }
    };
    reader.onerror = () => {
      setQuestionError('Не удалось прочитать файл с тестами.');
    };
    reader.readAsText(file);
  };

  const handleSavePythonTheory = async () => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const raw = theoryType === 'gdoc' ? theoryUrl.trim() : theoryText.trim();
    if (!raw) {
      setTheoryError('Добавьте текст теории или ссылку на Google Docs.');
      return;
    }
    let content = raw;
    if (theoryType === 'gdoc') {
      const embedUrl = buildGoogleDocEmbedUrl(raw);
      if (!embedUrl) {
        setTheoryError('Нужна ссылка на Google Docs (поддерживаются ссылки на документ или iframe).');
        return;
      }
      content = embedUrl;
      setTheoryUrl(embedUrl);
    }
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    updatedDb[manageTaskNumber] = {
      ...(updatedDb[manageTaskNumber] || {}),
      pythonTheory: { type: theoryType, content }
    };
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setTheoryError('');
    } catch (err) {
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleClearPythonTheory = async () => {
    if (role !== 'teacher') return;
    if (!manageTaskNumber) return;
    const updatedDb = { ...(testsDb || {}) };
    if (!updatedDb[manageTaskNumber]) updatedDb[manageTaskNumber] = {};
    const { pythonTheory, ...rest } = updatedDb[manageTaskNumber] || {};
    updatedDb[manageTaskNumber] = { ...rest };
    setTheorySaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setTheoryText('');
      setTheoryUrl('');
      setTheoryError('');
    } catch (err) {
      setTheoryError(err?.message || err);
    } finally {
      setTheorySaving(false);
    }
  };

  const handleDeletePythonQuestion = async (taskNumber, questionId) => {
    if (role !== 'teacher') return;
    if (!confirm('Удалить эту задачу?')) return;
    const updatedDb = { ...(testsDb || {}) };
    const list = Array.isArray(updatedDb?.[taskNumber]?.[PYTHON_LEVEL_ID])
      ? updatedDb[taskNumber][PYTHON_LEVEL_ID]
      : [];
    updatedDb[taskNumber] = {
      ...(updatedDb[taskNumber] || {}),
      [PYTHON_LEVEL_ID]: list.filter((q) => q.id !== questionId)
    };
    setQuestionSaving(true);
    setTestsDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionError(err?.message || err);
    } finally {
      setQuestionSaving(false);
    }
  };

  const totalMastery = (() => {
    if (!taskList.length) return 0;
    const total = taskList.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / taskList.length) * 10) / 10;
  })();
  const totalMasteryLabel = Number.isFinite(totalMastery) && totalMastery % 1 !== 0
    ? totalMastery.toFixed(1)
    : Math.round(totalMastery).toString();

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Изучение Python</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Изучение Python</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы посмотреть его прогресс.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Изучение Python</h2>
          <p className="text-gray-500">Тестирования по темам курса и общий прогресс</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {renderStudentPicker()}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-purple-50 p-5 shadow-md">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute -left-10 top-0 h-full w-32 bg-gradient-to-r from-transparent via-white/70 to-transparent blur-xl" />
        </div>
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest bg-purple-600 text-white">
                Прогресс Python
              </div>
              <span className="text-sm text-gray-500">Общий прогресс изучения</span>
            </div>
            <div className="text-3xl font-extrabold text-purple-700 drop-shadow-sm">
              {totalMasteryLabel}%
            </div>
          </div>
          <div className="relative h-8 w-full rounded-full bg-white/80 border border-purple-100 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.55)] transition-[width] duration-700 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
            />
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-[shine_3s_linear_infinite]" />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Проходите темы последовательно</span>
            <span>0% — старт • 100% — уверенно</span>
          </div>
        </div>
      </div>

      {dataError && <div className="text-xs text-red-500">{dataError}</div>}
      {testsDbError && <div className="text-xs text-red-500">{testsDbError}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {taskList.map((task) => {
          const val = progressMap[task.id] || 0;
          const clickable = role === 'student' || role === 'teacher';
          return (
            <Card
              key={task.id}
              className="group relative"
              onClick={clickable ? () => {
                if (role === 'teacher') setReviewTask(task);
                else {
                  setActiveQuestionIndex(null);
                  setActiveTask(task);
                }
              } : undefined}
            >
              <div className="flex justify-between mb-2">
                <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-bold">№{getTaskDisplayNumber(task)}</span>
                <span className="font-bold text-gray-700">{val}%</span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-800 truncate">{task.title}</h3>
              </div>
              <ProgressBar value={val} />

              {clickable && (
                <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                    <PlayCircle size={20} /> {role === 'teacher' ? 'Решения' : 'Решать'}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {role === 'teacher' && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">
                {editingQuestionId ? 'Редактировать задачу' : 'Добавить задачу'}
              </h3>
              <p className="text-xs text-gray-500">Задачи для тестирования по теме</p>
            </div>
            <select
              value={manageTaskNumber || ''}
              onChange={(e) => setManageTaskNumber(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
            >
              {taskList.map((task) => (
                <option key={task.id} value={task.number}>
                  {getTaskDisplayNumber(task)} · {task.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Название задачи (необязательно)"
              className="md:col-span-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            <textarea
              value={newTaskPrompt}
              onChange={(e) => setNewTaskPrompt(e.target.value)}
              placeholder="Условие задачи"
              className="md:col-span-2 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none min-h-[80px]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Стартовый код</label>
            <textarea
              value={newStarterCode}
              onChange={(e) => setNewStarterCode(e.target.value)}
              placeholder="Например: print('Hello')"
              className="w-full px-4 py-2 rounded-xl bg-gray-900 text-gray-100 font-mono text-sm border border-gray-800 focus:border-purple-400 outline-none min-h-[120px]"
              spellCheck={false}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase">Тесты</span>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <label className="cursor-pointer text-purple-600 hover:text-purple-700">
                  Загрузить из файла
                  <input
                    type="file"
                    accept=".json,.txt"
                    className="hidden"
                    onChange={(e) => handleTestsFileUpload(e.target.files?.[0])}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setNewTests((prev) => [...prev, { input: '', output: '' }])}
                  className="text-purple-600 hover:text-purple-700"
                >
                  Добавить тест
                </button>
              </div>
            </div>
            {testsFileName && (
              <div className="text-[11px] text-gray-400">Файл: {testsFileName}</div>
            )}
            <div className="space-y-2">
              {newTests.map((test, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <textarea
                    value={test.input}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, input: value } : item)));
                    }}
                    placeholder="Входные данные"
                    className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none min-h-[60px]"
                  />
                  <div className="relative">
                    <textarea
                      value={test.output}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, output: value } : item)));
                      }}
                      placeholder="Ожидаемый вывод"
                      className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none min-h-[60px]"
                    />
                    {newTests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNewTests((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-600"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {questionError && <span className="text-xs text-red-500">{questionError}</span>}
            <div className="flex items-center gap-2">
              {editingQuestionId && (
                <Button variant="secondary" onClick={cancelEditPythonTask} disabled={questionSaving}>
                  Отменить
                </Button>
              )}
              <Button onClick={handleSavePythonTask} disabled={questionSaving}>
                {questionSaving ? 'Сохранение...' : (editingQuestionId ? 'Сохранить' : 'Добавить задачу')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {manageQuestions.length === 0 ? (
              <div className="text-sm text-gray-500">Пока нет задач для выбранной темы.</div>
            ) : (
              manageQuestions.map((q, idx) => (
                <div key={q.id || idx} className="p-3 rounded-xl border flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{q.title || q.question || `Задача ${idx + 1}`}</p>
                    <p className="text-xs text-gray-500 mt-1">Тестов: {Array.isArray(q.tests) ? q.tests.length : (q.answer ? 1 : 0)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEditPythonTask(q)}
                      className="p-2 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-50"
                      title="Редактировать"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePythonQuestion(manageTaskNumber, q.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-50"
                      title="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {role === 'teacher' && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-800">Теория темы</h3>
              <p className="text-xs text-gray-500">Текст или встраиваемый Google Docs</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'text', label: 'Текст' },
              { id: 'gdoc', label: 'Google Docs' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheoryType(item.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  theoryType === item.id
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {theoryType === 'text' ? (
            <textarea
              value={theoryText}
              onChange={(e) => setTheoryText(e.target.value)}
              placeholder="Вставьте текст теории..."
              className="w-full min-h-[160px] px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={theoryUrl}
                onChange={(e) => setTheoryUrl(e.target.value)}
                placeholder="Вставьте ссылку на документ или iframe Google Docs"
                className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
              />
              <p className="text-xs text-gray-400">
                Используйте ссылку для встраивания из Google Docs (Файл → Опубликовать в интернете → Встроить).
              </p>
              <p className="text-[11px] text-gray-400">
                Подойдут и обычные ссылки на документ (view/edit) — они встроятся через preview. Для оглавления используйте «Открыть полностью».
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {theoryError && <span className="text-xs text-red-500">{theoryError}</span>}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handleClearPythonTheory} disabled={theorySaving}>
                Очистить
              </Button>
              <Button onClick={handleSavePythonTheory} disabled={theorySaving}>
                {theorySaving ? 'Сохранение...' : 'Сохранить теорию'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {role === 'student' && activeTask && (
        <PythonTestModal
          task={activeTask}
          onClose={() => {
            setActiveTask(null);
            setActiveQuestionIndex(null);
          }}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          initialQuestionIndex={activeQuestionIndex}
          onQuestionChange={setActiveQuestionIndex}
          onStreakSaved={onStreakSaved}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
          }}
        />
      )}
      {role === 'teacher' && reviewTask && (
        <PythonReviewModal
          task={reviewTask}
          onClose={() => setReviewTask(null)}
          studentId={effectiveStudentId}
          testDb={testsDb}
        />
      )}
    </div>
  );
};

const ScheduleSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  onOpenTask,
  solvedRefreshKey,
  tasks
}) => {
  const DEFAULT_HOMEWORK = '🟢\n🟢\n🟢';
  const DEFAULT_GOAL = { taskNumber: '', levelId: 'basic', targetInput: '', includeAll: false };
  const [homeworks, setHomeworks] = useState([]);
  const [nextLesson, setNextLesson] = useState({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
  const [form, setForm] = useState({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [solvedByKey, setSolvedByKey] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const taskOptions = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const pythonTaskOptions = PYTHON_TASKS;

  const buildNextLessonData = (latest, fallback = {}) => ({
    homeWork: latest?.homeWork || '',
    lessonLink: latest?.lessonLink || '',
    boardLink: latest?.boardLink || '',
    daysToComplete: Number(latest?.daysToComplete) || fallback.daysToComplete || 7,
    issuedAt: latest?.issuedAt || '',
    taskNumber: latest?.taskNumber ?? null,
    levelId: latest?.levelId ?? null,
    targetQuestions: Array.isArray(latest?.targetQuestions) ? latest.targetQuestions : [],
    goals: Array.isArray(latest?.goals) ? latest.goals : [],
  });

  const loadNextLesson = async () => {
    if (!effectiveStudentId) {
      setHomeworks([]);
      setNextLesson({ homeWork: '', lessonLink: '', boardLink: '', daysToComplete: 7, issuedAt: '', taskNumber: null, levelId: null, targetQuestions: [], goals: [] });
      setForm({ homeWork: DEFAULT_HOMEWORK, lessonLink: '', boardLink: '', daysToComplete: 7, goals: [{ ...DEFAULT_GOAL }] });
      setEditingId(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStudentNextLesson(effectiveStudentId);
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const latest = data?.latest && typeof data.latest === 'object' ? data.latest : {};
      const safeData = buildNextLessonData(latest);
      setHomeworks(list);
      setNextLesson(safeData);
      setEditingId(null);
      if (role === 'teacher') {
        setForm({
          homeWork: DEFAULT_HOMEWORK,
          lessonLink: safeData.lessonLink || '',
          boardLink: safeData.boardLink || '',
          daysToComplete: safeData.daysToComplete || 7,
          goals: [{ ...DEFAULT_GOAL }]
        });
      }
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNextLesson();
  }, [effectiveStudentId]);

  useEffect(() => {
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setTestsDb(data && typeof data === 'object' ? data : {});
        setTestsDbError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTestsDb({});
        setTestsDbError(err?.message || err);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      setSolvedByKey({});
      return;
    }
    const entries = Array.isArray(homeworks)
      ? homeworks.flatMap((entry) => {
          const goals = normalizeEntryGoals(entry);
          return goals.map((goal) => ({
            taskNumber: goal.taskNumber,
            levelId: goal.levelId
          }));
        })
      : [];
    const unique = [];
    const seen = new Set();
    entries.forEach((entry) => {
      const key = `${entry.taskNumber}|${entry.levelId}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ key, taskNumber: entry.taskNumber, levelId: entry.levelId });
    });
    if (unique.length === 0) {
      setSolvedByKey({});
      return;
    }
    let cancelled = false;
    const loadSolved = async () => {
      try {
        const results = await Promise.all(
          unique.map((item) =>
            api.getSolvedQuestions(effectiveStudentId, item.taskNumber, item.levelId).catch(() => [])
          )
        );
        if (cancelled) return;
        const next = {};
        unique.forEach((item, idx) => {
          const list = Array.isArray(results[idx]) ? results[idx] : [];
          next[item.key] = new Set(list.map((val) => String(val)));
        });
        setSolvedByKey(next);
      } catch (err) {
        if (!cancelled) setSolvedByKey({});
      }
    };
    loadSolved();
    return () => { cancelled = true; };
  }, [effectiveStudentId, homeworks, solvedRefreshKey]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const normalizeUrl = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return '';
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  };

  const parseTargetInput = (input, maxCount) => {
    const parts = String(input || '').split(/[\s,;]+/).filter(Boolean);
    const numbers = parts
      .map((val) => Number(val))
      .filter((val) => Number.isFinite(val) && val > 0)
      .map((val) => Math.trunc(val));
    const unique = Array.from(new Set(numbers));
    if (Number.isFinite(maxCount) && maxCount > 0) {
      return unique.filter((val) => val <= maxCount);
    }
    return unique;
  };

  const formatTargetInput = (targets) => {
    if (!Array.isArray(targets)) return '';
    const values = Array.from(new Set(
      targets
        .map((val) => Number(val))
        .filter((val) => Number.isFinite(val) && val > 0)
        .map((val) => Math.trunc(val))
    ));
    return values.join(', ');
  };

  const getQuestionsCount = (taskNumber, levelId) => {
    if (!testsDb || !taskNumber) return null;
    const effectiveLevelId = isPythonTaskNumber(taskNumber) ? PYTHON_LEVEL_ID : levelId;
    if (!effectiveLevelId) return null;
    const list = testsDb?.[String(taskNumber)]?.[effectiveLevelId];
    return Array.isArray(list) ? list.length : null;
  };

  const normalizeEntryGoals = (entry) => {
    if (!entry) return [];
    if (Array.isArray(entry.goals) && entry.goals.length > 0) {
      return entry.goals
        .map((goal) => {
          const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
          const taskNumberValue = Number.isFinite(normalizedTaskNumber)
            ? String(normalizedTaskNumber)
            : '';
          const isPythonGoal = Number.isFinite(normalizedTaskNumber)
            ? isPythonTaskNumber(normalizedTaskNumber)
            : false;
          return {
            taskNumber: taskNumberValue,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
            targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
            includeAll: Boolean(goal?.includeAll)
          };
        })
        .filter((goal) => goal.taskNumber);
    }
    if (entry.taskNumber && entry.levelId) {
      const entryTaskNumber = Number(entry.taskNumber);
      return [{
        taskNumber: Number.isFinite(normalizeTaskNumber(entry.taskNumber))
          ? String(normalizeTaskNumber(entry.taskNumber))
          : String(entry.taskNumber),
        levelId: isPythonTaskNumber(entryTaskNumber) ? PYTHON_LEVEL_ID : entry.levelId,
        targetQuestions: Array.isArray(entry.targetQuestions) ? entry.targetQuestions : [],
        includeAll: Boolean(entry.includeAll)
      }];
    }
    return [];
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
  };

  const formatDaysText = (days) => {
    const value = Number(days) || 0;
    if (value === 7) return 'неделя';
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} дня`;
    return `${value} дней`;
  };

  const sortedHomeworks = useMemo(() => {
    const list = Array.isArray(homeworks) ? [...homeworks] : [];
    return list.sort((a, b) => new Date(b?.issuedAt || 0) - new Date(a?.issuedAt || 0));
  }, [homeworks]);

  const resetFormToDefault = (base = null) => {
    const source = base || nextLesson || {};
    setForm({
      homeWork: DEFAULT_HOMEWORK,
      lessonLink: source?.lessonLink || '',
      boardLink: source?.boardLink || '',
      daysToComplete: source?.daysToComplete || 7,
      goals: [{ ...DEFAULT_GOAL }]
    });
    setEditingId(null);
  };

  const startEditHomework = (entry) => {
    if (!entry) return;
    const goals = normalizeEntryGoals(entry);
    setEditingId(entry.id || null);
    setForm({
      homeWork: entry.homeWork || '',
      lessonLink: entry.lessonLink || '',
      boardLink: entry.boardLink || '',
      daysToComplete: Number(entry.daysToComplete) || 7,
      goals: goals.length
        ? goals.map((goal) => ({
            taskNumber: goal.taskNumber,
            levelId: goal.levelId || 'basic',
            includeAll: goal.includeAll,
            targetInput: goal.includeAll ? '' : formatTargetInput(goal.targetQuestions)
          }))
        : [{ ...DEFAULT_GOAL }]
    });
  };

  const updateGoal = (index, patch) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? [...prev.goals] : [];
      if (!goals[index]) return prev;
      goals[index] = { ...goals[index], ...patch };
      return { ...prev, goals };
    });
  };

  const addGoalRow = () => {
    setForm((prev) => ({
      ...prev,
      goals: [...(Array.isArray(prev.goals) ? prev.goals : []), { ...DEFAULT_GOAL }]
    }));
  };

  const removeGoalRow = (index) => {
    setForm((prev) => {
      const goals = Array.isArray(prev.goals) ? prev.goals.filter((_, i) => i !== index) : [];
      return { ...prev, goals: goals.length ? goals : [{ ...DEFAULT_GOAL }] };
    });
  };

  const handleSave = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    setSaving(true);
    try {
      const goalsPayload = (Array.isArray(form.goals) ? form.goals : [])
        .map((goal) => {
          const taskNumber = String(goal?.taskNumber || '').trim();
          if (!taskNumber) return null;
          const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
          if (!Number.isFinite(normalizedTaskNumber)) return null;
          const levelId = isPythonTaskNumber(normalizedTaskNumber)
            ? PYTHON_LEVEL_ID
            : (goal?.levelId || 'basic');
          const includeAll = Boolean(goal?.includeAll);
          const availableCount = getQuestionsCount(normalizedTaskNumber, levelId);
          const targetQuestions = includeAll ? [] : parseTargetInput(goal?.targetInput, availableCount);
          return {
            taskNumber: normalizedTaskNumber,
            levelId,
            includeAll,
            targetQuestions
          };
        })
        .filter(Boolean);
      const payload = {
        homeWork: form.homeWork,
        lessonLink: form.lessonLink,
        boardLink: form.boardLink,
        daysToComplete: form.daysToComplete,
        goals: goalsPayload
      };
      const updated = editingId
        ? await api.updateStudentHomework(effectiveStudentId, editingId, payload)
        : await api.updateStudentNextLesson(effectiveStudentId, payload);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHomework = async (entry) => {
    if (role !== 'teacher' || !effectiveStudentId || !entry?.id) return;
    if (!window.confirm('Удалить домашку?')) return;
    setDeletingId(entry.id);
    try {
      const updated = await api.deleteStudentHomework(effectiveStudentId, entry.id);
      const list = Array.isArray(updated?.homeworks) ? updated.homeworks : [];
      const latest = updated?.latest && typeof updated.latest === 'object' ? updated.latest : {};
      const safeData = buildNextLessonData(latest, form);
      setHomeworks(list);
      setNextLesson(safeData);
      if (editingId === entry.id) resetFormToDefault(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setDeletingId(null);
    }
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Моё расписание</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы открыть его расписание.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" data-tour="schedule">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Моё расписание</h2>
          <p className="text-gray-500">Домашка и ссылки к следующему занятию</p>
        </div>
        {renderStudentPicker()}
      </div>

      {error && <div className="text-xs text-red-500">{error}</div>}
      {testsDbError && <div className="text-xs text-red-500">{testsDbError}</div>}

      {role === 'teacher' && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-gray-800">
              {editingId ? 'Редактировать домашку' : 'Обновить данные'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={() => resetFormToDefault()}
                className="px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Отменить
              </button>
            )}
          </div>
          <textarea
            value={form.homeWork}
            onChange={(e) => setForm((prev) => ({ ...prev, homeWork: e.target.value }))}
            placeholder="Домашка на следующий урок"
            className="w-full min-h-[120px] px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none resize-none"
          />
          <div className="space-y-3">
            {(Array.isArray(form.goals) ? form.goals : []).map((goal, index) => {
              const hasTask = Boolean(goal?.taskNumber);
              const normalizedGoalTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const isPythonGoal = isPythonTaskNumber(normalizedGoalTaskNumber);
              const effectiveLevelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
              const taskNumberValue = Number.isFinite(normalizedGoalTaskNumber)
                ? normalizedGoalTaskNumber
                : goal?.taskNumber;
              const availableCount = hasTask ? getQuestionsCount(taskNumberValue, effectiveLevelId) : null;
              return (
                <div key={`${index}-${goal?.taskNumber || 'goal'}`} className="rounded-2xl border border-gray-200 bg-white p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={goal.taskNumber || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        const valueNum = value ? Number(value) : null;
                        const nextIsPython = valueNum ? isPythonTaskNumber(valueNum) : false;
                        updateGoal(index, {
                          taskNumber: value,
                          levelId: nextIsPython ? PYTHON_LEVEL_ID : (goal.levelId || 'basic'),
                          includeAll: value ? goal.includeAll : false,
                          targetInput: value ? goal.targetInput : ''
                        });
                      }}
                      className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
                    >
                      <option value="">Выберите задание</option>
                      <optgroup label="ЕГЭ">
                        {taskOptions.map((task) => (
                          <option key={task.id ?? task.number} value={task.number}>
                            Задание {getTaskDisplayNumber(task)}: {task.title}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Python">
                        {pythonTaskOptions.map((task) => (
                          <option key={task.id ?? task.number} value={task.number}>
                            {task.displayNumber} · {task.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      value={isPythonGoal ? PYTHON_LEVEL_ID : (goal.levelId || 'basic')}
                      onChange={(e) => updateGoal(index, { levelId: e.target.value })}
                      disabled={!hasTask || isPythonGoal}
                      className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none disabled:opacity-60"
                    >
                      {isPythonGoal ? (
                        <option value={PYTHON_LEVEL_ID}>Python</option>
                      ) : (
                        Object.values(LEVELS).map((lvl) => (
                          <option key={lvl.id} value={lvl.id}>{lvl.label}</option>
                        ))
                      )}
                    </select>
                    <div className="flex items-center justify-between gap-3">
                      <label className={`flex items-center gap-2 text-xs font-semibold ${hasTask ? 'text-gray-600' : 'text-gray-400'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(goal.includeAll)}
                          disabled={!hasTask}
                          onChange={(e) => updateGoal(index, { includeAll: e.target.checked, targetInput: e.target.checked ? '' : goal.targetInput })}
                        />
                        Все задания
                      </label>
                      {(Array.isArray(form.goals) ? form.goals.length : 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => removeGoalRow(index)}
                          className="px-2 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={goal.targetInput || ''}
                      onChange={(e) => updateGoal(index, { targetInput: e.target.value })}
                      placeholder="Номера вопросов (например: 1, 3, 5)"
                      disabled={!hasTask || goal.includeAll}
                      className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none disabled:opacity-60"
                    />
                    <div className="text-xs text-gray-400">
                      {goal.includeAll
                        ? 'Выбраны все задания этого уровня.'
                        : (availableCount
                            ? `Всего вопросов в уровне: ${availableCount}`
                            : 'Можно оставить пустым — тогда цель не задаётся.')}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              onClick={addGoalRow}
              className="px-3 py-2 rounded-xl border border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              + Добавить задание
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="number"
              min="1"
              value={form.daysToComplete}
              onChange={(e) => setForm((prev) => ({ ...prev, daysToComplete: e.target.value }))}
              placeholder="Дней на выполнение"
              className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.lessonLink}
              onChange={(e) => setForm((prev) => ({ ...prev, lessonLink: e.target.value }))}
              placeholder="Ссылка на следующее занятие"
              className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            <input
              type="url"
              value={form.boardLink}
              onChange={(e) => setForm((prev) => ({ ...prev, boardLink: e.target.value }))}
              placeholder="Ссылка на онлайн-доску"
              className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} /> {saving ? 'Сохранение...' : (editingId ? 'Сохранить изменения' : 'Добавить домашку')}
          </Button>
        </Card>
      )}

      <Card className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Следующее занятие</h3>
          <p className="text-xs text-gray-500">Домашка и ссылки доступны ученику</p>
        </div>

        {loading ? (
          <div className="text-gray-500">Загрузка...</div>
        ) : sortedHomeworks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-400">
            Комментариев учителя нет.
          </div>
        ) : (
          <div className="space-y-4">
            {sortedHomeworks.map((entry, idx) => {
              const dateText = formatDate(entry?.issuedAt);
              const daysText = formatDaysText(entry?.daysToComplete || 7);
              const isEditing = editingId && entry?.id === editingId;
              const entryGoals = normalizeEntryGoals(entry);
              return (
                <div key={entry.id || `${entry.issuedAt}-${idx}`} className={`rounded-2xl border p-4 space-y-3 ${isEditing ? 'border-purple-300 bg-purple-50/40' : 'border-gray-200 bg-white'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-xs text-gray-500">
                      {`Учитель выдал домашку ${dateText || 'сегодня'}. У тебя есть ${daysText} на выполнение.`}
                    </div>
                    {role === 'teacher' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEditHomework(entry)}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                        >
                          Редактировать
                        </button>
                        {entry.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteHomework(entry)}
                            disabled={deletingId === entry.id}
                            className="px-3 py-1 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {entryGoals.length > 0 && (
                    <div className="space-y-2">
                      {entryGoals.map((goal, goalIndex) => {
                        const taskNumber = Number(goal.taskNumber);
                        const isPythonGoal = isPythonTaskNumber(taskNumber);
                        const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumber) : null;
                        const taskDisplay = isPythonGoal
                          ? (pythonTask?.displayNumber || taskNumber)
                          : (formatTaskNumber(taskNumber) || taskNumber);
                        const levelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
                        const levelLabel = isPythonGoal
                          ? 'Python'
                          : (LEVELS[levelId?.toUpperCase()]?.label || levelId);
                        const questionsList = taskNumber && levelId
                          ? (testsDb?.[String(taskNumber)]?.[levelId] || [])
                          : [];
                        const totalCount = questionsList.length;
                        const targetNumbers = goal.includeAll
                          ? (totalCount > 0 ? Array.from({ length: totalCount }, (_, i) => i + 1) : [])
                          : Array.from(new Set(
                              (Array.isArray(goal.targetQuestions) ? goal.targetQuestions : [])
                                .map((val) => Number(val))
                                .filter((val) => Number.isFinite(val) && val > 0)
                            )).sort((a, b) => a - b);
                        const targetsKey = taskNumber && levelId ? `${taskNumber}|${levelId}` : null;
                        const solvedSet = targetsKey ? solvedByKey?.[targetsKey] : null;
                        const targetStatus = targetNumbers.map((num) => {
                          const question = questionsList[num - 1];
                          const qId = question?.id;
                          const solved = qId ? solvedSet?.has(String(qId)) : false;
                          return { num, solved };
                        });
                        const targetSolvedCount = targetStatus.filter((item) => item.solved).length;
                        const hasTargets = targetNumbers.length > 0 || goal.includeAll;
                        return (
                          <div key={`${taskNumber}-${levelId}-${goalIndex}`} className="rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-700 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span>
                                {`Задание ${taskDisplay} · ${levelLabel}`}
                              </span>
                              {onOpenTask && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTask(taskNumber, levelId, targetNumbers)}
                                  className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700"
                                >
                                  Перейти к заданию
                                </button>
                              )}
                            </div>
                            {hasTargets && (
                              <div className="space-y-2">
                                <div className="text-[11px] font-semibold text-purple-700">Цель — решить эти задания:</div>
                                {targetNumbers.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {targetStatus.map((item) => (
                                      <span
                                        key={item.num}
                                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold ${
                                          item.solved
                                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                                            : 'border-purple-200 bg-white text-purple-700'
                                        }`}
                                      >
                                        №{item.num}{item.solved ? ' ✓' : ''}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-purple-600">
                                    Все задания этого уровня
                                  </div>
                                )}
                                {targetNumbers.length > 0 && (
                                  <div className="text-[11px] text-purple-600">
                                    Выполнено {targetSolvedCount}/{targetStatus.length}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Домашка</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {entry?.homeWork ? entry.homeWork : 'Комментариев учителя нет.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {entry?.lessonLink ? (
                      <a
                        href={normalizeUrl(entry.lessonLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-semibold text-sm hover:border-purple-400"
                      >
                        Ссылка на занятие
                      </a>
                    ) : (
                      <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                        Ссылка на занятие не указана
                      </div>
                    )}
                    {entry?.boardLink ? (
                      <a
                        href={normalizeUrl(entry.boardLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-semibold text-sm hover:border-purple-400"
                      >
                        Онлайн-доска
                      </a>
                    ) : (
                      <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                        Ссылка на доску не указана
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

const NotesSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  initialLocation,
  onLocationChange
}) => {
  const [currentTask, setCurrentTask] = useState(null);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [folders, setFolders] = useState([]);
  const [foldersError, setFoldersError] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameBase, setRenameBase] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [expandedPyIds, setExpandedPyIds] = useState({});
  const [expandedPdfIds, setExpandedPdfIds] = useState({});
  const [pyContent, setPyContent] = useState({});
  const [pyError, setPyError] = useState({});
  const [pyLoadingId, setPyLoadingId] = useState(null);
  const [showPyCreator, setShowPyCreator] = useState(false);
  const [pyDraftName, setPyDraftName] = useState('');
  const [pyDraftCode, setPyDraftCode] = useState('');
  const [pyDraftError, setPyDraftError] = useState('');
  const [pyDraftSaving, setPyDraftSaving] = useState(false);
  const restoringRef = useRef(false);
  const didRestoreRef = useRef(false);
  const skipNullSaveRef = useRef(true);
  const pendingFolderIdRef = useRef(null);
  const fileRef = useRef(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const getFileUrl = (file) => withStudentId(file?.url, effectiveStudentId);

  const taskOptions = MOCK_TASKS;
  const normalizedCurrentTask = normalizeTaskNumber(currentTask);
  const getNotesTaskNumber = (value) => normalizeTaskNumber(value);
  const getNotesTaskNumbers = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };

  useEffect(() => {
    if (!effectiveStudentId) return;
    if (didRestoreRef.current) return;
    const studentKey = String(effectiveStudentId);
    const entry = initialLocation && typeof initialLocation === 'object' ? initialLocation : null;
    if (entry && entry.studentId && String(entry.studentId) !== studentKey) {
      didRestoreRef.current = true;
      return;
    }
    if (!entry) {
      didRestoreRef.current = true;
      return;
    }
    const normalizedTask = normalizeTaskNumber(entry.taskNumber);
    const nextTask = Number.isFinite(normalizedTask) ? normalizedTask : null;
    const nextCategory = entry.category === 'class' || entry.category === 'home' ? entry.category : null;
    const nextFolderId = entry.folderId || null;
    if (!nextTask && !nextCategory && !nextFolderId) {
      didRestoreRef.current = true;
      restoringRef.current = false;
      return;
    }
    restoringRef.current = true;
    pendingFolderIdRef.current = nextFolderId;
    setCurrentTask(nextTask);
    setCurrentCategory(nextCategory);
    setCurrentFolderId(null);
    didRestoreRef.current = true;
  }, [effectiveStudentId, initialLocation]);
  const taskCounts = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const normalizedTask = getNotesTaskNumber(f?.taskNumber);
      if (!Number.isFinite(normalizedTask)) continue;
      map.set(normalizedTask, (map.get(normalizedTask) || 0) + 1);
    }
    return map;
  }, [files]);

  const taskUsageByNumber = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      const taskNum = Number(f?.taskNumber);
      if (!Number.isFinite(taskNum)) continue;
      map.set(taskNum, (map.get(taskNum) || 0) + getEntrySizeBytes(f));
    }
    return map;
  }, [files]);

  const getFolderTaskNumber = (folderId) => {
    if (!folderId) return null;
    const folder = folders.find((item) => item.id === folderId);
    const taskNum = Number(folder?.taskNumber);
    return Number.isFinite(taskNum) ? taskNum : null;
  };

  const getUploadCandidates = (folderIdOverride) => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return [];
    const folderId = typeof folderIdOverride === 'undefined' ? currentFolderId : folderIdOverride;
    const folderTaskNumber = getFolderTaskNumber(folderId);
    if (Number.isFinite(folderTaskNumber)) return [folderTaskNumber];
    return getNotesTaskNumbers(normalizedCurrentTask);
  };

  const selectUploadTaskNumber = (sizeBytes, usageMap, folderIdOverride) => {
    const candidates = getUploadCandidates(folderIdOverride);
    if (!candidates.length) return null;
    let chosen = null;
    let bestRemaining = -1;
    for (const taskNumber of candidates) {
      const used = usageMap.get(taskNumber) || 0;
      const remaining = MAX_TASK_BYTES - used;
      if (remaining >= sizeBytes && remaining > bestRemaining) {
        chosen = taskNumber;
        bestRemaining = remaining;
      }
    }
    return chosen;
  };

  const categoryCounts = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return { class: 0, home: 0 };
    const counts = { class: 0, home: 0 };
    for (const f of files) {
      if (getNotesTaskNumber(f?.taskNumber) !== normalizedCurrentTask) continue;
      if (f?.category === 'class') counts.class += 1;
      if (f?.category === 'home') counts.home += 1;
    }
    return counts;
  }, [files, normalizedCurrentTask]);

  const folderCounts = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) return { root: 0, map: new Map() };
    const map = new Map();
    let root = 0;
    for (const f of files) {
      if (getNotesTaskNumber(f?.taskNumber) !== normalizedCurrentTask || f?.category !== currentCategory) continue;
      if (f?.folderId) map.set(f.folderId, (map.get(f.folderId) || 0) + 1);
      else root += 1;
    }
    return { root, map };
  }, [files, normalizedCurrentTask, currentCategory]);

  const taskUsageBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return 0;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) {
      return taskUsageByNumber.get(folderTaskNumber) || 0;
    }
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return getNotesTaskNumbers(normalizedCurrentTask)
        .reduce((sum, taskNumber) => sum + (taskUsageByNumber.get(taskNumber) || 0), 0);
    }
    return taskUsageByNumber.get(normalizedCurrentTask) || 0;
  }, [normalizedCurrentTask, currentFolderId, taskUsageByNumber, folders]);

  const totalLimitBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return MAX_TASK_BYTES;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) return MAX_TASK_BYTES;
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return MAX_TASK_BYTES * getNotesTaskNumbers(normalizedCurrentTask).length;
    }
    return MAX_TASK_BYTES;
  }, [normalizedCurrentTask, currentFolderId, folders]);

  const remainingBytes = Math.max(0, totalLimitBytes - taskUsageBytes);

  useEffect(() => {
    if (!effectiveStudentId) {
      setFiles([]);
      setFilesError('');
      return;
    }
    let cancelled = false;
    api.getFiles(effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFiles(data);
        setFilesError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFilesError('Не удалось загрузить файлы. Проверьте, что сервер запущен.');
      });
    return () => { cancelled = true; };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory || !effectiveStudentId) {
      setFolders([]);
      setFoldersError('');
      return;
    }
    let cancelled = false;
    const taskNumbers = getNotesTaskNumbers(normalizedCurrentTask);
    Promise.all(taskNumbers.map((taskNumber) => api.getFolders(taskNumber, currentCategory, effectiveStudentId)))
      .then((lists) => {
        if (cancelled) return;
        const merged = [];
        const seen = new Set();
        for (const list of lists) {
          for (const folder of list || []) {
            if (!folder?.id || seen.has(folder.id)) continue;
            seen.add(folder.id);
            merged.push(folder);
          }
        }
        setFolders(merged);
        setFoldersError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFoldersError('Не удалось загрузить папки.');
      });
    return () => { cancelled = true; };
  }, [normalizedCurrentTask, currentCategory, effectiveStudentId]);

  useEffect(() => {
    if (!pendingFolderIdRef.current) return;
    const targetId = pendingFolderIdRef.current;
    pendingFolderIdRef.current = null;
    if (targetId && folders.some((item) => item.id === targetId)) {
      setCurrentFolderId(targetId);
    } else {
      setCurrentFolderId(null);
    }
  }, [folders]);

  useEffect(() => {
    const preserveFolder = restoringRef.current;
    if (!preserveFolder) {
      setCurrentFolderId(null);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
    setDraggingFileId(null);
    setDragOverFolderId(null);
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    if (restoringRef.current && (currentTask || currentCategory)) {
      restoringRef.current = false;
    }
  }, [currentTask, currentCategory]);

  useEffect(() => {
    if (restoringRef.current) {
      setFolders([]);
      setFiles([]);
      setExpandedPyIds({});
      setExpandedPdfIds({});
      setShowPyCreator(false);
      setPyDraftName('');
      setPyDraftCode('');
      setPyDraftError('');
      setPyDraftSaving(false);
      didRestoreRef.current = false;
      skipNullSaveRef.current = true;
      return;
    }
    setCurrentTask(null);
    setCurrentCategory(null);
    setCurrentFolderId(null);
    setFolders([]);
    setFiles([]);
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    pendingFolderIdRef.current = null;
    restoringRef.current = false;
    didRestoreRef.current = false;
    skipNullSaveRef.current = true;
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    if (restoringRef.current) return;
    if (skipNullSaveRef.current && !currentTask && !currentCategory && !currentFolderId) {
      skipNullSaveRef.current = false;
      return;
    }
    skipNullSaveRef.current = false;
    onLocationChange?.({
      studentId: effectiveStudentId,
      taskNumber: currentTask,
      category: currentCategory,
      folderId: currentFolderId
    });
  }, [effectiveStudentId, currentTask, currentCategory, currentFolderId, onLocationChange]);

  const handleUploadFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (filesToUpload.length === 0) return;
    if (!effectiveStudentId) {
      alert('Сначала выберите ученика.');
      return;
    }
    const candidates = getUploadCandidates();
    if (!candidates.length) {
      alert('Сначала выберите задание и категорию.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    const usageByTask = new Map(taskUsageByNumber);
    let skipped = 0;

    for (const file of filesToUpload) {
      const targetTaskNumber = selectUploadTaskNumber(file.size, usageByTask);
      if (!Number.isFinite(targetTaskNumber)) {
        skipped += 1;
        continue;
      }
      try {
        const newF = await api.uploadFile(file, targetTaskNumber, currentCategory, currentFolderId || null, effectiveStudentId);
        setFiles(prev => [newF, ...prev]);
        usageByTask.set(targetTaskNumber, (usageByTask.get(targetTaskNumber) || 0) + file.size);
      } catch(err) {
        alert(err?.message || err);
      }
    }

    setIsUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (skipped > 0) {
      const limitNote = normalizedCurrentTask === GAME_THEORY_TASK && !currentFolderId
        ? 'Лимит 200 МБ на каждое из заданий 19-21.'
        : 'Лимит 200 МБ на задание.';
      alert(`Не хватило места для ${skipped} файла(ов). ${limitNote}`);
    }
  };

  const handleUpload = (e) => {
    handleUploadFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const list = e.dataTransfer?.files;
    handleUploadFiles(list);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setFoldersError('Введите название папки.');
      return;
    }
    const uploadTaskNumber = normalizedCurrentTask;
    if (!Number.isFinite(uploadTaskNumber) || !currentCategory || !effectiveStudentId) return;
    try {
      const created = await api.createFolder(uploadTaskNumber, currentCategory, name, effectiveStudentId);
      setFolders(prev => [created, ...prev]);
      setNewFolderName('');
      setIsCreatingFolder(false);
      setFoldersError('');
      setCurrentFolderId(created.id);
    } catch (err) {
      setFoldersError(err?.message || err);
    }
  };

  const startRenameFolder = (folder) => {
    setRenamingFolderId(folder.id);
    setRenameFolderValue(folder.name || '');
  };

  const cancelRenameFolder = () => {
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
  };

  const saveRenameFolder = async (folder, nameOverride) => {
    if (!folder?.id) return;
    const name = (nameOverride ?? renameFolderValue).trim();
    if (!name || name === folder.name) {
      cancelRenameFolder();
      return;
    }
    setIsRenamingFolder(true);
    try {
      const updated = await api.renameFolder(folder.id, name);
      setFolders((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      setFiles((prev) => prev.map((f) => (f.folderId === updated.id ? { ...f, folderName: updated.name } : f)));
      cancelRenameFolder();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleDragStartFile = (e, file) => {
    if (renamingId === file.id) return;
    setDraggingFileId(file.id);
    e.dataTransfer.setData('text/plain', file.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEndFile = () => {
    setDraggingFileId(null);
    setDragOverFolderId(null);
  };

  const handleFolderDragOver = (e, folderId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleFolderDragLeave = (e, folderId) => {
    e.preventDefault();
    if (dragOverFolderId === folderId) setDragOverFolderId(null);
  };

  const handleFolderDrop = async (e, folderId) => {
    e.preventDefault();
    const fileId = e.dataTransfer.getData('text/plain');
    if (!fileId) return;
    if (folderId) {
      const file = files.find((item) => item.id === fileId);
      const folder = folders.find((item) => item.id === folderId);
      const fileTask = Number(file?.taskNumber);
      const folderTask = Number(folder?.taskNumber);
      if (Number.isFinite(fileTask) && Number.isFinite(folderTask) && fileTask !== folderTask) {
        alert('Нельзя переместить файл в папку другого задания.');
        setDragOverFolderId(null);
        return;
      }
    }
    try {
      const updated = await api.moveFile(fileId, folderId);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, folderId: updated.folderId, folderName: updated.folderName } : f)));
      setDraggingFileId(null);
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setDragOverFolderId(null);
    }
  };

  const isPyFile = (name) => name?.toLowerCase().endsWith('.py');
  const isPdfFile = (name) => name?.toLowerCase().endsWith('.pdf');
  const isExcelFile = (name) => {
    const lower = name?.toLowerCase() || '';
    return (
      lower.endsWith('.xls') ||
      lower.endsWith('.xlsx') ||
      lower.endsWith('.xlsm') ||
      lower.endsWith('.xlsb') ||
      lower.endsWith('.xlt') ||
      lower.endsWith('.xltx') ||
      lower.endsWith('.ods') ||
      lower.endsWith('.ots') ||
      lower.endsWith('.fods')
    );
  };

  const normalizePyFileName = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    return trimmed.toLowerCase().endsWith('.py') ? trimmed : `${trimmed}.py`;
  };

  const getPyDraftSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const handleCreatePyFile = async () => {
    if (!effectiveStudentId) {
      setPyDraftError('Сначала выберите ученика.');
      return;
    }
    if (!Number.isFinite(normalizedCurrentTask) || !currentCategory) {
      setPyDraftError('Сначала выберите задание и категорию.');
      return;
    }
    const normalizedName = normalizePyFileName(pyDraftName);
    if (!normalizedName) {
      setPyDraftError('Введите название файла.');
      return;
    }
    const code = String(pyDraftCode ?? '');
    const sizeBytes = getPyDraftSize(code);
    const usageByTask = new Map(taskUsageByNumber);
    const uploadTaskNumber = selectUploadTaskNumber(sizeBytes, usageByTask);
    if (!Number.isFinite(uploadTaskNumber)) {
      setPyDraftError('Недостаточно места для сохранения файла в этом задании.');
      return;
    }
    if (pyDraftSaving) return;
    setPyDraftSaving(true);
    setPyDraftError('');
    try {
      const file = new File([code], normalizedName, { type: 'text/x-python' });
      const created = await api.uploadFile(file, uploadTaskNumber, currentCategory, currentFolderId || null, effectiveStudentId);
      setFiles((prev) => [created, ...prev]);
      setPyDraftName('');
      setPyDraftCode('');
      setShowPyCreator(false);
    } catch (err) {
      setPyDraftError(err?.message || err);
    } finally {
      setPyDraftSaving(false);
    }
  };

  const PdfLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#E53E3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        PDF
      </text>
    </svg>
  );

  const PyLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <path
        fill="#3776AB"
        d="M12 2c-4 0-4 2-4 2v3h8v1H6c-2.2 0-4 1.8-4 4v2c0 2.2 1.8 4 4 4h2v-3c0-2.2 1.8-4 4-4h4c2.2 0 4-1.8 4-4V6c0-2.2-1.8-4-4-4h-4z"
      />
      <circle cx="10" cy="4.5" r="0.9" fill="#FFFFFF" />
      <path
        fill="#FFD43B"
        d="M12 22c4 0 4-2 4-2v-3h-8v-1h10c2.2 0 4-1.8 4-4v-2c0-2.2-1.8-4-4-4h-2v3c0 2.2-1.8 4-4 4h-4c-2.2 0-4 1.8-4 4v3c0 2.2 1.8 4 4 4h4z"
      />
      <circle cx="14" cy="19.5" r="0.9" fill="#FFFFFF" />
    </svg>
  );

  const ExcelLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
      <rect x="3" y="2" width="18" height="20" rx="3" fill="#1F7A3E" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="7"
        fontFamily="Arial, sans-serif"
        fill="#FFFFFF"
      >
        XLS
      </text>
    </svg>
  );

  const FileIcon = ({ name }) => {
    if (isPdfFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <PdfLogo />
          </div>
          <span className="text-[10px] font-bold text-red-600 mt-1">PDF</span>
        </div>
      );
    }
    if (isExcelFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <ExcelLogo />
          </div>
          <span className="text-[10px] font-bold text-green-700 mt-1">XLS</span>
        </div>
      );
    }
    if (isPyFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <PyLogo />
          </div>
          <span className="text-[10px] font-bold text-blue-600 mt-1">PY</span>
        </div>
      );
    }
    return (
      <div className="w-10 h-10 flex items-center justify-center bg-transparent">
        <FileText size={20} className="text-gray-600"/>
      </div>
    );
  };

  const handleDownload = (file) => {
    const url = getFileUrl(file);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    if (file?.name) link.download = file.name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const togglePyPreview = async (file) => {
    const url = getFileUrl(file);
    if (!url || !isPyFile(file.name)) return;
    setExpandedPyIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
    if (pyContent[file.id] || pyError[file.id]) return;

    setPyLoadingId(file.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Не удалось загрузить файл');
      const text = await res.text();
      setPyContent((prev) => ({ ...prev, [file.id]: text }));
    } catch (err) {
      setPyError((prev) => ({ ...prev, [file.id]: err?.message || 'Ошибка загрузки' }));
    } finally {
      setPyLoadingId(null);
    }
  };

  const togglePdfPreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isPdfFile(file.name)) return;
    setExpandedPdfIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
  };

  const toggleFilePreview = (file) => {
    if (isPyFile(file.name)) return togglePyPreview(file);
    if (isPdfFile(file.name)) return togglePdfPreview(file);
    return null;
  };

  const handleDelete = async (file) => {
    if (!confirm('Удалить файл?')) return;
    try {
      await api.deleteFile(file.id);
      setFiles(prev => prev.filter(x => x.id !== file.id));
      setExpandedPyIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setExpandedPdfIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      if (renamingId === file.id) {
        cancelRename();
      }
    } catch(err) {
      alert(err?.message || err);
    }
  };

  const splitFileName = (name = '') => {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0 || lastDot === name.length - 1) {
      return { base: name, ext: '' };
    }
    return { base: name.slice(0, lastDot), ext: name.slice(lastDot + 1) };
  };

  const startRename = (file) => {
    setRenamingId(file.id);
    const { base, ext } = splitFileName(file?.name || '');
    setRenameBase(base);
    setRenameExt(ext);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
  };

  const saveRename = async (file, nameOverride) => {
    if (!file?.id) return;
    const base = (nameOverride ?? renameBase).trim();
    if (!base) {
      cancelRename();
      return;
    }
    const ext = renameExt ? `.${renameExt}` : '';
    const name = `${base}${ext}`;
    if (name === file.name) {
      cancelRename();
      return;
    }
    setIsRenaming(true);
    try {
      const updated = await api.renameFile(file.id, name);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, name: updated.name } : f)));
      if (!isPyFile(updated.name)) {
        setExpandedPyIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      if (!isPdfFile(updated.name)) {
        setExpandedPdfIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      cancelRename();
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setIsRenaming(false);
    }
  };

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Ученик:</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
        >
          <option value="" disabled>Выберите ученика</option>
          {studentsList.map((student) => (
            <option key={student.id} value={student.id}>
              {getStudentLabel(student)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  if (role === 'teacher' && studentsList.length === 0) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Конспекты</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">
          {studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'}
        </div>
      </div>
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return (
      <div className="animate-fadeIn space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold">Конспекты</h2>
          {renderStudentPicker()}
        </div>
        <div className="text-gray-500">Выберите ученика, чтобы открыть его материалы.</div>
      </div>
    );
  }

  if (!currentTask) return (
    <div className="animate-fadeIn" data-tour="notes">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl font-bold">Конспекты</h2>
        {renderStudentPicker()}
      </div>
      <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
        {taskOptions.map((task) => (
          <Card
            key={task.number}
            onClick={() => setCurrentTask(normalizeTaskNumber(task.number))}
            className={`flex flex-col items-center justify-center p-6 cursor-pointer ${
              (taskCounts.get(task.number) || 0) > 0 ? 'hover:bg-purple-50' : 'opacity-70 hover:bg-gray-50'
            }`}
          >
            <Folder size={32} className="text-blue-400 mb-2 fill-current" />
            <span className="font-bold text-gray-700">Задание {getTaskDisplayNumber(task)}</span>
            <span
              className={`mt-2 text-xs font-bold px-2 py-1 rounded-full border ${
                (taskCounts.get(task.number) || 0) > 0
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              {(taskCounts.get(task.number) || 0) > 0 ? `Файлов: ${taskCounts.get(task.number)}` : 'Пусто'}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );

  if (!currentCategory) return (
    <div className="animate-fadeIn" data-tour="notes">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onClick={() => setCurrentTask(null)} className="flex items-center text-gray-500 hover:text-purple-600"><ArrowLeft size={16}/> Назад</button>
        {renderStudentPicker()}
      </div>
      <h2 className="text-2xl font-bold mb-6">Задание {formatTaskNumber(currentTask) || currentTask}</h2>
      <div className="grid grid-cols-2 gap-6">
        <Card
          onClick={() => setCurrentCategory('class')}
          className={`p-8 flex items-center gap-4 cursor-pointer ${
            categoryCounts.class > 0 ? 'hover:border-purple-300' : 'opacity-80 hover:border-gray-300'
          }`}
        >
          <BookOpen size={32} className="text-orange-500"/>
          <div>
            <h3 className="font-bold text-lg">На уроке</h3>
            <p className="text-gray-500 text-sm">Презентации и скрипты</p>
            <p className={`mt-2 text-xs font-bold ${categoryCounts.class > 0 ? 'text-green-700' : 'text-gray-500'}`}>
              {categoryCounts.class > 0 ? `Файлов: ${categoryCounts.class}` : 'Пусто'}
            </p>
          </div>
        </Card>
        <Card
          onClick={() => setCurrentCategory('home')}
          className={`p-8 flex items-center gap-4 cursor-pointer ${
            categoryCounts.home > 0 ? 'hover:border-purple-300' : 'opacity-80 hover:border-gray-300'
          }`}
        >
          <FileText size={32} className="text-green-500"/>
          <div>
            <h3 className="font-bold text-lg">Домашка</h3>
            <p className="text-gray-500 text-sm">Файлы заданий</p>
            <p className={`mt-2 text-xs font-bold ${categoryCounts.home > 0 ? 'text-green-700' : 'text-gray-500'}`}>
              {categoryCounts.home > 0 ? `Файлов: ${categoryCounts.home}` : 'Пусто'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );

  const filtered = files.filter((f) =>
    getNotesTaskNumber(f?.taskNumber) === normalizedCurrentTask &&
    f.category === currentCategory &&
    (currentFolderId ? f.folderId === currentFolderId : !f.folderId)
  );
  const currentFolderLabel = currentFolderId
    ? (folders.find((f) => f.id === currentFolderId)?.name || 'Папка')
    : 'Без папки';
  const pyEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true
  };

  return (
    <div className="animate-fadeIn" data-tour="notes">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <button onClick={() => setCurrentCategory(null)} className="flex items-center text-gray-500 hover:text-purple-600"><ArrowLeft size={16}/> Назад</button>
        {renderStudentPicker()}
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-6">
        <div>
          <div className="text-base md:text-lg font-semibold text-gray-700 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setCurrentCategory(null)}
              className="hover:text-purple-600"
              type="button"
            >
              Задание {formatTaskNumber(currentTask) || currentTask}
            </button>
            <ChevronRight size={16} className="text-gray-300" />
            <button
              onClick={() => setCurrentFolderId(null)}
              className="hover:text-purple-600"
              type="button"
            >
              {currentCategory === 'class' ? 'На уроке' : 'Домашка'}
            </button>
            <ChevronRight size={16} className="text-gray-300" />
            <span className={currentFolderId ? 'text-gray-700' : 'text-gray-400'}>
              {currentFolderLabel}
            </span>
          </div>
          <div className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-3">
            <span>Использовано: {formatBytes(taskUsageBytes)} из {formatBytes(totalLimitBytes)}</span>
            <span className={remainingBytes <= 10 * 1024 * 1024 ? 'text-red-600 font-medium' : ''}>
              Осталось: {formatBytes(remainingBytes)}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} multiple/>
          <Button onClick={() => fileRef.current.click()} disabled={isUploading}><Upload size={18}/> {isUploading ? '...' : 'Загрузить'}</Button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">Python файл</h3>
          <Button variant="secondary" onClick={() => setShowPyCreator((v) => !v)}>
            <Plus size={16}/> {showPyCreator ? 'Скрыть' : 'Создать'}
          </Button>
        </div>
        {showPyCreator && (
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={pyDraftName}
                onChange={(e) => { setPyDraftName(e.target.value); setPyDraftError(''); }}
                placeholder="Название файла (без .py)"
                className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
              />
              <Button onClick={handleCreatePyFile} disabled={pyDraftSaving || !pyDraftName.trim()}>
                {pyDraftSaving ? 'Сохранение...' : 'Сохранить файл'}
              </Button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height="220px"
                language="python"
                theme="vs-dark"
                value={pyDraftCode}
                onChange={(value) => {
                  setPyDraftCode(value ?? '');
                  if (pyDraftError) setPyDraftError('');
                }}
                options={pyEditorOptions}
                loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
              <span>Файл сохранится в папке: {currentFolderLabel}</span>
              <span>Размер: {formatBytes(getPyDraftSize(pyDraftCode))}</span>
            </div>
            {pyDraftError && <p className="text-xs text-red-500">{pyDraftError}</p>}
          </div>
        )}
      </div>
      <div className="bg-white rounded-2xl border p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">Папки</h3>
          <Button variant="secondary" onClick={() => setIsCreatingFolder((v) => !v)}>
            <FolderPlus size={16}/> Новая папка
          </Button>
        </div>

        {isCreatingFolder && (
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => { setNewFolderName(e.target.value); setFoldersError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
              placeholder="Название папки"
              className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
            />
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Создать
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentFolderId(null)}
            onDragOver={(e) => handleFolderDragOver(e, 'root')}
            onDragLeave={(e) => handleFolderDragLeave(e, 'root')}
            onDrop={(e) => handleFolderDrop(e, null)}
            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
              dragOverFolderId === 'root'
                ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                : currentFolderId === null
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 text-gray-600 hover:border-purple-300'
            }`}
          >
            Без папки
            <span className="ml-2 text-xs opacity-70">{folderCounts.root}</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => {
                if (renamingFolderId !== folder.id) setCurrentFolderId(folder.id);
              }}
              onDoubleClick={() => startRenameFolder(folder)}
              onDragOver={(e) => handleFolderDragOver(e, folder.id)}
              onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
              onDrop={(e) => handleFolderDrop(e, folder.id)}
              className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                dragOverFolderId === folder.id
                  ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                  : currentFolderId === folder.id
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-200 text-gray-600 hover:border-purple-300'
              }`}
            >
              {renamingFolderId === folder.id ? (
                <input
                  value={renameFolderValue}
                  onChange={(e) => setRenameFolderValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRenameFolder(folder);
                    if (e.key === 'Escape') cancelRenameFolder();
                  }}
                  onBlur={() => {
                    if (!isRenamingFolder) saveRenameFolder(folder);
                  }}
                  className="px-2 py-1 rounded-lg bg-white border border-gray-200 focus:border-purple-500 outline-none text-sm"
                  autoFocus
                />
              ) : (
                <>
                  {folder.name}
                  <span className="ml-2 text-xs opacity-70">{folderCounts.map.get(folder.id) || 0}</span>
                </>
              )}
            </button>
          ))}
        </div>
        {foldersError && <p className="text-xs text-red-500 mt-2">{foldersError}</p>}
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-tour="files"
        className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
          isDragging ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="text-sm text-gray-500 mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>Перетащите файл сюда для загрузки</span>
          <span className="text-xs text-gray-400">
            Папка: {currentFolderLabel} • Осталось {formatBytes(remainingBytes)}
          </span>
          {isUploading && <span className="text-xs text-purple-600 font-bold">Загрузка...</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center p-10 bg-white border border-dashed rounded-2xl text-gray-400">
            {filesError || 'Пусто'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(f => (
              <div key={f.id} className="space-y-2">
                <div
                className={`bg-white p-4 rounded-xl border flex justify-between items-center ${draggingFileId === f.id ? 'opacity-60' : ''}`}
                draggable={renamingId !== f.id}
                onDragStart={(e) => handleDragStartFile(e, f)}
                onDragEnd={handleDragEndFile}
                onClick={() => toggleFilePreview(f)}
                role={(isPyFile(f.name) || isPdfFile(f.name)) ? 'button' : undefined}
                tabIndex={(isPyFile(f.name) || isPdfFile(f.name)) ? 0 : undefined}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && (isPyFile(f.name) || isPdfFile(f.name))) {
                    e.preventDefault();
                    toggleFilePreview(f);
                  }
                }}
              >
                  <div className="flex items-start gap-3 min-w-0">
                    <FileIcon name={f.name} />
                    <div className="min-w-0">
                      {renamingId === f.id ? (
                        <div className="flex items-center gap-1 w-full">
                          <input
                            value={renameBase}
                            onChange={(e) => setRenameBase(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(f);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            onBlur={() => {
                              if (!isRenaming) saveRename(f);
                            }}
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          {renameExt ? (
                            <span className="text-sm text-gray-500 select-none">.{renameExt}</span>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(f);
                          }}
                          className="font-medium text-gray-800 truncate text-left hover:text-purple-600"
                          title="Переименовать"
                        >
                          {f.name}
                        </button>
                      )}
                      <p className="text-xs text-gray-500">{f.size} • {f.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {renamingId === f.id ? null : (
                      <>
                        {!isPyFile(f.name) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                            className="p-2 hover:bg-gray-100 rounded text-gray-500"
                            title="Скачать файл"
                          >
                            <Download size={18}/>
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(f); }} className="p-2 hover:bg-red-50 rounded text-red-500"><Trash2 size={18}/></button>
                      </>
                    )}
                  </div>
                </div>
                {isPyFile(f.name) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedPyIds[f.id] ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="rounded-xl max-h-[50vh] overflow-auto">
                      {pyLoadingId === f.id && (
                        <pre className="language-python m-0 p-4 text-sm"><code>Загрузка...</code></pre>
                      )}
                      {pyLoadingId !== f.id && pyError[f.id] && (
                        <pre className="language-python m-0 p-4 text-sm"><code>{pyError[f.id]}</code></pre>
                      )}
                      {pyLoadingId !== f.id && !pyError[f.id] && (
                        pyContent[f.id]
                          ? (
                            <pre className="language-python m-0 p-4 text-sm">
                              <code dangerouslySetInnerHTML={{ __html: highlightPython(pyContent[f.id]) }} />
                            </pre>
                          )
                          : (
                            <pre className="language-python m-0 p-4 text-sm"><code># Пустой файл</code></pre>
                          )
                      )}
                    </div>
                  </div>
                )}
                {isPdfFile(f.name) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedPdfIds[f.id] ? 'max-h-[70vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="bg-white border rounded-xl overflow-hidden">
                      <iframe
                        title={f.name}
                        src={getFileUrl(f)}
                        className="w-full h-[60vh]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StudentTour = ({ user, view, setView, menuOpen, setMenuOpen, onFinish }) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const steps = STUDENT_TOUR_STEPS;
  const step = steps[stepIndex] || {};
  const canShowTour = Boolean(user && user.role === 'student' && !hasStudentSeenTour(user.id));

  useEffect(() => {
    if (!canShowTour) return;
    const timer = setTimeout(() => {
      setOpen(true);
      setStepIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [canShowTour]);

  useEffect(() => {
    if (!open) return;
    if (step.view && step.view !== view) setView(step.view);
    if (typeof window === 'undefined') return;
    if (step.menu === 'open' && window.innerWidth < 768) setMenuOpen(true);
    if (step.menu === 'close' && window.innerWidth < 768) setMenuOpen(false);
  }, [open, stepIndex, step.view, step.menu, view, setView, setMenuOpen]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const targetSelector = step.target;
    const fallbackSelector = step.fallback;
    let rafId = 0;
    const update = () => {
      if (!targetSelector && !fallbackSelector) {
        setHighlightRect(null);
        return;
      }
      let el = targetSelector ? document.querySelector(targetSelector) : null;
      if (!el && fallbackSelector) el = document.querySelector(fallbackSelector);
      if (!el) {
        setHighlightRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setHighlightRect(null);
        return;
      }
      const pad = 10;
      setHighlightRect({
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2
      });
    };
    const schedule = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      cancelAnimationFrame(rafId);
    };
  }, [open, stepIndex, view, menuOpen, step.target, step.fallback]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        markStudentSeenTour(user?.id);
        onFinish?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, user?.id, onFinish]);

  const finishTour = (markDone = true) => {
    setOpen(false);
    if (markDone) markStudentSeenTour(user?.id);
    onFinish?.();
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      finishTour(true);
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  };

  if (!open || !canShowTour || !user || user.role !== 'student') return null;
  if (typeof document === 'undefined') return null;

  const mascotSrc = MASCOT_IMAGES[step.emotion] || mascotGreetings;
  const isLast = stepIndex === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-black/50" />
      {highlightRect && (
        <div
          className="absolute rounded-3xl ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{
            top: Math.max(8, highlightRect.top),
            left: Math.max(8, highlightRect.left),
            width: Math.max(0, highlightRect.width),
            height: Math.max(0, highlightRect.height)
          }}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 sm:bottom-6 flex justify-center sm:justify-end">
        <div className="bg-white w-[min(520px,calc(100%-2rem))] rounded-3xl border border-gray-200 shadow-2xl p-4 sm:p-5 mx-4 sm:mx-0 sm:mr-6">
          <div className="flex items-start gap-3">
            <img src={mascotSrc} alt="Маскот" className="w-24 h-24 sm:w-28 sm:h-28 object-contain drop-shadow-sm" />
            <div>
              <p className="text-xs uppercase tracking-widest text-gray-400">Шаг {stepIndex + 1} из {steps.length}</p>
              <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{step.text}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button onClick={() => finishTour(true)} className="text-sm text-gray-400 hover:text-gray-600">Пропустить</button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={handlePrev} disabled={stepIndex === 0}>Назад</Button>
              <Button onClick={handleNext}>{isLast ? 'Готово' : 'Дальше'}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const NewHomeworkModal = ({ entry, open, onClose, onOpenSchedule, onOpenTask, testsDb, solvedByTask }) => {
  if (!open || !entry) return null;
  const homeWorkText = typeof entry.homeWork === 'string' ? entry.homeWork.trim() : '';
  const lessonLink = typeof entry.lessonLink === 'string' ? entry.lessonLink.trim() : '';
  const boardLink = typeof entry.boardLink === 'string' ? entry.boardLink.trim() : '';
  const issuedAt = entry.issuedAt ? new Date(entry.issuedAt) : null;
  const issuedLabel = issuedAt && !Number.isNaN(issuedAt.getTime())
    ? issuedAt.toLocaleDateString('ru-RU')
    : '';
  const cleanHomeworkLine = (line) => String(line ?? '')
    .replace(/^[\s\u2022\u2013\u2014-]+/, '')
    .replace(/^(?:\u2705|\u{1F7E2})+\s*/u, '')
    .trim();
  const homeworkLines = homeWorkText
    ? homeWorkText.split('\n').map(cleanHomeworkLine).filter(Boolean)
    : [];
  const rawGoals = Array.isArray(entry.goals) && entry.goals.length > 0
    ? entry.goals
    : (entry?.taskNumber && entry?.levelId
      ? [{
          taskNumber: entry.taskNumber,
          levelId: entry.levelId,
          targetQuestions: entry.targetQuestions,
          includeAll: entry.includeAll,
        }]
      : []);
  const firstGoal = rawGoals.find((goal) => Number.isFinite(normalizeTaskNumber(goal?.taskNumber)));
  const firstGoalTaskNumber = firstGoal ? normalizeTaskNumber(firstGoal.taskNumber) : null;
  const firstGoalIsPython = Number.isFinite(firstGoalTaskNumber) ? isPythonTaskNumber(firstGoalTaskNumber) : false;
  const firstGoalLevelId = firstGoal
    ? (firstGoalIsPython ? PYTHON_LEVEL_ID : firstGoal.levelId)
    : null;
  const firstGoalTargets = firstGoal && !firstGoal.includeAll
    ? (Array.isArray(firstGoal.targetQuestions) ? firstGoal.targetQuestions : null)
    : null;
  const getQuestionsCountForGoal = (goal, taskNumberValue, levelIdValue) => {
    if (!goal?.includeAll) return 0;
    if (!testsDb || !taskNumberValue || !levelIdValue) return 0;
    const task = testsDb[String(taskNumberValue)] || testsDb[taskNumberValue];
    const list = task?.[String(levelIdValue)] || task?.[levelIdValue];
    return Array.isArray(list) ? list.length : 0;
  };
  const getSolvedCountForGoal = (goal, taskNumberValue, levelIdValue, targetQuestions) => {
    if (!solvedByTask || !taskNumberValue || !levelIdValue) return 0;
    const taskEntry = solvedByTask?.[String(taskNumberValue)] || {};
    const levelEntry = taskEntry?.[String(levelIdValue)] || {};
    const solvedIds = Array.isArray(levelEntry?.solved) ? levelEntry.solved : [];
    if (!testsDb || solvedIds.length === 0) {
      return goal?.includeAll ? solvedIds.length : 0;
    }
    const task = testsDb[String(taskNumberValue)] || testsDb[taskNumberValue];
    const list = task?.[String(levelIdValue)] || task?.[levelIdValue];
    if (!Array.isArray(list)) {
      return goal?.includeAll ? solvedIds.length : 0;
    }
    const idToNumber = new Map();
    list.forEach((question, index) => {
      const id = question?.id;
      if (id !== undefined && id !== null) {
        idToNumber.set(String(id), index + 1);
      }
    });
    const solvedNumbers = new Set();
    solvedIds.forEach((id) => {
      const mapped = idToNumber.get(String(id));
      if (Number.isFinite(mapped)) solvedNumbers.add(mapped);
    });
    if (goal?.includeAll) return solvedNumbers.size;
    const targets = Array.isArray(targetQuestions) ? targetQuestions : [];
    return targets.filter((num) => solvedNumbers.has(Number(num))).length;
  };
  const goalItems = rawGoals
    .map((goal) => {
      const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
      const taskNumberValue = Number.isFinite(normalizedTaskNumber)
        ? Number(normalizedTaskNumber)
        : Number(goal?.taskNumber);
      const isPythonGoal = Number.isFinite(taskNumberValue) ? isPythonTaskNumber(taskNumberValue) : false;
      const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumberValue) : null;
      const taskInfo = !isPythonGoal
        ? MOCK_TASKS.find((task) => Number(task.number) === Number(taskNumberValue))
        : null;
      const taskTitle = pythonTask?.title || taskInfo?.title || '';
      const taskDisplay = pythonTask?.displayNumber
        || formatTaskNumber(taskNumberValue)
        || (Number.isFinite(taskNumberValue) ? String(taskNumberValue) : '');
      const levelLabel = isPythonGoal
        ? 'Python'
        : (LEVELS[goal?.levelId?.toUpperCase()]?.label || goal?.levelId || '');
      const labelBase = taskTitle
        ? `${taskDisplay ? `${taskDisplay}. ` : ''}${taskTitle}`
        : (taskDisplay ? `Задание ${taskDisplay}` : 'Задание');
      const label = levelLabel ? `${labelBase} · ${levelLabel}` : labelBase;
      const targetQuestions = Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [];
      const effectiveLevelId = isPythonGoal ? PYTHON_LEVEL_ID : goal?.levelId;
      const totalCount = goal?.includeAll
        ? getQuestionsCountForGoal(goal, taskNumberValue, effectiveLevelId)
        : targetQuestions.length;
      const solvedCount = getSolvedCountForGoal(goal, taskNumberValue, effectiveLevelId, targetQuestions);
      const totalLabel = totalCount
        ? String(totalCount)
        : (goal?.includeAll ? 'все' : '');
      const progressLabel = totalLabel ? `${Math.min(solvedCount, Number(totalLabel) || solvedCount)}/${totalLabel}` : '';
      return { label, progressLabel };
    })
    .filter((item) => item.label);
  const headline = homeworkLines[0]
    || (goalItems.length === 1 ? goalItems[0].label : '');
  const listItems = homeworkLines.length > 1
    ? homeworkLines.slice(1).map((line) => ({ label: line, progressLabel: '' }))
    : goalItems;
  const splitGoalLabel = (label) => {
    const parts = String(label || '').split(' \u00b7 ');
    if (parts.length <= 1) return { title: label, level: '' };
    return { title: parts[0], level: parts.slice(1).join(' \u00b7 ') };
  };

  const modal = (
    <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-[min(980px,95vw)] aspect-[3/2]">
        <img
          src={HOMEWORK_POPUP_BG}
          alt={'\u041d\u043e\u0432\u0430\u044f \u0434\u043e\u043c\u0430\u0448\u043a\u0430'}
          className="absolute inset-0 w-full h-full object-contain drop-shadow-2xl"
        />
        <div className="absolute left-[25.5%] right-[26%] top-[29%] bottom-[23%] z-10 flex flex-col">
          <div className="flex-1 flex flex-col items-center text-sky-50/90">
            <div className="mt-3 text-[16px] font-semibold tracking-[0.35em] uppercase text-sky-50/90">{'\u0426\u0415\u041b\u042c'}</div>
            <div className="mt-4 w-full max-w-[420px] space-y-3 text-[16px] text-sky-50/90 mx-auto text-left">
              {listItems.length > 0 ? (
                listItems.map((item, idx) => {
                  const { title, level } = splitGoalLabel(item.label);
                  return (
                    <div key={`${idx}-${item.label.slice(0, 24)}`} className="grid grid-cols-[1fr_auto] items-start gap-4">
                      <div className="leading-snug">
                        <div>{title}</div>
                        {level && <div className="text-[15px] text-sky-100/80">{level}</div>}
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        {item.progressLabel && (
                          <span className="text-sm text-sky-100/70">[{item.progressLabel}]</span>
                        )}
                        <span className="inline-flex w-4 h-4 border border-sky-200/70 rounded-sm" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-sm text-sky-100/70">
                  {'\u0414\u043e\u043c\u0430\u0448\u043a\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430.'}
                </div>
              )}
            </div>
            <div className="mt-auto w-full flex flex-wrap items-center justify-between gap-3 text-[12px] text-sky-100/80">
              <div className="flex flex-wrap items-center gap-3">
                {Number.isFinite(entry.daysToComplete) && (
                  <span className="ml-2">
                    {'\u0421\u0440\u043e\u043a: '}{entry.daysToComplete}{' \u0434\u043d.'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  className="bg-white/80 text-gray-800 border border-white/80 hover:bg-white"
                  onClick={onClose}
                >
                  {'\u041f\u043e\u043d\u044f\u043b'}
                </Button>
                <Button
                  className="bg-sky-500/80 hover:bg-sky-500 text-white"
                  onClick={() => {
                    if (firstGoal && Number.isFinite(firstGoalTaskNumber)) {
                      onClose?.();
                      onOpenTask?.(firstGoalTaskNumber, firstGoalLevelId, firstGoalTargets);
                    } else {
                      onOpenSchedule();
                    }
                  }}
                  disabled={!firstGoal || !Number.isFinite(firstGoalTaskNumber)}
                >
                  {'\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u043a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044e'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress }) => {
  const allowedViews = user.role === 'admin'
    ? ['admin']
    : user.role === 'teacher'
      ? ['schedule', 'progress', 'python', 'teacher', 'notes']
      : ['schedule', 'progress', 'python', 'notes'];
  const defaultView = user.role === 'teacher' ? 'teacher' : (user.role === 'admin' ? 'admin' : 'progress');
  const storedLocation = readUserLocation(user);
  const storedView = storedLocation?.view;
  const storedPythonLocation = storedLocation?.pythonLocation && typeof storedLocation.pythonLocation === 'object'
    ? storedLocation.pythonLocation
    : null;
  const fallbackPythonOpenTask = storedPythonLocation
    ? normalizeStoredOpenTask({
      taskNumber: storedPythonLocation?.taskNumber,
      levelId: PYTHON_LEVEL_ID,
      questionIndex: storedPythonLocation?.questionIndex
    })
    : null;
  const restoredOpenTask = user.role === 'student'
    ? (normalizeStoredOpenTask(storedLocation?.openTask)
        || (storedView === 'python' ? fallbackPythonOpenTask : null))
    : null;
  const storedActiveStudentId = storedLocation?.activeStudentId ? String(storedLocation.activeStudentId) : null;
  const initialView = (restoredOpenTask?.section && allowedViews.includes(restoredOpenTask.section))
    ? restoredOpenTask.section
    : (allowedViews.includes(storedView) ? storedView : defaultView);
  const initialProgressSection = ['progress', 'notes', 'mocks'].includes(storedLocation?.progressSection)
    ? storedLocation.progressSection
    : 'progress';
  const initialNotesLocation = storedLocation?.notesLocation && typeof storedLocation.notesLocation === 'object'
    ? storedLocation.notesLocation
    : null;

  const [view, setView] = useState(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingOpenTask, setPendingOpenTask] = useState(() => (user.role === 'student' ? restoredOpenTask : null));
  const [goalState, setGoalState] = useState(null);
  const [goalTestsDb, setGoalTestsDb] = useState(null);
  const [goalRefreshTick, setGoalRefreshTick] = useState(0);
  const [goalCollapsed, setGoalCollapsed] = useState(false);
  const [homeworkPopupEntry, setHomeworkPopupEntry] = useState(null);
  const [homeworkPopupOpen, setHomeworkPopupOpen] = useState(false);
  const [solvedByTask, setSolvedByTask] = useState({});
  const [studentStreak, setStudentStreak] = useState(getDefaultStreak());
  const [streakPopup, setStreakPopup] = useState({
    open: false,
    current: 0,
    best: 0,
    isNewRecord: false
  });
  const studentStreakRef = useRef(studentStreak);
  const [isDesktopWide, setIsDesktopWide] = useState(
    typeof window !== 'undefined' ? window.innerWidth > 1000 : true
  );
  const [teacherNotifs, setTeacherNotifs] = useState([]);
  const teacherReadIdsRef = useRef(new Set());
  const teacherShownIdsRef = useRef(new Set());
  const [taskTitles, setTaskTitles] = useState({});
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [deletedStudents, setDeletedStudents] = useState([]);
  const [deletedStudentsLoading, setDeletedStudentsLoading] = useState(false);
  const [deletedStudentsError, setDeletedStudentsError] = useState('');
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');
  const studentsWithNicknames = useMemo(
    () => students,
    [students]
  );
  const tasksWithTitles = useMemo(
    () => applyTaskTitles(MOCK_TASKS, taskTitles),
    [taskTitles]
  );

  useEffect(() => {
    updateUserLocation(user, { view });
    if (view !== 'progress' && view !== 'python') {
      updateUserLocation(user, { openTask: null });
    }
  }, [view, user]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    updateUserLocation(user, { activeStudentId: activeStudentId || null });
  }, [activeStudentId, user]);

  const nav = user.role === 'admin'
    ? [
      { id: 'admin', label: 'Админка', icon: Settings }
    ]
    : user.role === 'teacher'
      ? [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'python', label: 'Изучение Python', icon: FileText },
        { id: 'teacher', label: 'Управление тестами', icon: Settings },
        { id: 'notes', label: 'Конспекты', icon: Folder }
      ]
      : [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'python', label: 'Изучение Python', icon: FileText },
        { id: 'notes', label: 'Конспекты', icon: BookOpen }
      ];
  const handleStreakSaved = (nextStreak) => {
    const normalizedNext = normalizeStreak(nextStreak);
    const normalizedPrev = normalizeStreak(studentStreakRef.current);
    setStudentStreak(normalizedNext);
    const todayKey = getLocalDayKey();
    const activeDay = normalizeDayKey(normalizedNext.lastActiveDay);
    const streakIncreased = normalizedNext.current > normalizedPrev.current;
    const isNewRecord = normalizedNext.current > normalizedPrev.best;
    if (streakIncreased && activeDay && activeDay === todayKey) {
      setStreakPopup({
        open: true,
        current: normalizedNext.current,
        best: normalizedNext.best,
        isNewRecord
      });
    }
  };
  const streak = normalizeStreak(studentStreak);
  const todayKey = getLocalDayKey();
  const todayNum = dayKeyToNumber(todayKey);
  const lastActiveKey = normalizeDayKey(streak.lastActiveDay);
  const lastActiveLabel = formatStreakDate(lastActiveKey);
  const lastDayNum = dayKeyToNumber(lastActiveKey);
  let diffDays = Number.isFinite(todayNum) && Number.isFinite(lastDayNum) ? todayNum - lastDayNum : null;
  if (Number.isFinite(diffDays) && diffDays < 0) diffDays = 0;
  const weekStart = getWeekStartKey(todayKey);
  const freezeUsedThisWeek = weekStart && streak.freezeUsedWeekStart === weekStart;
  const freezeAvailable = !freezeUsedThisWeek;
  const displayStreakCurrent = (() => {
    if (!lastActiveKey) return 0;
    if (!Number.isFinite(diffDays) || diffDays <= 1) return streak.current;
    if (diffDays === 2 && freezeAvailable) return streak.current;
    return 0;
  })();
  const streakStatusText = (() => {
    if (!lastActiveKey) return 'Начните решать, чтобы запустить серию.';
    if (diffDays === 0) return 'Сегодняшняя активность засчитана.';
    if (diffDays === 1) return 'Решите сегодня, чтобы сохранить серию.';
    if (diffDays === 2) {
      return freezeAvailable ? 'Заморозка сохранит серию — решите сегодня.' : 'Серия сброшена.';
    }
    if (Number.isFinite(diffDays) && diffDays > 2) return 'Серия сброшена.';
    return 'Продолжайте решать задачи.';
  })();
  const streakWeek = (() => {
    if (!Number.isFinite(todayNum)) return [];
    const lastNum = Number.isFinite(lastDayNum) ? lastDayNum : null;
    const startNum = displayStreakCurrent > 0 && Number.isFinite(lastNum)
      ? lastNum - (displayStreakCurrent - 1)
      : null;
    const freezeDayKey = normalizeDayKey(streak.freezeUsedDay);
    const freezeNum = dayKeyToNumber(freezeDayKey);
    const list = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const dayNum = todayNum - offset;
      const dayKey = numberToDayKey(dayNum);
      const labelRaw = dayKey
        ? new Date(`${dayKey}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' })
        : '';
      const label = labelRaw.replace('.', '').toUpperCase();
      const isInStreak = Number.isFinite(startNum)
        && Number.isFinite(lastNum)
        && dayNum >= startNum
        && dayNum <= lastNum;
      const isFreeze = isInStreak && Number.isFinite(freezeNum) && dayNum === freezeNum;
      list.push({ dayKey, label, isInStreak, isFreeze, isToday: dayNum === todayNum });
    }
    return list;
  })();

  const loadStudents = async (teacherId) => {
    setStudentsLoading(true);
    try {
      const data = await api.getStudents(teacherId);
      setStudents(data);
      setStudentsError('');
      setActiveStudentId((current) => {
        if (data.some((s) => s.id === current)) return current;
        if (storedActiveStudentId && data.some((s) => String(s.id) === storedActiveStudentId)) {
          return storedActiveStudentId;
        }
        return data[0]?.id || null;
      });
    } catch (err) {
      setStudentsError(err?.message || err);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadDeletedStudents = async (teacherId) => {
    setDeletedStudentsLoading(true);
    try {
      const data = await api.getStudents(teacherId, { deletedOnly: true });
      setDeletedStudents(data);
      setDeletedStudentsError('');
    } catch (err) {
      setDeletedStudentsError(err?.message || err);
    } finally {
      setDeletedStudentsLoading(false);
    }
  };

  const loadTeachers = async () => {
    setTeachersLoading(true);
    try {
      const data = await api.getTeachers();
      setTeachers(data);
      setTeachersError('');
    } catch (err) {
      setTeachersError(err?.message || err);
    } finally {
      setTeachersLoading(false);
    }
  };

  const getHomeworkSeenKey = () => `ege_homework_popup_${user.id}`;
  const getHomeworkEntryId = (entry) => String(entry?.id || entry?.issuedAt || '').trim();
  const readHomeworkPopupState = () => {
    try {
      const raw = localStorage.getItem(getHomeworkSeenKey());
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeHomeworkPopupState = (state) => {
    try {
      localStorage.setItem(getHomeworkSeenKey(), JSON.stringify(state));
    } catch {}
  };
  const hasHomeworkContent = (entry) => {
    if (!entry) return false;
    const hasText = typeof entry.homeWork === 'string' && entry.homeWork.trim();
    const hasLinks = (typeof entry.lessonLink === 'string' && entry.lessonLink.trim())
      || (typeof entry.boardLink === 'string' && entry.boardLink.trim());
    const hasGoals = Array.isArray(entry.goals) && entry.goals.length > 0;
    return Boolean(hasText || hasLinks || hasGoals);
  };
  const markHomeworkSeen = (entry) => {
    const id = getHomeworkEntryId(entry);
    if (id) {
      writeHomeworkPopupState({ id, status: 'seen' });
    }
    setHomeworkPopupOpen(false);
  };
  const checkHomeworkPopup = async () => {
    if (user.role !== 'student') return;
    if (!hasStudentSeenTour(user.id)) return;
    try {
      const data = await api.getStudentNextLesson(user.id);
      const latest = data?.latest || null;
      if (!latest || !hasHomeworkContent(latest)) return;
      const latestId = getHomeworkEntryId(latest);
      if (!latestId) return;
      const stored = readHomeworkPopupState();
      if (stored?.id === latestId) {
        if (stored.status === 'pending') {
          setHomeworkPopupEntry(latest);
          setHomeworkPopupOpen(true);
        }
        return;
      }
      writeHomeworkPopupState({ id: latestId, status: 'pending' });
      setHomeworkPopupEntry(latest);
      setHomeworkPopupOpen(true);
    } catch {}
  };

  useEffect(() => {
    if (user.role === 'teacher') {
      loadStudents(user.id);
      loadDeletedStudents(user.id);
    } else {
      setStudents([]);
      setActiveStudentId(null);
      setStudentsError('');
      setStudentsLoading(false);
      setDeletedStudents([]);
      setDeletedStudentsError('');
      setDeletedStudentsLoading(false);
    }
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role === 'admin') {
      loadTeachers();
    } else {
      setTeachers([]);
      setTeachersError('');
      setTeachersLoading(false);
    }
  }, [user.role]);

  useEffect(() => {
    let cancelled = false;
    api.getTaskTitles()
      .then((data) => {
        if (cancelled) return;
        setTaskTitles(data && typeof data === 'object' ? data : {});
      })
      .catch(() => {
        if (!cancelled) setTaskTitles({});
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user.role !== 'student') {
      setGoalTestsDb(null);
      return;
    }
    let cancelled = false;
    api.getTests()
      .then((data) => {
        if (cancelled) return;
        setGoalTestsDb(data && typeof data === 'object' ? data : {});
      })
      .catch(() => {
        if (!cancelled) setGoalTestsDb({});
      });
    return () => { cancelled = true; };
  }, [user.role]);

  useEffect(() => {
    if (user.role !== 'student') {
      setSolvedByTask({});
      setStudentStreak(getDefaultStreak());
      return;
    }
    let cancelled = false;
    api.getStudentData(user.id)
      .then((data) => {
        if (cancelled) return;
        const solved = data?.solvedByTask && typeof data.solvedByTask === 'object'
          ? data.solvedByTask
          : {};
        setSolvedByTask(solved);
        setStudentStreak(normalizeStreak(data?.streak));
      })
      .catch(() => {
        if (!cancelled) {
          setSolvedByTask({});
          setStudentStreak(getDefaultStreak());
        }
      });
    return () => { cancelled = true; };
  }, [user.role, user.id, goalRefreshTick]);

  useEffect(() => {
    if (user.role !== 'student') {
      setGoalCollapsed(false);
      return;
    }
    try {
      const saved = localStorage.getItem('ege_goal_collapsed_v1');
      setGoalCollapsed(saved === '1');
    } catch {}
  }, [user.role]);

  useEffect(() => {
    if (user.role !== 'student') return;
    try {
      localStorage.setItem('ege_goal_collapsed_v1', goalCollapsed ? '1' : '0');
    } catch {}
  }, [goalCollapsed, user.role]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      setIsDesktopWide(window.innerWidth > 1000);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (!isDesktopWide && homeworkPopupOpen) {
      setHomeworkPopupOpen(false);
    }
  }, [isDesktopWide, homeworkPopupOpen]);

  useEffect(() => {
    studentStreakRef.current = studentStreak;
  }, [studentStreak]);

  useEffect(() => {
    if (user.role !== 'teacher') {
      setTeacherNotifs([]);
      teacherReadIdsRef.current = new Set();
      teacherShownIdsRef.current = new Set();
      return;
    }
    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem(`ege_teacher_read_events_${user.id}`) || '[]');
    } catch {}
    const validIds = Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [];
    teacherReadIdsRef.current = new Set(validIds);
    teacherShownIdsRef.current = new Set(validIds);
    setTeacherNotifs([]);
  }, [user.role, user.id]);

  useEffect(() => {
    if (user.role !== 'teacher') return;
    let cancelled = false;

    const fetchEvents = async () => {
      try {
        const events = await api.getTeacherSolvedEvents(user.id, null, 200);
        if (cancelled) return;
        if (Array.isArray(events) && events.length > 0) {
          const readIds = teacherReadIdsRef.current;
          const shownIds = teacherShownIdsRef.current;
          const fresh = events.filter((ev) => ev?.id && !readIds.has(ev.id) && !shownIds.has(ev.id));
          if (fresh.length > 0) {
            const sorted = [...fresh].sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
            sorted.forEach((ev) => shownIds.add(ev.id));
            setTeacherNotifs((prev) => [...sorted, ...prev]);
          }
        }
      } catch {
        // ignore
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user.role, user.id]);

  const handleStudentCreated = (student) => {
    if (!student) return;
    setStudents((prev) => [student, ...prev]);
    setActiveStudentId(student.id);
  };

  const handleStudentDeleted = (payload) => {
    const student = typeof payload === 'string' ? { id: payload } : payload;
    if (!student?.id) return;
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== student.id);
      setActiveStudentId((current) => (current === student.id ? (next[0]?.id || null) : current));
      return next;
    });
    setDeletedStudents((prev) => {
      const filtered = prev.filter((item) => item.id !== student.id);
      return [{ ...student }, ...filtered];
    });
  };

  const handleStudentRestored = (student) => {
    if (!student?.id) return;
    setDeletedStudents((prev) => prev.filter((item) => item.id !== student.id));
    setStudents((prev) => [student, ...prev.filter((item) => item.id !== student.id)]);
    setActiveStudentId((current) => current || student.id);
  };

  const handleStudentUpdated = (student) => {
    if (!student?.id) return;
    setStudents((prev) => prev.map((item) => (item.id === student.id ? { ...item, ...student } : item)));
  };

  const handleTaskTitleUpdate = (number, title) => {
    const key = String(number);
    setTaskTitles((prev) => {
      const next = { ...(prev || {}) };
      if (title && title.trim()) next[key] = title.trim();
      else delete next[key];
      return next;
    });
  };

  const handleProgressSectionChange = (nextSection) => {
    updateUserLocation(user, { progressSection: nextSection });
  };

  const handleTaskStateChange = (nextTask) => {
    if (user.role !== 'student') return;
    updateUserLocation(user, { openTask: nextTask });
    if (!nextTask || nextTask.section !== 'python') {
      updateUserLocation(user, { pythonLocation: null });
      return;
    }
    updateUserLocation(user, {
      pythonLocation: {
        taskNumber: nextTask.taskNumber,
        questionIndex: Number.isFinite(nextTask.questionIndex) ? nextTask.questionIndex : null
      }
    });
  };

  const handleNotesLocationChange = (location) => {
    updateUserLocation(user, { notesLocation: location });
  };

  const handleOpenTask = (taskNumber, levelId, targetQuestions) => {
    const normalizedTaskNumber = normalizeTaskNumber(taskNumber);
    if (!Number.isFinite(normalizedTaskNumber)) return;
    const pythonTask = isPythonTaskNumber(normalizedTaskNumber);
    if (user.role !== 'student') {
      setView(pythonTask ? 'python' : 'progress');
      setMenuOpen(false);
      return;
    }
    const nextTask = {
      taskNumber: normalizedTaskNumber,
      levelId: pythonTask ? PYTHON_LEVEL_ID : levelId,
      targetQuestions: Array.isArray(targetQuestions) ? targetQuestions : null,
      section: pythonTask ? 'python' : 'progress',
      questionIndex: null
    };
    setPendingOpenTask(nextTask);
    setView(pythonTask ? 'python' : 'progress');
    setMenuOpen(false);
    updateUserLocation(user, { view: pythonTask ? 'python' : 'progress', openTask: nextTask });
  };

  const formatDaysText = (days) => {
    const value = Number(days) || 0;
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} день`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${value} дня`;
    return `${value} дней`;
  };

  const refreshGoalState = async () => {
    if (user.role !== 'student') return;
    try {
      const data = await api.getStudentNextLesson(user.id);
      const list = Array.isArray(data?.homeworks) ? data.homeworks : [];
      const sorted = [...list].sort((a, b) => new Date(b?.issuedAt || 0) - new Date(a?.issuedAt || 0));
      const normalizeEntryGoals = (item) => {
        if (!item) return [];
        if (Array.isArray(item.goals) && item.goals.length > 0) {
          return item.goals
            .map((goal) => {
              const normalizedTaskNumber = normalizeTaskNumber(goal?.taskNumber);
              const taskNumberValue = Number.isFinite(normalizedTaskNumber)
                ? normalizedTaskNumber
                : null;
              const isPythonGoal = taskNumberValue ? isPythonTaskNumber(taskNumberValue) : false;
              return {
                taskNumber: taskNumberValue,
                levelId: isPythonGoal ? PYTHON_LEVEL_ID : (goal?.levelId || 'basic'),
                targetQuestions: Array.isArray(goal?.targetQuestions) ? goal.targetQuestions : [],
                includeAll: Boolean(goal?.includeAll)
              };
            })
            .filter((goal) => Number.isFinite(goal.taskNumber));
        }
        if (item.taskNumber && item.levelId) {
          const normalizedTaskNumber = Number.isFinite(normalizeTaskNumber(item.taskNumber))
            ? normalizeTaskNumber(item.taskNumber)
            : Number(item.taskNumber);
          const isPythonGoal = isPythonTaskNumber(normalizedTaskNumber);
          return [{
            taskNumber: normalizedTaskNumber,
            levelId: isPythonGoal ? PYTHON_LEVEL_ID : item.levelId,
            targetQuestions: Array.isArray(item.targetQuestions) ? item.targetQuestions : [],
            includeAll: Boolean(item.includeAll)
          }];
        }
        return [];
      };

      const entry = sorted.find((item) => normalizeEntryGoals(item).length > 0);
      if (!entry) {
        setGoalState(null);
        return;
      }
      const goals = normalizeEntryGoals(entry);
      if (goals.length === 0) {
        setGoalState(null);
        return;
      }
      const unique = [];
      const seen = new Set();
      goals.forEach((goal) => {
        const key = `${goal.taskNumber}|${goal.levelId}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({ key, taskNumber: goal.taskNumber, levelId: goal.levelId });
      });
      const solvedResults = await Promise.all(
        unique.map((item) => api.getSolvedQuestions(user.id, item.taskNumber, item.levelId).catch(() => []))
      );
      const solvedMap = {};
      unique.forEach((item, idx) => {
        const list = Array.isArray(solvedResults[idx]) ? solvedResults[idx] : [];
        solvedMap[item.key] = new Set(list.map((val) => String(val)));
      });

      const goalsWithStatus = goals.map((goal) => {
        const taskNumber = Number.isFinite(normalizeTaskNumber(goal.taskNumber))
          ? normalizeTaskNumber(goal.taskNumber)
          : goal.taskNumber;
        const isPythonGoal = isPythonTaskNumber(taskNumber);
        const levelId = isPythonGoal ? PYTHON_LEVEL_ID : goal.levelId;
        const questionsList = goalTestsDb?.[String(taskNumber)]?.[levelId] || [];
        const totalCount = questionsList.length;
        const targetNumbers = goal.includeAll
          ? (totalCount > 0 ? Array.from({ length: totalCount }, (_, i) => i + 1) : [])
          : Array.from(new Set(
              (Array.isArray(goal.targetQuestions) ? goal.targetQuestions : [])
                .map((val) => Number(val))
                .filter((val) => Number.isFinite(val) && val > 0)
            )).sort((a, b) => a - b);
        const solvedSet = solvedMap[`${taskNumber}|${levelId}`] || new Set();
        const targetStatus = targetNumbers.map((num) => {
          const question = questionsList[num - 1];
          const qId = question?.id;
          const solved = qId ? solvedSet.has(String(qId)) : false;
          return { num, solved };
        });
        const completed = targetStatus.length > 0 && targetStatus.every((item) => item.solved);
        const pythonTask = isPythonGoal ? getPythonTaskInfo(taskNumber) : null;
        const taskInfo = !isPythonGoal
          ? tasksWithTitles.find((task) => Number(task.number) === Number(taskNumber))
          : null;
        const taskTitle = pythonTask?.title || taskInfo?.title || `Задание ${formatTaskNumber(taskNumber) || taskNumber}`;
        const levelLabel = isPythonGoal
          ? 'Python'
          : (LEVELS[levelId?.toUpperCase()]?.label || levelId);
        return {
          taskNumber,
          levelId,
          levelLabel,
          taskTitle,
          targetNumbers,
          targetStatus,
          completed,
          includeAll: goal.includeAll
        };
      });

      const filteredGoals = goalsWithStatus.filter(
        (goal) => goal.includeAll || (Array.isArray(goal.targetNumbers) && goal.targetNumbers.length > 0)
      );
      if (filteredGoals.length === 0) {
        setGoalState(null);
        return;
      }
      const completed = filteredGoals.length > 0 && filteredGoals.every((goal) => goal.completed);
      setGoalState({
        entry,
        goals: filteredGoals,
        completed,
      });
    } catch {
      setGoalState(null);
    }
  };

  useEffect(() => {
    if (user.role !== 'student') return;
    refreshGoalState();
  }, [user.role, user.id, goalRefreshTick, goalTestsDb, taskTitles]);

  useEffect(() => {
    if (user.role !== 'student') return;
    checkHomeworkPopup();
    const intervalId = setInterval(() => {
      checkHomeworkPopup();
    }, 60000);
    return () => clearInterval(intervalId);
  }, [user.role, user.id]);

  const goalGoals = Array.isArray(goalState?.goals) ? goalState.goals : [];
  const goalTotals = goalGoals.reduce(
    (acc, goal) => {
      const total = Array.isArray(goal?.targetStatus) ? goal.targetStatus.length : 0;
      const solved = Array.isArray(goal?.targetStatus)
        ? goal.targetStatus.filter((item) => item.solved).length
        : 0;
      return { total: acc.total + total, solved: acc.solved + solved };
    },
    { total: 0, solved: 0 }
  );

  const dismissTeacherNotif = (eventId) => {
    if (!eventId) return;
    setTeacherNotifs((prev) => prev.filter((note) => note.id !== eventId));
    const readIds = teacherReadIdsRef.current;
    readIds.add(eventId);
    if (readIds.size > 500) {
      const trimmed = Array.from(readIds).slice(-500);
      teacherReadIdsRef.current = new Set(trimmed);
    }
    try {
      localStorage.setItem(
        `ege_teacher_read_events_${user.id}`,
        JSON.stringify(Array.from(teacherReadIdsRef.current))
      );
    } catch {}
  };

  return (
    <div className="app-min-h bg-gray-50 flex font-sans">
      {user.role === 'teacher' && teacherNotifs.length > 0 && (
        <div className="fixed top-4 right-4 z-[1200] space-y-3 max-w-[320px]">
          {teacherNotifs.map((note) => {
            const levelLabel = note.levelId === PYTHON_LEVEL_ID
              ? 'Python'
              : (LEVELS[note.levelId?.toUpperCase()]?.label || note.levelId || '');
            const questionPart = note.questionNumber ? ` · вопрос ${note.questionNumber}` : '';
            return (
              <div key={note.id} className="rounded-2xl border border-purple-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-700 relative">
                <button
                  type="button"
                  onClick={() => dismissTeacherNotif(note.id)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                  aria-label="Закрыть уведомление"
                >
                  <X size={16} />
                </button>
                <div className="text-xs font-bold uppercase tracking-widest text-purple-500">Новая отметка</div>
                <div className="mt-1 font-semibold text-gray-900 truncate">
                  {note.studentName || 'Ученик'}
                </div>
                <div className="text-xs text-gray-500">
                  {`Решено: задание ${formatTaskNumber(note.taskNumber) || note.taskNumber}${levelLabel ? ` · ${levelLabel}` : ''}${questionPart}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {streakPopup.open && (
          <div
            className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/30 streak-overlay"
            onClick={() => setStreakPopup((prev) => ({ ...prev, open: false }))}
          >
            <div
              className="w-[280px] rounded-[32px] bg-white px-6 py-6 text-center shadow-2xl streak-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 streak-mascot">
                <img src={mascotApproval} alt="Маскот" className="h-16 w-16 object-contain" />
              </div>
              <div className="text-5xl font-extrabold text-purple-600">{streakPopup.current}</div>
              <div className="mt-1 text-sm font-semibold text-purple-600">
                {`${formatDaysText(streakPopup.current)} подряд`}
              </div>
              <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-2 text-[11px] text-purple-700 shadow-sm">
                {streakPopup.isNewRecord
                  ? `Новый рекорд! ${streakPopup.current} ${formatDaysText(streakPopup.current)} подряд.`
                  : `Отлично! Серия ${formatDaysText(streakPopup.current)} подряд.`}
              </div>
              <button
                type="button"
                onClick={() => setStreakPopup((prev) => ({ ...prev, open: false }))}
                className="mt-4 w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
              >
                Ок
              </button>
            </div>
          </div>
      )}
      <StudentTour
        user={user}
        view={view}
        setView={setView}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onFinish={() => checkHomeworkPopup()}
      />
      {/*
        Временно скрыто окно "квеста" (домашки).
        Вернуть можно, раскомментировав блок ниже.
      */}
      {/*
        {user.role === 'student' && isDesktopWide && homeworkPopupOpen && homeworkPopupEntry && (
          <NewHomeworkModal
            entry={homeworkPopupEntry}
            open={homeworkPopupOpen}
            testsDb={goalTestsDb}
            solvedByTask={solvedByTask}
            onClose={() => markHomeworkSeen(homeworkPopupEntry)}
            onOpenTask={handleOpenTask}
            onOpenSchedule={() => {
              setView('schedule');
              setMenuOpen(false);
              markHomeworkSeen(homeworkPopupEntry);
            }}
          />
        )}
      */}
      <aside className={`fixed md:sticky md:top-0 z-40 bg-white w-64 app-h border-r transition-transform flex flex-col ${menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b flex items-center gap-2 font-bold text-xl text-purple-600 shrink-0">
          <CheckCircle className="fill-purple-600 text-white"/> Иван на сотку
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto" data-tour="nav">
          {nav.map(n => (
            <button key={n.id} onClick={() => { setView(n.id); setMenuOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl font-medium ${view === n.id ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50'}`}>
              <n.icon size={20}/> {n.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t bg-white shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-700">{user.name[0]}</div>
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {user.role === 'admin' ? 'Администратор' : (user.role === 'teacher' ? 'Преподаватель' : 'Ученик')}
              </p>
            </div>
          </div>
          <button onClick={onLogout} className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium"><LogOut size={16}/> Выйти</button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col app-h overflow-hidden">
        <header className="md:hidden bg-white border-b p-4 flex justify-between items-center">
          <span className="font-bold text-purple-600">Иван на сотку</span>
          <button onClick={() => setMenuOpen(!menuOpen)}><Menu/></button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8" data-tour="main">
          {user.role === 'student' && (
            <div className="mb-3 flex justify-end">
              <div className="relative group">
                <div
                  className={`flex items-center gap-2 rounded-full border border-purple-200 bg-white px-3.5 py-2 text-sm font-semibold text-purple-600 shadow-sm cursor-default streak-badge ${displayStreakCurrent > 0 ? 'streak-badge--active' : ''}`}
                  aria-label={`Серия: ${displayStreakCurrent}`}
                >
                  <Flame
                    size={18}
                    className={`${displayStreakCurrent > 0 ? 'text-purple-500 streak-flame' : 'text-gray-300'}`}
                    fill={displayStreakCurrent > 0 ? 'currentColor' : 'none'}
                    stroke={displayStreakCurrent > 0 ? 'currentColor' : 'currentColor'}
                  />
                  <span className="text-gray-900">{displayStreakCurrent}</span>
                </div>
                <div className="pointer-events-none absolute right-0 z-50 mt-3 w-72 origin-top-right translate-y-1 rounded-3xl border border-purple-200 bg-white p-4 text-gray-700 shadow-xl opacity-0 transition duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 streak-popover">
                  <div className="absolute right-6 -top-1 h-3 w-3 rotate-45 border-l border-t border-purple-200 bg-white" />
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                      <Flame size={22} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-purple-700">Серия</div>
                      <div className="text-xs text-gray-500">Решайте каждый день, чтобы поддерживать серию.</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <div className="text-3xl font-bold text-gray-900">{displayStreakCurrent}</div>
                    <div className="text-xs text-gray-500">дней подряд</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{streakStatusText}</div>
                  <div className="mt-3 grid grid-cols-7 gap-2 text-[10px] text-gray-400">
                    {streakWeek.map((day) => (
                      <div key={day.dayKey || day.label} className="flex flex-col items-center gap-1">
                        <span className="uppercase">{day.label}</span>
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                            day.isInStreak
                              ? 'border-purple-400 bg-purple-500 text-white'
                              : 'border-gray-200 bg-gray-100 text-gray-400'
                          }`}
                        >
                          {day.isInStreak && (
                            day.isFreeze ? <Snowflake size={14} /> : <Check size={16} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
                    <span>{`Рекорд: ${streak.best}`}</span>
                    <span>{`Заморозка: ${freezeAvailable ? 'доступна' : 'использована'}`}</span>
                  </div>
                  {lastActiveLabel && (
                    <div className="mt-1 text-[11px] text-gray-400">{`Последняя активность: ${lastActiveLabel}`}</div>
                  )}
                </div>
              </div>
            </div>
          )}
          {user.role === 'student' && goalState?.entry && !goalState.completed && goalGoals.length > 0 && (
            <div className="sticky top-0 z-30 mb-4">
              {goalCollapsed ? (
                <div className="rounded-2xl border border-purple-200 bg-white/90 px-4 py-3 text-sm text-gray-700 shadow-sm flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Цель недели</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {goalTotals.total > 0
                        ? `Выполнено ${goalTotals.solved}/${goalTotals.total}`
                        : `Целей: ${goalGoals.length}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const firstGoal = goalGoals[0];
                        if (firstGoal) {
                          handleOpenTask(firstGoal.taskNumber, firstGoal.levelId, firstGoal.targetNumbers);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 shadow-sm"
                    >
                      Перейти
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoalCollapsed(false)}
                      className="px-3 py-2 rounded-xl border border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                    >
                      Развернуть
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-purple-200 bg-gradient-to-r from-purple-50 via-white to-purple-50 px-5 py-4 text-sm text-gray-700 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-widest text-purple-600">Цель недели</div>
                      <div className="mt-1 text-base font-semibold text-gray-900">
                        {`За ${formatDaysText(goalState.entry?.daysToComplete || 7)} выполнить эти задания`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setGoalCollapsed(true)}
                        className="px-3 py-2 rounded-xl border border-purple-200 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                      >
                        Свернуть
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {goalGoals.map((goal, index) => {
                      const hasTargets = goal.targetNumbers?.length > 0 || goal.includeAll;
                      const pythonTask = isPythonTaskNumber(goal.taskNumber)
                        ? getPythonTaskInfo(goal.taskNumber)
                        : null;
                      const taskDisplay = pythonTask?.displayNumber || formatTaskNumber(goal.taskNumber) || goal.taskNumber;
                      return (
                        <div key={`${goal.taskNumber}-${goal.levelId}-${index}`} className="rounded-2xl border border-purple-100 bg-white/80 px-4 py-3 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="text-xs text-gray-500">
                                {`Задание ${taskDisplay} · ${goal.levelLabel}`}
                              </div>
                              <div className="text-xs text-gray-500">
                                {`Тема: ${goal.taskTitle}`}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenTask(goal.taskNumber, goal.levelId, goal.targetNumbers)}
                              className="px-3 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 shadow-sm"
                            >
                              Перейти
                            </button>
                          </div>
                          {hasTargets && (
                            <div className="space-y-2">
                              <div className="text-[11px] font-semibold text-purple-700">Цель — решить эти задания:</div>
                              {goal.targetNumbers?.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {goal.targetStatus.map((item) => (
                                    <span
                                      key={item.num}
                                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                                        item.solved
                                          ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                          : 'border-purple-200 bg-white text-purple-700'
                                      }`}
                                    >
                                      №{item.num}{item.solved ? ' ✓' : ''}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px] text-purple-600">Все задания этого уровня</div>
                              )}
                              {goal.targetNumbers?.length > 0 && (
                                <div className="text-[11px] text-purple-600">
                                  Выполнено {goal.targetStatus.filter((item) => item.solved).length}/{goal.targetStatus.length}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {view === 'schedule' && (
            <ScheduleSection
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              onOpenTask={user.role === 'student' ? handleOpenTask : null}
              solvedRefreshKey={goalRefreshTick}
              tasks={tasksWithTitles}
            />
          )}
          {view === 'progress' && (
            <ProgressSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              tasks={tasksWithTitles}
              onTaskTitleUpdate={handleTaskTitleUpdate}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              initialSection={initialProgressSection}
              onSectionChange={handleProgressSectionChange}
              onTaskStateChange={handleTaskStateChange}
              onStreakSaved={handleStreakSaved}
            />
          )}
          {view === 'python' && (
            <PythonSection
              progress={progress}
              onUpdateProgress={(...args) => {
                onUpdateProgress(...args);
                if (user.role === 'student') setGoalRefreshTick((prev) => prev + 1);
              }}
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              openTask={pendingOpenTask}
              onOpenTaskHandled={() => setPendingOpenTask(null)}
              onTaskStateChange={handleTaskStateChange}
              onStreakSaved={handleStreakSaved}
            />
          )}
          {view === 'notes' && (
            <NotesSection
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
              initialLocation={initialNotesLocation}
              onLocationChange={handleNotesLocationChange}
            />
          )}
          {view === 'teacher' && (
            <TeacherPanel
              role={user.role}
              students={studentsWithNicknames}
              studentsLoading={studentsLoading}
              studentsError={studentsError}
              deletedStudents={deletedStudents}
              deletedStudentsLoading={deletedStudentsLoading}
              deletedStudentsError={deletedStudentsError}
              tasks={tasksWithTitles}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              onStudentCreated={handleStudentCreated}
              onStudentDeleted={handleStudentDeleted}
              onStudentRestored={handleStudentRestored}
              onStudentUpdated={handleStudentUpdated}
              teacherId={user.role === 'teacher' ? user.id : null}
            />
          )}
          {view === 'admin' && (
            <AdminPanel
              teachers={teachers}
              teachersLoading={teachersLoading}
              teachersError={teachersError}
              onTeachersChanged={loadTeachers}
            />
          )}
        </main>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(() => {
    if (typeof localStorage === 'undefined') return null;
    try {
      const savedUser = localStorage.getItem('ege_user_session');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [progress, setProgress] = useState({});

  useEffect(() => {
    const updateVh = () => {
      if (typeof window === 'undefined') return;
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--app-vh', `${vh}px`);
    };
    updateVh();
    window.addEventListener('resize', updateVh);
    window.addEventListener('orientationchange', updateVh);
    return () => {
      window.removeEventListener('resize', updateVh);
      window.removeEventListener('orientationchange', updateVh);
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    let cancelled = false;
    api.getStudentProgress(user.id)
      .then((data) => {
        if (cancelled) return;
        setProgress(data || {});
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setProgress({});
      });
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  const handleLogin = (u) => {
    setUser(u);
    setProgress({});
    localStorage.setItem('ege_user_session', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    setProgress({});
    localStorage.removeItem('ege_user_session');
  };

  const updateProgress = async (taskId, val, options = {}) => {
    if (!user || user.role !== 'student') return;
    setProgress((prev) => ({ ...prev, [taskId]: val }));
    if (!options?.skipServer) {
      try {
        await api.updateStudentProgress(user.id, taskId, val);
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return (
    <>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes shine { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        @keyframes streakPop { 0% { opacity:0; transform: translateY(8px) scale(0.94); } 60% { opacity:1; transform: translateY(-2px) scale(1.03); } 100% { opacity:1; transform: translateY(0) scale(1); } }
        @keyframes streakBackdrop { from { opacity:0; } to { opacity:1; } }
        @keyframes streakPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(168, 85, 247, 0.35); } 50% { box-shadow: 0 0 0 8px rgba(168, 85, 247, 0); } }
        @keyframes streakFlicker { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.04); } }
        @keyframes streakPopover { from { opacity:0; transform: translateY(6px) scale(0.98); } to { opacity:1; transform: translateY(0) scale(1); } }

        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .streak-badge { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .streak-badge--active { animation: streakPulse 2.2s ease-in-out infinite; }
        .streak-flame { transform-origin: center bottom; animation: streakFlicker 1.6s ease-in-out infinite; }
        .group:hover .streak-popover { animation: streakPopover 0.2s ease-out; }
        .streak-overlay { animation: streakBackdrop 0.18s ease-out; }
        .streak-card { animation: streakPop 0.28s ease-out; }
        .streak-mascot { animation: streakFlicker 2.4s ease-in-out infinite; }
      `}</style>
      <DashboardLayout user={user} onLogout={handleLogout} progress={progress} onUpdateProgress={updateProgress} />
    </>
  );
};

export default App;
