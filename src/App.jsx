import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism-tomorrow.css';
import { 
  BookOpen, BarChart2, LogOut, Download, FileText, CheckCircle, 
  Menu, X, ChevronRight, Folder, FolderPlus, Upload, 
  ArrowLeft, Trash2, PlayCircle, Check, Plus, 
  Settings, Save, Calendar, RefreshCcw
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

// Заглушка списка заданий
const MOCK_TASKS = Array.from({ length: 27 }, (_, i) => ({
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

// Начальная база вопросов
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
  getStudents: async (teacherId) => {
    const params = new URLSearchParams();
    if (teacherId) params.append('teacherId', teacherId);
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
  getTasks: () => new Promise(r => setTimeout(() => r(MOCK_TASKS), 600)),
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
  solveQuestion: async (payload) => {
    const res = await fetch('/api/progress/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    return parseJsonResponse(res);
  },
  getSolvedQuestions: async (studentId, taskNumber, levelId) => {
    const params = new URLSearchParams();
    if (studentId) params.append('studentId', studentId);
    if (taskNumber) params.append('taskNumber', String(taskNumber));
    if (levelId) params.append('levelId', String(levelId));
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

const MAX_TASK_BYTES = 100 * 1024 * 1024;

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
    title: 'Файлы',
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
  activeStudentId,
  onSelectStudent,
  onStudentCreated,
  onStudentDeleted,
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
  const [teacherCodeForm, setTeacherCodeForm] = useState({ current: '', next: '', repeat: '' });
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [teacherCodeSuccess, setTeacherCodeSuccess] = useState('');
  const [teacherCodeSaving, setTeacherCodeSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentNickname, setEditStudentNickname] = useState('');
  const [editStudentError, setEditStudentError] = useState('');
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [questionScreenshots, setQuestionScreenshots] = useState([]);
  const [questionFiles, setQuestionFiles] = useState([]);
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
  const [answer, setAnswer] = useState("");

  const handleAddQuestion = async () => {
    if (!answer.trim()) {
      alert("Введите правильный ответ");
      return;
    }
    if (!question.trim() && questionScreenshots.length === 0 && questionFiles.length === 0) {
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
          questionFiles.map((file) => api.uploadTestFile(file))
        );
      }
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }

    const newQuestion = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim(),
      screenshots: uploadedScreenshots,
      files: uploadedFiles
    };

    const updatedDb = { ...(testDb || {}) };
    if (!updatedDb[selectedTask]) updatedDb[selectedTask] = { basic: [], advanced: [], expert: [] };
    if (!updatedDb[selectedTask][selectedLevel]) updatedDb[selectedTask][selectedLevel] = [];
    
    updatedDb[selectedTask][selectedLevel].push(newQuestion);
    
    setTestDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
    } catch (err) {
      setQuestionUploadError(err?.message || err);
      setIsUploadingQuestion(false);
      return;
    }
    
    // Reset form
    setQuestion("");
    setAnswer("");
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
    setIsUploadingQuestion(false);
  };

  const handleDeleteQuestion = async (taskId, level, qId) => {
    if(!confirm("Удалить этот вопрос?")) return;
    const updatedDb = { ...(testDb || {}) };
    const removed = updatedDb[taskId][level].find(q => q.id === qId);
    updatedDb[taskId][level] = updatedDb[taskId][level].filter(q => q.id !== qId);
    setTestDb(updatedDb);
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

  const addScreenshotFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((file) => file.type?.startsWith('image/'));
    if (incoming.length === 0) return;
    setQuestionScreenshots((prev) => [...prev, ...incoming]);
  };

  const addExtraFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (incoming.length === 0) return;
    setQuestionFiles((prev) => [...prev, ...incoming]);
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
    if (!confirm(`Удалить ученика "${student.name}"? Все файлы и прогресс будут удалены.`)) return;
    setStudentActionLoading(true);
    try {
      await api.deleteStudent(student.id);
      onStudentDeleted?.(student.id);
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
              {MOCK_TASKS.map(t => (
                <option key={t.id} value={t.number}>Задание {t.number}: {t.title}</option>
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
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Plus size={20} className="text-purple-600"/>
              Добавить вопрос
            </h3>
            
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
                      {questionFiles.map((file, idx) => (
                        <div key={`${file.name}-${idx}`} className="flex items-center justify-between text-xs text-gray-500">
                          <span className="truncate">• {file.name}</span>
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
                </div>
              </div>
              {questionUploadError && <p className="text-xs text-red-500">{questionUploadError}</p>}

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Правильный ответ</label>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                  placeholder="Введите правильный ответ"
                />
              </div>

              <div className="pt-2">
                <Button onClick={handleAddQuestion} className="w-full" disabled={isUploadingQuestion}>
                  <Save size={18} /> {isUploadingQuestion ? 'Загрузка...' : 'Сохранить вопрос в базу'}
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
                <div key={q.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-start gap-4">
                  <div>
                    <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                    <p className="text-gray-800 font-medium mb-1">{q.question || 'Вопрос без текста'}</p>
                    <div className="text-xs text-gray-500 flex gap-2">
                       <span>Ответ: <span className="text-green-600 font-bold">{q.answer || (Array.isArray(q.options) ? q.options[q.correctIndex] : '')}</span></span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteQuestion(selectedTask, selectedLevel, q.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 size={18} />
                  </button>
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
const StudentTestModal = ({ task, onClose, onComplete, progress, studentId, testDb }) => {
  const [stage, setStage] = useState('select_level'); // select_level | testing
  const [level, setLevel] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { [idx]: optionIdx | string }
  const [results, setResults] = useState({}); // { [idx]: boolean }
  const [solvedIds, setSolvedIds] = useState(new Set());
  const [expandedImage, setExpandedImage] = useState(null);

  const currentMastery = progress[task.id] || 0;

  const startTest = async (lvlId) => {
    if (!testDb) {
      alert("База тестов еще загружается. Попробуйте чуть позже.");
      return;
    }

    const qs = testDb[task.number]?.[lvlId] || [];
    
    if (qs.length === 0) {
      alert("Учитель еще не загрузил задания для этого уровня.");
      return;
    }

    setQuestions(qs);
    setLevel(lvlId);
    setCurrentIndex(0);
    setUserAnswers({});
    setResults({});
    setSolvedIds(new Set());
    setStage('testing');

    if (studentId) {
      try {
        const solved = await api.getSolvedQuestions(studentId, task.number, lvlId);
        setSolvedIds(new Set((solved || []).map((id) => String(id))));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const normalizeAnswer = (value) => {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  };

  const handleCheck = async () => {
    const currentQuestion = questions[currentIndex];
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const expectedAnswer = currentQuestion?.answer ??
      (Array.isArray(currentQuestion?.options) ? currentQuestion.options[currentQuestion.correctIndex] : '');
    const answerValue = userAnswers[currentIndex];

    if (!String(answerValue ?? '').trim()) return;
    
    const correct = normalizeAnswer(answerValue) === normalizeAnswer(expectedAnswer);
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
          });
          setSolvedIds((prev) => {
            const next = new Set(prev);
            next.add(String(currentQuestion.id));
            return next;
          });
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
            <p className="text-gray-500">Задание №{task.number}: {task.title}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.values(LEVELS).map((lvl) => {
              const isCompleted = currentMastery >= lvl.maxScore;

              return (
                <div 
                  key={lvl.id}
                  onClick={() => startTest(lvl.id)}
                  className={`border-2 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all hover:scale-105 ${isCompleted ? 'border-green-200 bg-green-50 opacity-80' : 'hover:shadow-lg bg-white'} ${lvl.color.replace('bg-', 'border-')}`}
                >
                  <div>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${lvl.color}`}>
                      {isCompleted ? <Check size={20} /> : <PlayCircle size={20} />}
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{lvl.label}</h3>
                    <p className="text-xs text-gray-500">
                      {lvl.id === 'basic' && "Базовые прототипы."}
                      {lvl.id === 'advanced' && "Усложненные условия."}
                      {lvl.id === 'expert' && "Гробы с основной волны."}
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
    const expectedAnswer = currentQuestion?.answer ??
      (Array.isArray(currentQuestion?.options) ? currentQuestion.options[currentQuestion.correctIndex] : '');
    const currentId = String(currentQuestion?.id ?? currentIndex);
    const isSolved = solvedIds.has(currentId);
    const answerValue = isSolved ? String(expectedAnswer ?? '') : String(userAnswers[currentIndex] ?? '');
    const screenshots = (Array.isArray(currentQuestion?.screenshots) ? currentQuestion.screenshots : [])
      .map((img) => ({ ...img, url: withStudentId(img?.url, studentId) }));
    const extraFiles = (Array.isArray(currentQuestion?.files) ? currentQuestion.files : [])
      .map((file) => ({ ...file, url: withStudentId(file?.url, studentId) }));
    const isAnswerReady = isSolved ? true : Boolean(answerValue.trim());
    const computedChecked = isSolved || isChecked;
    const computedCorrect = isSolved ? true : isCorrect;

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
            {computedChecked && (
              <div className={`text-sm ${computedCorrect ? 'text-green-600' : 'text-red-600'}`}>
                {computedCorrect ? 'Верно!' : `Неверно. Правильный ответ: ${expectedAnswer || '—'}`}
              </div>
            )}
            </div>
          </div>

          <Button 
            onClick={computedChecked ? handleNext : handleCheck} 
            disabled={!computedChecked && !isAnswerReady} 
            className="w-full"
            variant={computedChecked ? (computedCorrect ? 'success' : 'danger') : 'primary'}
          >
            {!computedChecked ? 'Проверить' : (
              currentIndex < questions.length - 1 
                ? (computedCorrect ? 'Верно! Следующий вопрос' : 'Ошибка. Следующий вопрос')
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans">
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
  activeStudentId,
  onSelectStudent,
  studentsLoading
}) => {
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [section, setSection] = useState('progress');
  const [studentData, setStudentData] = useState({ progress: {}, notes: '', notesByTask: {}, mocks: [] });
  const [dataError, setDataError] = useState('');
  const [testsDb, setTestsDb] = useState(null);
  const [testsDbError, setTestsDbError] = useState('');
  const [notesSavingId, setNotesSavingId] = useState(null);
  const [mockForm, setMockForm] = useState({ date: '', score: '', comment: '' });
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;

  useEffect(() => { api.getTasks().then(setTasks); }, []);

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
  }, [section, effectiveStudentId]);

  const progressMap = role === 'teacher'
    ? (studentData.progress || {})
    : (Object.keys(progress || {}).length ? progress : (studentData.progress || {}));

  const totalMastery = (() => {
    const list = tasks.length ? tasks : MOCK_TASKS;
    if (!list.length) return 0;
    const total = list.reduce((sum, task) => {
      const val = Number(progressMap[task.id] || 0);
      return sum + (Number.isFinite(val) ? Math.max(0, Math.min(100, val)) : 0);
    }, 0);
    return Math.round((total / list.length) * 10) / 10;
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

  const saveTaskNote = async (taskNumber, note) => {
    if (!effectiveStudentId || role !== 'teacher') return;
    const nextNotes = { ...(studentData.notesByTask || {}) };
    if (note) nextNotes[taskNumber] = note;
    else delete nextNotes[taskNumber];
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
                {'\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u0437\u0430\u0447\u0451\u0442'}
              </div>
              <span className="text-sm text-gray-500">{'\u041e\u0431\u0449\u0438\u0439 \u043f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u0415\u0413\u042d'}</span>
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
            <span>{'\u0421\u043e\u0431\u0435\u0440\u0438 \u0432\u0441\u0435 \u0437\u0430\u0434\u0430\u043d\u0438\u044f, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u043a\u0440\u044b\u0442\u044c \u044d\u0442\u043e\u0442 \u0443\u0440\u043e\u0432\u0435\u043d\u044c'}</span>
            <span>{'0% \u2014 \u0441\u0442\u0430\u0440\u0442 \u2022 100% \u2014 \u043f\u043e\u0431\u0435\u0434\u0430'}</span>
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
            {tasks.map((task) => {
              const val = progressMap[task.id] || 0;
              const clickable = role === 'student';
              return (
                <Card
                  key={task.id}
                  className="group relative"
                  onClick={clickable ? () => setActiveTask(task) : undefined}
                >
                  <div className="flex justify-between mb-2">
                    <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-bold">№{task.number}</span>
                    <span className="font-bold text-gray-700">{val}%</span>
                  </div>
                  <h3 className="font-bold text-gray-800 truncate">{task.title}</h3>
                  <ProgressBar value={val} />

                  {clickable && (
                    <div className="absolute inset-0 bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                      <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                        <PlayCircle size={20} /> Решать
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {role === 'student' && activeTask && (
        <StudentTestModal 
          task={activeTask} 
          onClose={() => setActiveTask(null)}
          progress={progressMap}
          studentId={studentId}
          testDb={testsDb}
          onComplete={(taskId, score, options) => {
            onUpdateProgress(taskId, score, options);
            // setActiveTask(null); // Убрали закрытие, чтобы можно было решать дальше
          }}
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
            {Array.from({ length: 27 }, (_, i) => i + 1).map((num) => {
              const note = (studentData.notesByTask || {})[num] || '';
              const hasNote = Boolean(note && note.trim());
              return (
                <div
                  key={num}
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
                        {num}
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
                        setStudentData((prev) => ({
                          ...prev,
                          notesByTask: { ...(prev.notesByTask || {}), [num]: value }
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

const ScheduleSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading
}) => {
  const [nextLesson, setNextLesson] = useState({ homeWork: '', lessonLink: '', boardLink: '' });
  const [form, setForm] = useState({ homeWork: '', lessonLink: '', boardLink: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;

  const loadNextLesson = async () => {
    if (!effectiveStudentId) {
      setNextLesson({ homeWork: '', lessonLink: '', boardLink: '' });
      setForm({ homeWork: '', lessonLink: '', boardLink: '' });
      return;
    }
    setLoading(true);
    try {
      const data = await api.getStudentNextLesson(effectiveStudentId);
      const safeData = {
        homeWork: data?.homeWork || '',
        lessonLink: data?.lessonLink || '',
        boardLink: data?.boardLink || ''
      };
      setNextLesson(safeData);
      if (role === 'teacher') setForm(safeData);
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

  const handleSave = async () => {
    if (!effectiveStudentId || role !== 'teacher') return;
    setSaving(true);
    try {
      const updated = await api.updateStudentNextLesson(effectiveStudentId, {
        homeWork: form.homeWork,
        lessonLink: form.lessonLink,
        boardLink: form.boardLink
      });
      const safeData = {
        homeWork: updated?.homeWork || '',
        lessonLink: updated?.lessonLink || '',
        boardLink: updated?.boardLink || ''
      };
      setNextLesson(safeData);
      setForm(safeData);
      setError('');
    } catch (err) {
      setError(err?.message || err);
    } finally {
      setSaving(false);
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

      {role === 'teacher' && (
        <Card className="space-y-3">
          <h3 className="text-lg font-bold text-gray-800">Обновить данные</h3>
          <textarea
            value={form.homeWork}
            onChange={(e) => setForm((prev) => ({ ...prev, homeWork: e.target.value }))}
            placeholder="Домашка на следующий урок"
            className="w-full min-h-[120px] px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none resize-none"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <Save size={16} /> {saving ? 'Сохранение...' : 'Сохранить'}
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
        ) : (
          <>
            <div className="rounded-xl border bg-gray-50 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Домашка</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {nextLesson.homeWork ? nextLesson.homeWork : 'Домашка пока не задана.'}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {nextLesson.lessonLink ? (
                <a
                  href={normalizeUrl(nextLesson.lessonLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-semibold text-sm hover:border-purple-400"
                >
                  Ссылка на занятие
                </a>
              ) : (
                <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">Ссылка на занятие не указана</div>
              )}
              {nextLesson.boardLink ? (
                <a
                  href={normalizeUrl(nextLesson.boardLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-3 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 font-semibold text-sm hover:border-purple-400"
                >
                  Онлайн-доска
                </a>
              ) : (
                <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">Ссылка на доску не указана</div>
              )}
            </div>
          </>
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
  studentsLoading
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
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [expandedPyIds, setExpandedPyIds] = useState({});
  const [expandedPdfIds, setExpandedPdfIds] = useState({});
  const [pyContent, setPyContent] = useState({});
  const [pyError, setPyError] = useState({});
  const [pyLoadingId, setPyLoadingId] = useState(null);
  const fileRef = useRef(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const getFileUrl = (file) => withStudentId(file?.url, effectiveStudentId);

  const taskNumbers = Array.from({length: 27}, (_,i) => i+1);
  const taskCounts = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!Number.isFinite(f?.taskNumber)) continue;
      map.set(f.taskNumber, (map.get(f.taskNumber) || 0) + 1);
    }
    return map;
  }, [files]);

  const categoryCounts = useMemo(() => {
    if (!currentTask) return { class: 0, home: 0 };
    const counts = { class: 0, home: 0 };
    for (const f of files) {
      if (f?.taskNumber !== currentTask) continue;
      if (f?.category === 'class') counts.class += 1;
      if (f?.category === 'home') counts.home += 1;
    }
    return counts;
  }, [files, currentTask]);

  const folderCounts = useMemo(() => {
    if (!currentTask || !currentCategory) return { root: 0, map: new Map() };
    const map = new Map();
    let root = 0;
    for (const f of files) {
      if (f?.taskNumber !== currentTask || f?.category !== currentCategory) continue;
      if (f?.folderId) map.set(f.folderId, (map.get(f.folderId) || 0) + 1);
      else root += 1;
    }
    return { root, map };
  }, [files, currentTask, currentCategory]);

  const taskUsageBytes = useMemo(() => {
    if (!currentTask) return 0;
    return files
      .filter((f) => f?.taskNumber === currentTask)
      .reduce((sum, f) => sum + getEntrySizeBytes(f), 0);
  }, [files, currentTask]);

  const remainingBytes = Math.max(0, MAX_TASK_BYTES - taskUsageBytes);

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
    if (!currentTask || !currentCategory || !effectiveStudentId) {
      setFolders([]);
      setFoldersError('');
      return;
    }
    let cancelled = false;
    api.getFolders(currentTask, currentCategory, effectiveStudentId)
      .then((data) => {
        if (cancelled) return;
        setFolders(data);
        setFoldersError('');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setFoldersError('Не удалось загрузить папки.');
      });
    return () => { cancelled = true; };
  }, [currentTask, currentCategory, effectiveStudentId]);

  useEffect(() => {
    setCurrentFolderId(null);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setRenamingFolderId(null);
    setRenameFolderValue('');
    setIsRenamingFolder(false);
    setRenamingId(null);
    setRenameValue('');
    setIsRenaming(false);
    setDraggingFileId(null);
    setDragOverFolderId(null);
    setExpandedPyIds({});
    setExpandedPdfIds({});
  }, [currentTask, currentCategory]);

  useEffect(() => {
    setCurrentTask(null);
    setCurrentCategory(null);
    setCurrentFolderId(null);
    setFolders([]);
    setFiles([]);
    setExpandedPyIds({});
    setExpandedPdfIds({});
  }, [effectiveStudentId]);

  const handleUploadFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (filesToUpload.length === 0) return;
    if (!effectiveStudentId) {
      alert('Сначала выберите ученика.');
      return;
    }
    if (!currentTask || !currentCategory) {
      alert('Сначала выберите задание и категорию.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    let usedBytes = taskUsageBytes;
    let skipped = 0;

    for (const file of filesToUpload) {
      if (usedBytes + file.size > MAX_TASK_BYTES) {
        skipped += 1;
        continue;
      }
      try {
        const newF = await api.uploadFile(file, currentTask, currentCategory, currentFolderId || null, effectiveStudentId);
        setFiles(prev => [newF, ...prev]);
        usedBytes += file.size;
      } catch(err) {
        alert(err?.message || err);
      }
    }

    setIsUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    if (skipped > 0) {
      alert(`Не хватило места для ${skipped} файла(ов). Лимит 100 МБ на задание.`);
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
    if (!currentTask || !currentCategory || !effectiveStudentId) return;
    try {
      const created = await api.createFolder(currentTask, currentCategory, name, effectiveStudentId);
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
    window.open(url, '_blank', 'noopener,noreferrer');
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
        setRenamingId(null);
        setRenameValue('');
        setIsRenaming(false);
      }
    } catch(err) {
      alert(err?.message || err);
    }
  };

  const startRename = (file) => {
    setRenamingId(file.id);
    setRenameValue(file.name || '');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
    setIsRenaming(false);
  };

  const saveRename = async (file, nameOverride) => {
    if (!file?.id) return;
    const name = (nameOverride ?? renameValue).trim();
    if (!name || name === file.name) {
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
        {taskNumbers.map(n => (
          <Card
            key={n}
            onClick={() => setCurrentTask(n)}
            className={`flex flex-col items-center justify-center p-6 cursor-pointer ${
              (taskCounts.get(n) || 0) > 0 ? 'hover:bg-purple-50' : 'opacity-70 hover:bg-gray-50'
            }`}
          >
            <Folder size={32} className="text-blue-400 mb-2 fill-current" />
            <span className="font-bold text-gray-700">Задание {n}</span>
            <span
              className={`mt-2 text-xs font-bold px-2 py-1 rounded-full border ${
                (taskCounts.get(n) || 0) > 0
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              {(taskCounts.get(n) || 0) > 0 ? `Файлов: ${taskCounts.get(n)}` : 'Пусто'}
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
      <h2 className="text-2xl font-bold mb-6">Задание {currentTask}</h2>
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

  const filtered = files.filter(f =>
    f.taskNumber === currentTask &&
    f.category === currentCategory &&
    (currentFolderId ? f.folderId === currentFolderId : !f.folderId)
  );
  const currentFolderLabel = currentFolderId
    ? (folders.find((f) => f.id === currentFolderId)?.name || 'Папка')
    : 'Без папки';

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
              Задание {currentTask}
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
            <span>Использовано: {formatBytes(taskUsageBytes)} из {formatBytes(MAX_TASK_BYTES)}</span>
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
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
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
                        {isPdfFile(f.name) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                            className="p-2 hover:bg-gray-100 rounded text-gray-500"
                            title="Скачать PDF"
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

const StudentTour = ({ user, view, setView, menuOpen, setMenuOpen }) => {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);
  const steps = STUDENT_TOUR_STEPS;
  const step = steps[stepIndex] || {};

  useEffect(() => {
    if (!user || user.role !== 'student') {
      setOpen(false);
      return;
    }
    if (hasStudentSeenTour(user.id)) {
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      setOpen(true);
      setStepIndex(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [user?.id, user?.role]);

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
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, user?.id]);

  const finishTour = (markDone = true) => {
    setOpen(false);
    if (markDone) markStudentSeenTour(user?.id);
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

  if (!open || !user || user.role !== 'student') return null;
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

const DashboardLayout = ({ user, onLogout, progress, onUpdateProgress }) => {
  const [view, setView] = useState(
    user.role === 'teacher' ? 'teacher' : (user.role === 'admin' ? 'admin' : 'progress')
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState('');
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState('');
  const studentsWithNicknames = useMemo(
    () => students,
    [students]
  );

  const nav = user.role === 'admin'
    ? [
      { id: 'admin', label: 'Админка', icon: Settings }
    ]
    : user.role === 'teacher'
      ? [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'teacher', label: 'Управление тестами', icon: Settings },
        { id: 'notes', label: 'Файлы', icon: Folder }
      ]
      : [
        { id: 'schedule', label: 'Моё расписание', icon: Calendar },
        { id: 'progress', label: 'Успеваемость', icon: BarChart2 },
        { id: 'notes', label: 'Конспекты', icon: BookOpen }
      ];

  const loadStudents = async (teacherId) => {
    setStudentsLoading(true);
    try {
      const data = await api.getStudents(teacherId);
      setStudents(data);
      setStudentsError('');
      setActiveStudentId((current) => (data.some((s) => s.id === current) ? current : data[0]?.id || null));
    } catch (err) {
      setStudentsError(err?.message || err);
    } finally {
      setStudentsLoading(false);
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

  useEffect(() => {
    if (user.role === 'teacher') {
      loadStudents(user.id);
    } else {
      setStudents([]);
      setActiveStudentId(null);
      setStudentsError('');
      setStudentsLoading(false);
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

  const handleStudentCreated = (student) => {
    if (!student) return;
    setStudents((prev) => [student, ...prev]);
    setActiveStudentId(student.id);
  };

  const handleStudentDeleted = (id) => {
    if (!id) return;
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveStudentId((current) => (current === id ? (next[0]?.id || null) : current));
      return next;
    });
  };

  const handleStudentUpdated = (student) => {
    if (!student?.id) return;
    setStudents((prev) => prev.map((item) => (item.id === student.id ? { ...item, ...student } : item)));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <StudentTour
        user={user}
        view={view}
        setView={setView}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <aside className={`fixed md:sticky md:top-0 z-40 bg-white w-64 h-screen border-r transition-transform flex flex-col ${menuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
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

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden bg-white border-b p-4 flex justify-between items-center">
          <span className="font-bold text-purple-600">Иван на сотку</span>
          <button onClick={() => setMenuOpen(!menuOpen)}><Menu/></button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8" data-tour="main">
          {view === 'schedule' && (
            <ScheduleSection
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
            />
          )}
          {view === 'progress' && (
            <ProgressSection
              progress={progress}
              onUpdateProgress={onUpdateProgress}
              role={user.role}
              studentId={user.id}
              students={studentsWithNicknames}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              studentsLoading={studentsLoading}
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
            />
          )}
          {view === 'teacher' && (
            <TeacherPanel
              role={user.role}
              students={studentsWithNicknames}
              studentsLoading={studentsLoading}
              studentsError={studentsError}
              activeStudentId={activeStudentId}
              onSelectStudent={setActiveStudentId}
              onStudentCreated={handleStudentCreated}
              onStudentDeleted={handleStudentDeleted}
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
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState({});

  useEffect(() => {
    const savedUser = localStorage.getItem('ege_user_session');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'student') {
      setProgress({});
      return;
    }
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
  }, [user]);

  const handleLogin = (u) => {
    setUser(u);
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
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } } @keyframes shine { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } } .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }`}</style>
      <DashboardLayout user={user} onLogout={handleLogout} progress={progress} onUpdateProgress={updateProgress} />
    </>
  );
};

export default App;
