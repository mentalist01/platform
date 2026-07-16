import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, CheckCircle2, ChevronDown, ChevronUp, Download, Eye, FileText, GripVertical, ImagePlus, MessageSquare, Paperclip, Pencil, Plus, RefreshCcw, Save, SendHorizontal, Settings, Trash2, UploadCloud, X } from 'lucide-react';
import { api } from '../services/api';
import { buildDownloadUrl } from '../utils/downloadUrl';
import {
  DEFAULT_QUESTION_LABEL_COLOR,
  QUESTION_LABEL_TEXT_MAX_LENGTH,
  getQuestionLabelStyle,
  isQuestionLabelColorValid,
  normalizeQuestionLabel,
  normalizeQuestionLabelColor,
  normalizeQuestionLabelText,
} from '../utils/questionLabel';
import BroadcastNotificationsPanel from './BroadcastNotificationsPanel';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';
import { getAnswerPasteOrder, splitPastedAnswerValues } from '../utils/answerPaste';
import {
  QUESTION_INSERT_MODE_CUSTOM,
  QUESTION_INSERT_MODE_END,
  QUESTION_INSERT_MODE_START,
  normalizeQuestionInsertMode,
  resolveQuestionInsertIndex,
} from '../utils/questionInsertion';

const STUDENT_GRADE_OPTIONS = [
  { value: '11', label: '11 класс' },
  { value: '10', label: '10 класс' },
  { value: 'graduate', label: 'Выпускники' },
];

const QUESTION_LABEL_COLOR_PRESETS = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#e11d48',
  '#475569',
];

const TEACHER_TASK_ACCENTS = [
  { rgb: '14 165 233', color: '#0284c7', dark: '#075985', bg: '#e0f2fe', bgStrong: '#bae6fd' },
  { rgb: '124 58 237', color: '#7c3aed', dark: '#5b21b6', bg: '#ede9fe', bgStrong: '#ddd6fe' },
  { rgb: '16 185 129', color: '#059669', dark: '#047857', bg: '#d1fae5', bgStrong: '#a7f3d0' },
  { rgb: '245 158 11', color: '#d97706', dark: '#92400e', bg: '#fef3c7', bgStrong: '#fde68a' },
  { rgb: '244 63 94', color: '#e11d48', dark: '#9f1239', bg: '#ffe4e6', bgStrong: '#fecdd3' },
  { rgb: '99 102 241', color: '#4f46e5', dark: '#3730a3', bg: '#e0e7ff', bgStrong: '#c7d2fe' },
  { rgb: '20 184 166', color: '#0f766e', dark: '#115e59', bg: '#ccfbf1', bgStrong: '#99f6e4' },
  { rgb: '217 70 239', color: '#c026d3', dark: '#86198f', bg: '#fae8ff', bgStrong: '#f5d0fe' },
];

const getTeacherTaskAccent = (taskNumber) => {
  const normalized = Math.max(1, Math.floor(Number(taskNumber) || 1));
  return TEACHER_TASK_ACCENTS[(normalized - 1) % TEACHER_TASK_ACCENTS.length];
};

const getTeacherTaskAccentStyle = (taskNumber) => {
  const accent = getTeacherTaskAccent(taskNumber);
  return {
    '--teacher-task-accent-rgb': accent.rgb,
    '--teacher-task-accent-color': accent.color,
    '--teacher-task-accent-dark': accent.dark,
    '--teacher-task-accent-bg': accent.bg,
    '--teacher-task-accent-bg-strong': accent.bgStrong,
  };
};

const QUESTION_REORDER_DRAG_TYPE = 'application/x-teacher-question-id';

const normalizeStudentGradeValue = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'graduate' || normalized === 'graduates' || normalized === 'выпускник' || normalized === 'выпускники') {
    return 'graduate';
  }
  return Number(value) === 10 ? '10' : '11';
};

const getStudentGradeLabel = (value) => {
  const normalized = normalizeStudentGradeValue(value);
  if (normalized === 'graduate') return 'Выпускник';
  return `${normalized} класс`;
};

const normalizeEgeScoreInput = (value) => {
  const normalized = String(value ?? '').replace(/[^\d]/g, '').slice(0, 3);
  if (!normalized) return '';
  const score = Math.min(100, Math.max(0, Number(normalized)));
  return Number.isFinite(score) ? String(Math.floor(score)) : '';
};

const parseOptionalEgeScore = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return undefined;
  const score = Number(normalized);
  if (!Number.isInteger(score) || score < 0 || score > 100) return undefined;
  return score;
};

const getCurrentTeacherFinanceMonthKey = () => new Date().toISOString().slice(0, 7);

const toFinanceInputValue = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  return Number.isInteger(num) ? String(num) : String(num);
};

const normalizeFinanceNumberInput = (value) => String(value ?? '').replace(',', '.');

const parseLessonPriceInput = (value) => {
  const normalized = normalizeFinanceNumberInput(value).trim();
  if (!normalized) return 0;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return undefined;
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return Math.round(num * 100) / 100;
};

const formatLessonPrice = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatFinanceMoney = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: safeAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
};

const formatLessonCount = (value) => {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const label = mod100 >= 11 && mod100 <= 14
    ? 'занятий'
    : (mod10 === 1 ? 'занятие' : (mod10 >= 2 && mod10 <= 4 ? 'занятия' : 'занятий'));
  return `${count} ${label}`;
};

const formatQuestionFileCount = (count) => {
  const normalized = Math.max(0, Number(count) || 0);
  const mod100 = normalized % 100;
  const mod10 = normalized % 10;
  const label = mod100 >= 11 && mod100 <= 14
    ? 'файлов'
    : (mod10 === 1 ? 'файл' : (mod10 >= 2 && mod10 <= 4 ? 'файла' : 'файлов'));
  return `${normalized} ${label}`;
};

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
  teacherId,
  SOFT_DELETE_DAYS,
  MOCK_TASKS,
  LEVELS,
  getTaskDisplayNumber,
  getAnswerCountForTask,
  getExpectedAnswers,
  allowsPartialAnswers,
  normalizeXpTotal,
  getLevelFromXp,
  GAME_THEORY_TASK,
  withUploadsAuthToken,
  teacherSignupNotifySupported = false,
  teacherSignupNotifyPermission = 'default',
  teacherSignupNotifyEnabled = false,
  teacherSignupNotifyBusy = false,
  teacherSignupNotifySyncing = false,
  teacherSignupNotifyReady = false,
  teacherSignupNotifyStatusText = '',
  teacherSignupNotifyError = '',
  onToggleTeacherSignupNotify = null,
  mode = 'tests',
  initialSignupChatId = '',
}) => {
  const isSignupChatsMode = mode === 'signup-chats';
  const isTestsMode = !isSignupChatsMode;
  const [isStudentsExpanded, setIsStudentsExpanded] = useState(false);
  const [isTeacherCodeExpanded, setIsTeacherCodeExpanded] = useState(false);
  const [testDb, setTestDb] = useState(null);
  const [testsLoading, setTestsLoading] = useState(false);
  const [testsError, setTestsError] = useState('');
  const [selectedTask, setSelectedTask] = useState(1);
  const [selectedLevel, setSelectedLevel] = useState('basic');
  const [questionInsertMode, setQuestionInsertMode] = useState(QUESTION_INSERT_MODE_END);
  const [questionInsertPosition, setQuestionInsertPosition] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('11');
  const [newStudentEgeScore, setNewStudentEgeScore] = useState('');
  const [studentActionLoading, setStudentActionLoading] = useState(false);
  const [studentActionError, setStudentActionError] = useState('');
  const [lastIssuedCode, setLastIssuedCode] = useState(null);
  const [resettingStudentId, setResettingStudentId] = useState(null);
  const [resettingBoardStudentId, setResettingBoardStudentId] = useState(null);
  const [restoringStudentId, setRestoringStudentId] = useState(null);
  const [teacherCodeForm, setTeacherCodeForm] = useState({ current: '', next: '', repeat: '' });
  const [teacherCodeError, setTeacherCodeError] = useState('');
  const [teacherCodeSuccess, setTeacherCodeSuccess] = useState('');
  const [teacherCodeSaving, setTeacherCodeSaving] = useState(false);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentNickname, setEditStudentNickname] = useState('');
  const [editStudentGrade, setEditStudentGrade] = useState('11');
  const [editStudentEgeScore, setEditStudentEgeScore] = useState('');
  const [editStudentLeaderboardAlias, setEditStudentLeaderboardAlias] = useState('');
  const [editStudentLeaderboardAliasInitial, setEditStudentLeaderboardAliasInitial] = useState('');
  const [editStudentCoinsGrant, setEditStudentCoinsGrant] = useState('');
  const [editStudentLessonPrice, setEditStudentLessonPrice] = useState('');
  const [editStudentLessonPriceInitial, setEditStudentLessonPriceInitial] = useState('');
  const [editStudentCommissionAmount, setEditStudentCommissionAmount] = useState('');
  const [editStudentCommissionAmountInitial, setEditStudentCommissionAmountInitial] = useState('');
  const [editStudentError, setEditStudentError] = useState('');
  const [editStudentSaving, setEditStudentSaving] = useState(false);
  const [teacherFinanceSnapshot, setTeacherFinanceSnapshot] = useState(null);
  const [teacherFinanceLoading, setTeacherFinanceLoading] = useState(false);
  const [teacherFinanceError, setTeacherFinanceError] = useState('');
  const [paymentSenderLinks, setPaymentSenderLinks] = useState([]);
  const [paymentSenderLinksLoading, setPaymentSenderLinksLoading] = useState(false);
  const [paymentSenderLinksError, setPaymentSenderLinksError] = useState('');
  const [paymentSenderDrafts, setPaymentSenderDrafts] = useState({});
  const [paymentSenderSavingKey, setPaymentSenderSavingKey] = useState('');
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [questionScreenshots, setQuestionScreenshots] = useState([]);
  const [questionFiles, setQuestionFiles] = useState([]);
  const [existingQuestionScreenshots, setExistingQuestionScreenshots] = useState([]);
  const [existingQuestionFiles, setExistingQuestionFiles] = useState([]);
  const [initialQuestionAttachments, setInitialQuestionAttachments] = useState({ screenshots: [], files: [] });
  const [screenshotPreviews, setScreenshotPreviews] = useState([]);
  const [questionUploadError, setQuestionUploadError] = useState('');
  const [bulkQuestionFileName, setBulkQuestionFileName] = useState('');
  const [bulkQuestionFileRenameMessage, setBulkQuestionFileRenameMessage] = useState('');
  const [isBulkRenamingQuestionFiles, setIsBulkRenamingQuestionFiles] = useState(false);
  const [isUploadingQuestion, setIsUploadingQuestion] = useState(false);
  const [isDraggingQuestionAttachments, setIsDraggingQuestionAttachments] = useState(false);
  const [isDraggingScreens, setIsDraggingScreens] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggingQuestionId, setDraggingQuestionId] = useState(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState(null);
  const [dragOverQuestionPosition, setDragOverQuestionPosition] = useState('before');
  const [isReorderingQuestions, setIsReorderingQuestions] = useState(false);
  const [questionReorderMessage, setQuestionReorderMessage] = useState('');
  const [questionMoveDraft, setQuestionMoveDraft] = useState({ questionId: null, value: '', error: '' });
  const [questionImageLightbox, setQuestionImageLightbox] = useState(null);
  const screenshotsRef = useRef(null);
  const filesRef = useRef(null);
  const questionDragIdRef = useRef(null);
  const questionAutoScrollRef = useRef({ frame: null, target: null, velocity: 0 });
  const [signupChats, setSignupChats] = useState([]);
  const [signupChatsLoading, setSignupChatsLoading] = useState(false);
  const [signupChatsError, setSignupChatsError] = useState('');
  const [selectedSignupChatId, setSelectedSignupChatId] = useState(() => String(initialSignupChatId || '').trim());
  const [signupChatDetails, setSignupChatDetails] = useState(null);
  const [signupMessages, setSignupMessages] = useState([]);
  const [signupMessagesLoading, setSignupMessagesLoading] = useState(false);
  const [signupMessagesError, setSignupMessagesError] = useState('');
  const [signupMessageText, setSignupMessageText] = useState('');
  const [signupMessageSending, setSignupMessageSending] = useState(false);
  const [signupChatDeletingId, setSignupChatDeletingId] = useState('');
  const [editingSignupMessageId, setEditingSignupMessageId] = useState('');
  const [editingSignupMessageText, setEditingSignupMessageText] = useState('');
  const [signupMessageUpdatingId, setSignupMessageUpdatingId] = useState('');
  const [signupMessageDeletingId, setSignupMessageDeletingId] = useState('');
  const signupMessagesRef = useRef(null);

  const getStudentFinanceRow = useCallback((studentId, snapshot = teacherFinanceSnapshot) => {
    const normalizedId = String(studentId || '').trim();
    if (!normalizedId) return null;
    const list = Array.isArray(snapshot?.students) ? snapshot.students : [];
    return list.find((item) => String(item?.id || '').trim() === normalizedId) || null;
  }, [teacherFinanceSnapshot]);

  const getStudentLessonPrice = useCallback((studentId, snapshot = teacherFinanceSnapshot) => {
    const row = getStudentFinanceRow(studentId, snapshot);
    const recordPrice = Number(row?.record?.lessonPrice);
    if (Number.isFinite(recordPrice) && recordPrice > 0) return recordPrice;
    const profilePrice = Number(row?.profile?.lessonPrice);
    return Number.isFinite(profilePrice) && profilePrice > 0 ? profilePrice : 0;
  }, [getStudentFinanceRow, teacherFinanceSnapshot]);

  const getStudentCommissionAmount = useCallback((studentId, snapshot = teacherFinanceSnapshot) => {
    const row = getStudentFinanceRow(studentId, snapshot);
    const profileAmount = Number(row?.profile?.commissionAmount);
    if (Number.isFinite(profileAmount) && profileAmount >= 0) return profileAmount;
    const profitabilityAmount = Number(row?.profitability?.commissionAmount);
    return Number.isFinite(profitabilityAmount) && profitabilityAmount >= 0 ? profitabilityAmount : 0;
  }, [getStudentFinanceRow, teacherFinanceSnapshot]);

  const getStudentPaymentSenderLinks = useCallback((studentId) => {
    const normalizedId = String(studentId || '').trim();
    if (!normalizedId) return [];
    return paymentSenderLinks.filter((link) => String(link?.studentId || '').trim() === normalizedId);
  }, [paymentSenderLinks]);

  useEffect(() => {
    const normalized = String(initialSignupChatId || '').trim();
    if (!normalized) return;
    setSelectedSignupChatId((prev) => (prev === normalized ? prev : normalized));
  }, [initialSignupChatId]);

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
    if (!questionImageLightbox?.url) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setQuestionImageLightbox(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [questionImageLightbox]);

  useEffect(() => {
    if (!isTestsMode) return undefined;
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
  }, [isTestsMode]);

  useEffect(() => {
    if (!isTestsMode) return undefined;
    if (role !== 'teacher' && role !== 'admin') return undefined;
    if (role === 'admin' && !teacherId) {
      setTeacherFinanceSnapshot(null);
      setTeacherFinanceError('');
      return undefined;
    }
    let cancelled = false;
    setTeacherFinanceLoading(true);
    api.getTeacherFinance(undefined, teacherId)
      .then((data) => {
        if (cancelled) return;
        setTeacherFinanceSnapshot(data && typeof data === 'object' ? data : null);
        setTeacherFinanceError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setTeacherFinanceSnapshot(null);
        setTeacherFinanceError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setTeacherFinanceLoading(false);
    });
    return () => { cancelled = true; };
  }, [isTestsMode, role, teacherId]);

  const loadPaymentSenderLinks = useCallback(async () => {
    if (!isTestsMode) return [];
    if (role !== 'teacher' && role !== 'admin') return [];
    if (role === 'admin' && !teacherId) return [];
    setPaymentSenderLinksLoading(true);
    try {
      const data = await api.getPaymentSenderLinks(teacherId);
      const links = Array.isArray(data?.links) ? data.links : [];
      setPaymentSenderLinks(links);
      setPaymentSenderLinksError('');
      return links;
    } catch (err) {
      setPaymentSenderLinks([]);
      setPaymentSenderLinksError(err?.message || String(err));
      return [];
    } finally {
      setPaymentSenderLinksLoading(false);
    }
  }, [isTestsMode, role, teacherId]);

  useEffect(() => {
    if (!isTestsMode) return undefined;
    if (role !== 'teacher' && role !== 'admin') return undefined;
    if (role === 'admin' && !teacherId) {
      setPaymentSenderLinks([]);
      setPaymentSenderLinksError('');
      return undefined;
    }
    let cancelled = false;
    setPaymentSenderLinksLoading(true);
    api.getPaymentSenderLinks(teacherId)
      .then((data) => {
        if (cancelled) return;
        setPaymentSenderLinks(Array.isArray(data?.links) ? data.links : []);
        setPaymentSenderLinksError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setPaymentSenderLinks([]);
        setPaymentSenderLinksError(err?.message || String(err));
      })
      .finally(() => {
        if (!cancelled) setPaymentSenderLinksLoading(false);
      });
    return () => { cancelled = true; };
  }, [isTestsMode, role, teacherId]);

  useEffect(() => {
    if (!editingStudentId) return;
    const nextLessonPrice = toFinanceInputValue(getStudentLessonPrice(editingStudentId));
    const nextCommissionAmount = toFinanceInputValue(getStudentCommissionAmount(editingStudentId));
    setEditStudentLessonPrice((prev) => (
      prev === editStudentLessonPriceInitial ? nextLessonPrice : prev
    ));
    setEditStudentCommissionAmount((prev) => (
      prev === editStudentCommissionAmountInitial ? nextCommissionAmount : prev
    ));
    setEditStudentLessonPriceInitial(nextLessonPrice);
    setEditStudentCommissionAmountInitial(nextCommissionAmount);
  }, [
    teacherFinanceSnapshot,
    editingStudentId,
    editStudentLessonPriceInitial,
    editStudentCommissionAmountInitial,
    getStudentLessonPrice,
    getStudentCommissionAmount,
  ]);
  
  // Form state
  const [question, setQuestion] = useState("");
  const [questionLabelText, setQuestionLabelText] = useState('');
  const [questionLabelColor, setQuestionLabelColor] = useState(DEFAULT_QUESTION_LABEL_COLOR);
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

  const normalizeBulkQuestionFileName = (value) => String(value ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);

  const resetQuestionForm = (options = {}) => {
    const { keepAnswers = false } = options;
    setQuestion('');
    setQuestionLabelText('');
    setQuestionLabelColor(DEFAULT_QUESTION_LABEL_COLOR);
    setQuestionScreenshots([]);
    setQuestionFiles([]);
    setExistingQuestionScreenshots([]);
    setExistingQuestionFiles([]);
    setInitialQuestionAttachments({ screenshots: [], files: [] });
    setQuestionUploadError('');
    setBulkQuestionFileRenameMessage('');
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
    const existingLabel = normalizeQuestionLabel(questionItem.label);
    setQuestionLabelText(existingLabel?.text || '');
    setQuestionLabelColor(existingLabel?.color || DEFAULT_QUESTION_LABEL_COLOR);
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
    setBulkQuestionFileRenameMessage('');
    if (screenshotsRef.current) screenshotsRef.current.value = '';
    if (filesRef.current) filesRef.current.value = '';
    const inlineEditorId = String(questionItem.id).replace(/"/g, '\\"');
    window.setTimeout(() => {
      document
        .querySelector(`[data-inline-question-editor="${inlineEditorId}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const cancelEditQuestion = () => resetQuestionForm();

  useEffect(() => {
    if (editingQuestionId) {
      cancelEditQuestion();
    }
    setBulkQuestionFileName('');
    setBulkQuestionFileRenameMessage('');
    questionDragIdRef.current = null;
    setDraggingQuestionId(null);
    setDragOverQuestionId(null);
    setDragOverQuestionPosition('before');
    setQuestionReorderMessage('');
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
    const normalizedLabelText = normalizeQuestionLabelText(questionLabelText);
    if (normalizedLabelText && !isQuestionLabelColorValid(questionLabelColor)) {
      alert('Цвет метки должен быть в формате HEX, например #7c3aed');
      return;
    }
    const questionLabel = normalizedLabelText
      ? {
        text: normalizedLabelText,
        color: normalizeQuestionLabelColor(questionLabelColor),
      }
      : null;
    const existingLevelQuestions = Array.isArray(testDb?.[selectedTask]?.[selectedLevel])
      ? testDb[selectedTask][selectedLevel]
      : [];
    const questionInsertIndex = editingQuestionId
      ? null
      : resolveQuestionInsertIndex(
          questionInsertMode,
          questionInsertPosition,
          existingLevelQuestions.length
        );
    if (!editingQuestionId && questionInsertIndex === null) {
      setQuestionUploadError(`Укажите место от 1 до ${existingLevelQuestions.length + 1}.`);
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
    const taskDb = {
      basic: [],
      advanced: [],
      expert: [],
      ...(updatedDb[selectedTask] || {}),
    };
    const levelList = Array.isArray(taskDb[selectedLevel]) ? [...taskDb[selectedLevel]] : [];
    taskDb[selectedLevel] = levelList;
    updatedDb[selectedTask] = taskDb;
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
      if (questionLabel) updatedQuestion.label = questionLabel;
      else delete updatedQuestion.label;
      levelList[targetIndex] = updatedQuestion;
    } else {
      const newQuestion = {
        id: Date.now(),
        question: question.trim(),
        ...(requiredCount > 1
          ? { answers: answersSlice }
          : { answer: trimmedAnswers[0] }),
        screenshots: finalScreenshots,
        files: finalFiles,
        ...(questionLabel ? { label: questionLabel } : {}),
      };
      levelList.splice(questionInsertIndex, 0, newQuestion);
    }

    try {
      await api.saveTests(updatedDb);
      setTestDb(updatedDb);
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
  const maxQuestionInsertPosition = currentQuestions.length + 1;
  const previewQuestionInsertIndex = resolveQuestionInsertIndex(
    questionInsertMode,
    questionInsertPosition,
    currentQuestions.length
  );
  const newQuestionInsertPosition = previewQuestionInsertIndex === null
    ? null
    : previewQuestionInsertIndex + 1;

  useEffect(() => {
    if (questionInsertMode !== QUESTION_INSERT_MODE_CUSTOM) return;
    setQuestionInsertPosition((previous) => {
      if (!String(previous).trim()) return previous;
      const numericPosition = Number(previous);
      if (!Number.isInteger(numericPosition)) return previous;
      return String(Math.max(1, Math.min(maxQuestionInsertPosition, numericPosition)));
    });
  }, [selectedTask, selectedLevel, currentQuestions.length, questionInsertMode, maxQuestionInsertPosition]);

  const handleQuestionInsertModeChange = (value) => {
    const nextMode = normalizeQuestionInsertMode(value);
    setQuestionInsertMode(nextMode);
    setQuestionUploadError('');
    if (nextMode === QUESTION_INSERT_MODE_CUSTOM) {
      setQuestionInsertPosition((previous) => {
        const numericPosition = Number(previous);
        if (Number.isInteger(numericPosition) && numericPosition >= 1 && numericPosition <= maxQuestionInsertPosition) {
          return String(numericPosition);
        }
        return String(maxQuestionInsertPosition);
      });
    }
  };
  const levelQuestionFileCount = currentQuestions.reduce(
    (total, item) => total + (Array.isArray(item?.files) ? item.files.length : 0),
    0
  );
  const bulkQuestionFileCount = levelQuestionFileCount + questionFiles.length;
  const persistQuestionOrder = async (reorderedQuestions, successMessage = 'Порядок сохранён') => {
    const orderChanged = reorderedQuestions.some((item, index) => String(item?.id) !== String(currentQuestions[index]?.id));
    if (!orderChanged) return false;

    const previousDb = testDb;
    const updatedDb = { ...(testDb || {}) };
    updatedDb[selectedTask] = { ...(updatedDb[selectedTask] || {}) };
    updatedDb[selectedTask][selectedLevel] = reorderedQuestions;

    setIsReorderingQuestions(true);
    setQuestionReorderMessage('Сохраняю новый порядок…');
    setTestDb(updatedDb);
    try {
      await api.saveTests(updatedDb);
      setQuestionReorderMessage(successMessage);
      return true;
    } catch (err) {
      setTestDb(previousDb);
      setQuestionReorderMessage(`Не удалось сохранить порядок: ${err?.message || err}`);
      return false;
    } finally {
      setIsReorderingQuestions(false);
    }
  };

  const getQuestionDragScrollTarget = (node) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    let current = node instanceof Element ? node : null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const overflowY = `${style.overflowY} ${style.overflow}`;
      if (/(auto|scroll|overlay)/.test(overflowY) && current.scrollHeight > current.clientHeight + 8) {
        return current;
      }
      current = current.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  const stopQuestionAutoScroll = () => {
    const state = questionAutoScrollRef.current;
    if (state.frame && typeof window !== 'undefined') {
      window.cancelAnimationFrame(state.frame);
    }
    questionAutoScrollRef.current = { frame: null, target: null, velocity: 0 };
  };

  const runQuestionAutoScroll = () => {
    const state = questionAutoScrollRef.current;
    if (!state.target || !state.velocity || typeof window === 'undefined') {
      stopQuestionAutoScroll();
      return;
    }
    state.target.scrollTop += state.velocity;
    state.frame = window.requestAnimationFrame(runQuestionAutoScroll);
  };

  const updateQuestionAutoScroll = (event) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const target = getQuestionDragScrollTarget(event.currentTarget);
    if (!target) return;

    const isPageScroll = target === document.scrollingElement || target === document.documentElement || target === document.body;
    const bounds = isPageScroll
      ? { top: 0, bottom: window.innerHeight }
      : target.getBoundingClientRect();
    const edgeSize = Math.min(140, Math.max(86, (bounds.bottom - bounds.top) * 0.18));
    const maxVelocity = 24;
    let velocity = 0;

    if (event.clientY < bounds.top + edgeSize) {
      velocity = -Math.ceil(((bounds.top + edgeSize - event.clientY) / edgeSize) * maxVelocity);
    } else if (event.clientY > bounds.bottom - edgeSize) {
      velocity = Math.ceil(((event.clientY - (bounds.bottom - edgeSize)) / edgeSize) * maxVelocity);
    }

    const state = questionAutoScrollRef.current;
    if (!velocity) {
      stopQuestionAutoScroll();
      return;
    }

    state.target = target;
    state.velocity = velocity;
    if (!state.frame) {
      state.frame = window.requestAnimationFrame(runQuestionAutoScroll);
    }
  };

  const resetQuestionDragState = () => {
    stopQuestionAutoScroll();
    questionDragIdRef.current = null;
    setDraggingQuestionId(null);
    setDragOverQuestionId(null);
    setDragOverQuestionPosition('before');
  };

  const handleQuestionDragStart = (event, questionId) => {
    if (isReorderingQuestions || isUploadingQuestion) {
      event.preventDefault();
      return;
    }
    questionDragIdRef.current = questionId;
    setDraggingQuestionId(questionId);
    setDragOverQuestionId(questionId);
    setDragOverQuestionPosition('before');
    setQuestionReorderMessage('');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(QUESTION_REORDER_DRAG_TYPE, String(questionId));
      event.dataTransfer.setData('text/plain', String(questionId));
    }
  };

  const handleQuestionDragOver = (event, questionId, forcedPosition = null) => {
    const sourceId = questionDragIdRef.current;
    if (!sourceId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    updateQuestionAutoScroll(event);
    if (String(sourceId) === String(questionId)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = forcedPosition || (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    if (String(dragOverQuestionId) !== String(questionId)) {
      setDragOverQuestionId(questionId);
    }
    if (dragOverQuestionPosition !== position) {
      setDragOverQuestionPosition(position);
    }
  };

  const handleQuestionListDragOver = (event) => {
    if (!questionDragIdRef.current) return;
    updateQuestionAutoScroll(event);
  };

  const handleQuestionDrop = async (event, questionId, forcedPosition = null) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const dropPosition = forcedPosition || (event.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
    const sourceId = questionDragIdRef.current
      || event.dataTransfer?.getData(QUESTION_REORDER_DRAG_TYPE)
      || event.dataTransfer?.getData('text/plain');
    resetQuestionDragState();
    if (!sourceId || String(sourceId) === String(questionId)) return;

    const sourceIndex = currentQuestions.findIndex((item) => String(item?.id) === String(sourceId));
    const targetIndex = currentQuestions.findIndex((item) => String(item?.id) === String(questionId));
    if (sourceIndex === -1 || targetIndex === -1) return;

    const movedQuestion = currentQuestions[sourceIndex];
    const reorderedQuestions = currentQuestions.filter((_, index) => index !== sourceIndex);
    let insertIndex = targetIndex + (dropPosition === 'after' ? 1 : 0);
    if (sourceIndex < insertIndex) insertIndex -= 1;
    insertIndex = Math.max(0, Math.min(reorderedQuestions.length, insertIndex));
    reorderedQuestions.splice(insertIndex, 0, movedQuestion);
    await persistQuestionOrder(reorderedQuestions);
  };

  const openQuestionMoveDraft = (questionId, position) => {
    if (currentQuestions.length <= 1 || isReorderingQuestions || isUploadingQuestion) return;
    setQuestionReorderMessage('');
    setQuestionMoveDraft({
      questionId,
      value: String(position),
      error: '',
    });
  };

  const closeQuestionMoveDraft = () => {
    setQuestionMoveDraft({ questionId: null, value: '', error: '' });
  };

  const handleQuestionMoveDraftChange = (value) => {
    setQuestionMoveDraft((prev) => ({
      ...prev,
      value: String(value || '').replace(/[^\d]/g, '').slice(0, 3),
      error: '',
    }));
  };

  const submitQuestionMoveDraft = async (questionId) => {
    const sourceIndex = currentQuestions.findIndex((item) => String(item?.id) === String(questionId));
    if (sourceIndex === -1) {
      closeQuestionMoveDraft();
      return;
    }

    const targetPosition = Number(questionMoveDraft.value);
    if (!Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > currentQuestions.length) {
      setQuestionMoveDraft((prev) => ({
        ...prev,
        error: `Введите место от 1 до ${currentQuestions.length}.`,
      }));
      return;
    }

    if (targetPosition === sourceIndex + 1) {
      setQuestionReorderMessage(`Вопрос уже стоит на месте ${targetPosition}`);
      closeQuestionMoveDraft();
      return;
    }

    const movedQuestion = currentQuestions[sourceIndex];
    const reorderedQuestions = currentQuestions.filter((_, index) => index !== sourceIndex);
    reorderedQuestions.splice(targetPosition - 1, 0, movedQuestion);
    const saved = await persistQuestionOrder(
      reorderedQuestions,
      `Вопрос №${sourceIndex + 1} перенесён на место ${targetPosition}`
    );
    if (saved) closeQuestionMoveDraft();
  };

  const handleBulkRenameQuestionFiles = async () => {
    const nextBaseName = normalizeBulkQuestionFileName(bulkQuestionFileName);
    if (!nextBaseName) {
      setQuestionUploadError('Введите новое имя доп. файлов без расширения.');
      setBulkQuestionFileRenameMessage('');
      return;
    }
    if (bulkQuestionFileCount === 0) {
      setQuestionUploadError('В выбранном задании и уровне пока нет доп. файлов.');
      setBulkQuestionFileRenameMessage('');
      return;
    }

    const renameStoredFile = (file) => {
      const { ext } = splitUploadFileName(file?.name || file?.storageName || '');
      return {
        ...file,
        name: ext ? `${nextBaseName}.${ext}` : nextBaseName,
      };
    };

    setIsBulkRenamingQuestionFiles(true);
    setQuestionUploadError('');
    setBulkQuestionFileRenameMessage('');

    try {
      if (levelQuestionFileCount > 0) {
        const updatedDb = { ...(testDb || {}) };
        const taskDb = { ...(updatedDb[selectedTask] || {}) };
        taskDb[selectedLevel] = currentQuestions.map((item) => ({
          ...item,
          files: Array.isArray(item?.files) ? item.files.map(renameStoredFile) : [],
        }));
        updatedDb[selectedTask] = taskDb;
        await api.saveTests(updatedDb);
        setTestDb(updatedDb);
      }

      setQuestionFiles((prev) => prev.map((entry) => ({ ...entry, base: nextBaseName })));
      setExistingQuestionFiles((prev) => prev.map(renameStoredFile));
      setBulkQuestionFileName(nextBaseName);
      setBulkQuestionFileRenameMessage(
        `Переименовано: ${formatQuestionFileCount(bulkQuestionFileCount)}. Расширения сохранены.`
      );
    } catch (err) {
      setQuestionUploadError(err?.message || String(err));
    } finally {
      setIsBulkRenamingQuestionFiles(false);
    }
  };

  const studentsList = students || [];
  const deletedStudentsList = deletedStudents || [];
  const tasksList = Array.isArray(tasks) && tasks.length ? tasks : MOCK_TASKS;
  const selectedTaskInfo = tasksList.find((taskItem) => Number(taskItem?.number) === Number(selectedTask)) || null;
  const selectedLevelInfo = Object.values(LEVELS).find((levelItem) => levelItem.id === selectedLevel) || null;
  const activeStudent = studentsList.find((student) => String(student?.id || '') === String(activeStudentId || '')) || null;
  const selectedTaskDisplay = getTaskDisplayNumber(selectedTaskInfo || { number: selectedTask });
  const selectedTaskTitle = selectedTaskInfo?.title || 'Выберите задание';
  const selectedLevelLabel = selectedLevelInfo?.label || selectedLevel;
  const activeStudentLabel = activeStudent?.name || 'Не выбран';
  const selectedTaskAccentStyle = getTeacherTaskAccentStyle(selectedTask);
  const selectedTaskContextLabel = `Задание ${selectedTaskDisplay}`;
  const normalizedQuestionLabelPreview = normalizeQuestionLabelText(questionLabelText);
  const questionAttachmentCount = questionScreenshots.length
    + questionFiles.length
    + existingQuestionScreenshots.length
    + existingQuestionFiles.length;
  const editorQuestionNumber = editingQuestionId
    ? Math.max(1, currentQuestions.findIndex((item) => item.id === editingQuestionId) + 1)
    : (newQuestionInsertPosition ?? '—');
  const hasQuestionCondition = Boolean(question.trim())
    || questionScreenshots.length > 0
    || existingQuestionScreenshots.length > 0;
  const hasQuestionAnswer = answerInputs
    .slice(0, answerCount)
    .some((value) => String(value ?? '').trim());
  const canPasteAnswerTable = answerCount === 20;
  const answerSectionClassName = [
    'teacher-question-editor__section',
    'teacher-question-editor__answer-section',
    answerCount >= 20 ? 'teacher-question-editor__answer-section--many' : '',
  ].filter(Boolean).join(' ');
  const renderTeacherAnswerPasteHint = () => (
    <div className="teacher-question-editor__answer-paste-hint">
      <strong>Быстрая вставка всех ответов</strong>
      <span>Скопируйте пары чисел, нажмите первую ячейку и вставьте через Ctrl+V. Каждая строка заполнит одну строку таблицы.</span>
      <code>
        1104293251 16691
        <br />
        1104315547 1669
      </code>
    </div>
  );
  const existingPreviewImage = existingQuestionScreenshots[0];
  const questionPreviewImageUrl = screenshotPreviews[0]?.url || (
    existingPreviewImage
      ? withUploadsAuthToken(existingPreviewImage?.url || (existingPreviewImage?.storageName ? `/uploads/${existingPreviewImage.storageName}` : ''))
      : ''
  );
  const questionPreviewImageName = screenshotPreviews[0]?.file?.name || existingPreviewImage?.name || 'Изображение условия';
  const openQuestionImageLightbox = (url, name = 'Изображение') => {
    if (!url) return;
    setQuestionImageLightbox({ url, name: name || 'Изображение' });
  };
  const normalizeStorageBytes = (value) => {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };
  const formatStorageBytes = (value) => {
    const bytes = normalizeStorageBytes(value);
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${bytes} Б`;
  };
  const totalNotesUsageBytes = studentsList.reduce((sum, student) => {
    return sum + normalizeStorageBytes(student?.notesUsageBytes);
  }, 0);
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
  const formatSignupDateTime = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  const getSignupChatSortValue = useCallback((chat) => {
    const value = chat?.lastMessageAt || chat?.updatedAt || chat?.createdAt || '';
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);
  const sortSignupChats = useCallback(
    (items) => (Array.isArray(items) ? items : [])
      .map((chat, index) => ({ chat, index }))
      .sort((left, right) => {
        const diff = getSignupChatSortValue(right.chat) - getSignupChatSortValue(left.chat);
        if (diff !== 0) return diff;
        return right.index - left.index;
      })
      .map((entry) => entry.chat),
    [getSignupChatSortValue]
  );
  const refreshSignupChats = useCallback(async () => {
    const chatsPayload = await api.getSignupChats();
    const list = sortSignupChats(Array.isArray(chatsPayload) ? chatsPayload : []);
    setSignupChats(list);
    setSignupChatsError('');
    return list;
  }, [sortSignupChats]);

  const fetchSignupChatMessages = useCallback(async (chatId, options = {}) => {
    const { silent = false } = options;
    const normalizedChatId = typeof chatId === 'string' ? chatId.trim() : '';
    if (!normalizedChatId) {
      setSignupChatDetails(null);
      setSignupMessages([]);
      setSignupMessagesError('');
      return null;
    }
    if (!silent) setSignupMessagesLoading(true);
    try {
      const payload = await api.getSignupChatMessagesForTeacher(normalizedChatId);
      setSignupChatDetails(payload?.chat || null);
      setSignupMessages(Array.isArray(payload?.messages) ? payload.messages : []);
      setSignupMessagesError('');
      return payload;
    } catch (err) {
      if (!silent) {
        setSignupMessagesError(err?.message || String(err));
      }
      return null;
    } finally {
      if (!silent) setSignupMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSignupChatsMode) return undefined;
    if (role !== 'teacher' && role !== 'admin') return undefined;
    let cancelled = false;
    const loadChats = async ({ silent = false } = {}) => {
      if (!silent) setSignupChatsLoading(true);
      try {
        const payload = await api.getSignupChats();
        if (cancelled) return;
        const list = sortSignupChats(Array.isArray(payload) ? payload : []);
        setSignupChats(list);
        setSignupChatsError('');
        setSelectedSignupChatId((prev) => {
          if (prev && list.some((item) => item.id === prev)) return prev;
          return list[0]?.id || '';
        });
      } catch (err) {
        if (cancelled) return;
        if (!silent) {
          setSignupChatsError(err?.message || String(err));
        }
      } finally {
        if (!silent && !cancelled) setSignupChatsLoading(false);
      }
    };

    loadChats();
    const timerId = setInterval(() => {
      loadChats({ silent: true });
    }, 6000);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [isSignupChatsMode, role, sortSignupChats, teacherId]);

  useEffect(() => {
    if (!isSignupChatsMode) return undefined;
    if (!selectedSignupChatId) {
      setSignupChatDetails(null);
      setSignupMessages([]);
      setSignupMessagesError('');
      return undefined;
    }

    let cancelled = false;
    const loadMessages = async ({ silent = false } = {}) => {
      if (cancelled) return;
      await fetchSignupChatMessages(selectedSignupChatId, { silent });
    };

    loadMessages();
    const timerId = setInterval(() => {
      loadMessages({ silent: true });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timerId);
    };
  }, [fetchSignupChatMessages, isSignupChatsMode, selectedSignupChatId]);

  useEffect(() => {
    setEditingSignupMessageId('');
    setEditingSignupMessageText('');
    setSignupMessageUpdatingId('');
    setSignupMessageDeletingId('');
  }, [selectedSignupChatId]);

  useEffect(() => {
    if (!editingSignupMessageId) return;
    const exists = signupMessages.some((message) => message?.id === editingSignupMessageId);
    if (!exists) {
      setEditingSignupMessageId('');
      setEditingSignupMessageText('');
    }
  }, [editingSignupMessageId, signupMessages]);

  useEffect(() => {
    if (!isSignupChatsMode) return;
    const node = signupMessagesRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [isSignupChatsMode, selectedSignupChatId, signupMessages.length]);

  const handleSendSignupMessage = async () => {
    const text = signupMessageText.trim();
    if (!selectedSignupChatId || !text || signupMessageSending) return;
    setSignupMessageSending(true);
    try {
      await api.sendSignupChatMessageForTeacher(selectedSignupChatId, text);
      setSignupMessageText('');
      await fetchSignupChatMessages(selectedSignupChatId, { silent: true });
      await refreshSignupChats();
      setSignupMessagesError('');
    } catch (err) {
      setSignupMessagesError(err?.message || String(err));
    } finally {
      setSignupMessageSending(false);
    }
  };

  const handleStartSignupMessageEdit = (message) => {
    if (!message || message.senderRole !== 'teacher') return;
    const messageId = typeof message.id === 'string' ? message.id.trim() : '';
    if (!messageId) return;
    setEditingSignupMessageId(messageId);
    setEditingSignupMessageText(String(message.text || ''));
    setSignupMessagesError('');
  };

  const handleCancelSignupMessageEdit = () => {
    setEditingSignupMessageId('');
    setEditingSignupMessageText('');
  };

  const handleSaveSignupMessageEdit = async () => {
    const chatId = typeof selectedSignupChatId === 'string' ? selectedSignupChatId.trim() : '';
    const messageId = typeof editingSignupMessageId === 'string' ? editingSignupMessageId.trim() : '';
    const text = editingSignupMessageText.trim();
    if (!chatId || !messageId || !text || signupMessageUpdatingId) return;

    setSignupMessageUpdatingId(messageId);
    try {
      await api.updateSignupChatMessageForTeacher(chatId, messageId, text);
      setEditingSignupMessageId('');
      setEditingSignupMessageText('');
      await fetchSignupChatMessages(chatId, { silent: true });
      await refreshSignupChats();
      setSignupMessagesError('');
    } catch (err) {
      setSignupMessagesError(err?.message || String(err));
    } finally {
      setSignupMessageUpdatingId('');
    }
  };

  const handleDeleteSignupMessage = async (message) => {
    const chatId = typeof selectedSignupChatId === 'string' ? selectedSignupChatId.trim() : '';
    const messageId = typeof message?.id === 'string' ? message.id.trim() : '';
    if (!chatId || !messageId || signupMessageDeletingId) return;
    const preview = String(message?.text || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const messageLabel = preview ? `"${preview}"` : 'это сообщение';
    if (!confirm(`Удалить ${messageLabel}?`)) return;

    setSignupMessageDeletingId(messageId);
    try {
      await api.deleteSignupChatMessageForTeacher(chatId, messageId);
      if (editingSignupMessageId === messageId) {
        setEditingSignupMessageId('');
        setEditingSignupMessageText('');
      }
      await fetchSignupChatMessages(chatId, { silent: true });
      await refreshSignupChats();
      setSignupMessagesError('');
    } catch (err) {
      setSignupMessagesError(err?.message || String(err));
    } finally {
      setSignupMessageDeletingId('');
    }
  };

  const handleDeleteSignupChat = async () => {
    const chatId = typeof selectedSignupChatId === 'string' ? selectedSignupChatId.trim() : '';
    if (!chatId) return;
    if (signupChatDeletingId === chatId) return;
    const targetChat = signupChats.find((chat) => chat.id === chatId);
    const guestName = targetChat?.guestName || 'Гость';
    if (!confirm(`Удалить чат с "${guestName}"? Это действие нельзя отменить.`)) return;

    setSignupChatDeletingId(chatId);
    try {
      await api.deleteSignupChat(chatId);
      setSignupMessagesError('');
      setSignupMessageText('');
      setEditingSignupMessageId('');
      setEditingSignupMessageText('');
      setSignupMessageUpdatingId('');
      setSignupMessageDeletingId('');
      setSignupChatDetails((prev) => (prev?.id === chatId ? null : prev));
      if (selectedSignupChatId === chatId) {
        setSignupMessages([]);
      }

      const list = await refreshSignupChats();
      setSignupChats(list);
      setSignupChatsError('');
      setSelectedSignupChatId((prev) => {
        if (prev && prev !== chatId && list.some((item) => item.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch (err) {
      setSignupMessagesError(err?.message || String(err));
    } finally {
      setSignupChatDeletingId('');
    }
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

  const isQuestionAttachmentDrag = (e) => {
    if ((e.dataTransfer?.files?.length || 0) > 0) return true;
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes('Files')) return true;
    return Array.from(e.dataTransfer?.items || []).some((item) => item?.kind === 'file');
  };

  const resetQuestionAttachmentDragState = () => {
    setIsDraggingQuestionAttachments(false);
    setIsDraggingScreens(false);
    setIsDraggingFiles(false);
  };

  const addQuestionAttachmentFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter(Boolean);
    if (incoming.length === 0) return;
    const images = incoming.filter((file) => file.type?.startsWith('image/'));
    const extraFiles = incoming.filter((file) => !file.type?.startsWith('image/'));
    addScreenshotFiles(images);
    addExtraFiles(extraFiles);
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
    resetQuestionAttachmentDragState();
    addScreenshotFiles(e.dataTransfer?.files || []);
  };

  const handleScreenshotsDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingScreens) setIsDraggingScreens(true);
  };

  const handleScreenshotsDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingScreens(false);
  };

  const handleFilesDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetQuestionAttachmentDragState();
    addExtraFiles(e.dataTransfer?.files || []);
  };

  const handleFilesDragOver = (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFiles) setIsDraggingFiles(true);
  };

  const handleFilesDragLeave = (e) => {
    e.preventDefault();
    setIsDraggingFiles(false);
  };

  const handleQuestionAttachmentDragEnter = (e) => {
    if (!isQuestionAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingQuestionAttachments(true);
  };

  const handleQuestionAttachmentDragOver = (e) => {
    if (!isQuestionAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingQuestionAttachments) setIsDraggingQuestionAttachments(true);
  };

  const handleQuestionAttachmentDragLeave = (e) => {
    if (!isQuestionAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
    setIsDraggingQuestionAttachments(false);
  };

  const handleQuestionAttachmentDrop = (e) => {
    if (!isQuestionAttachmentDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    resetQuestionAttachmentDragState();
    addQuestionAttachmentFiles(e.dataTransfer?.files || []);
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

  const handleAnswerInputPaste = (event, startIndex) => {
    const values = splitPastedAnswerValues(event.clipboardData?.getData('text/plain') || '');
    if (values.length <= 1) return;
    const pasteOrder = getAnswerPasteOrder(answerCount, startIndex);
    if (pasteOrder.length === 0) return;
    event.preventDefault();
    setAnswerInputs((prev) => {
      const next = Array.from({ length: answerCount }, (_, idx) => prev[idx] ?? '');
      values.slice(0, pasteOrder.length).forEach((value, idx) => {
        next[pasteOrder[idx]] = value;
      });
      return next;
    });
  };

  const renderAnswerInputFields = () => {
    if (answerCount > 1) {
      if (Number(selectedTask) === GAME_THEORY_TASK) {
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">19</label>
              <input
                type="text"
                value={answerInputs[0] ?? ''}
                onPaste={(e) => handleAnswerInputPaste(e, 0)}
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
              {[1, 2].map((answerIdx) => (
                <div key={answerIdx}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">20.{answerIdx}</label>
                  <input
                    type="text"
                    value={answerInputs[answerIdx] ?? ''}
                    onPaste={(e) => handleAnswerInputPaste(e, answerIdx)}
                    onChange={(e) => {
                      const value = e.target.value;
                      setAnswerInputs((prev) => {
                        const next = [...prev];
                        next[answerIdx] = value;
                        return next;
                      });
                    }}
                    className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                    placeholder={`Ответ 20.${answerIdx}`}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">21</label>
              <input
                type="text"
                value={answerInputs[3] ?? ''}
                onPaste={(e) => handleAnswerInputPaste(e, 3)}
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
        );
      }

      if (answerCount === 20) {
        return (
          <div className="teacher-question-editor__answer-grid--twenty grid grid-cols-[32px_1fr_1fr] gap-2">
            {Array.from({ length: 10 }).map((_, rowIdx) => {
              const leftIdx = rowIdx;
              const rightIdx = rowIdx + 10;
              return (
                <React.Fragment key={rowIdx}>
                  <div className="flex items-center justify-center text-xs font-bold text-gray-500">
                    {rowIdx + 1}
                  </div>
                  {[leftIdx, rightIdx].map((answerIdx) => (
                    <input
                      key={answerIdx}
                      type="text"
                      value={answerInputs[answerIdx] ?? ''}
                      onPaste={(e) => handleAnswerInputPaste(e, answerIdx)}
                      onChange={(e) => {
                        const value = e.target.value;
                        setAnswerInputs((prev) => {
                          const next = [...prev];
                          next[answerIdx] = value;
                          return next;
                        });
                      }}
                      className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
                      placeholder={`Ответ ${answerIdx + 1}`}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        );
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: answerCount }).map((_, idx) => (
            <input
              key={idx}
              type="text"
              value={answerInputs[idx] ?? ''}
              onPaste={(e) => handleAnswerInputPaste(e, idx)}
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
      );
    }

    return (
      <input
        type="text"
        value={answerInputs[0] ?? ''}
        onChange={(e) => setAnswerInputs([e.target.value])}
        className="w-full p-3 rounded-xl border outline-none focus:border-purple-500 bg-gray-50"
        placeholder="Введите правильный ответ"
      />
    );
  };

  const renderInlineQuestionEditor = () => (
    <Card
      className={`teacher-question-editor teacher-question-editor--inline question-attachment-drop-card ${isDraggingQuestionAttachments ? 'is-dragging-attachments' : ''}`}
      onDragEnter={handleQuestionAttachmentDragEnter}
      onDragOver={handleQuestionAttachmentDragOver}
      onDragLeave={handleQuestionAttachmentDragLeave}
      onDrop={handleQuestionAttachmentDrop}
    >
      <div className="teacher-question-editor__header">
        <div className="teacher-question-editor__header-content min-w-0">
          <div className="teacher-question-editor__target-banner">
            <div className="teacher-question-editor__target-main">
              <span>Редактируете в</span>
              <strong>
                <b>{selectedTaskContextLabel}</b>
                {selectedTaskTitle}
              </strong>
            </div>
            <div className="teacher-question-editor__target-meta">
              <span>{selectedLevelLabel}</span>
              <span>{`Вопрос №${editorQuestionNumber}`}</span>
            </div>
          </div>
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <span className="teacher-question-editor__title-icon"><Pencil size={18} /></span>
            Редактирование вопроса №{editorQuestionNumber}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Форма открыта прямо под выбранным вопросом — можно править без прокрутки наверх.
          </p>
        </div>
        <button
          type="button"
          onClick={cancelEditQuestion}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Отменить
        </button>
      </div>

      <div className="teacher-question-editor__status-row">
        <span className={hasQuestionCondition ? 'is-ready' : ''}>
          <CheckCircle2 size={14} /> Условие
        </span>
        <span className={questionAttachmentCount > 0 ? 'is-ready' : ''}>
          <Paperclip size={14} /> Материалы {questionAttachmentCount > 0 ? `· ${questionAttachmentCount}` : ''}
        </span>
        <span className={hasQuestionAnswer ? 'is-ready' : ''}>
          <CheckCircle2 size={14} /> Ответ
        </span>
      </div>

      <div className="teacher-question-editor__body" onPaste={handlePasteImages}>
        <div className="teacher-question-editor__inline-grid">
          <section className="teacher-question-editor__section teacher-question-editor__condition-section">
            <div className="teacher-question-editor__section-heading">
              <span className="teacher-question-editor__step">1</span>
              <div>
                <h4>Условие вопроса</h4>
                <p>Текст задания или пояснение ученику.</p>
              </div>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="teacher-question-editor__textarea"
              placeholder="Напишите условие задания, пояснение или инструкцию ученику…"
            />
          </section>

          <aside className="teacher-question-editor__preview">
            <div className="teacher-question-editor__preview-title">
              <span><Eye size={15} /> Предпросмотр</span>
              <span>вид ученика</span>
            </div>
            {questionPreviewImageUrl && (
              <button
                type="button"
                className="teacher-question-editor__preview-image-button"
                onClick={() => openQuestionImageLightbox(questionPreviewImageUrl, questionPreviewImageName)}
                title="Открыть изображение крупно"
              >
                <img
                  src={questionPreviewImageUrl}
                  alt="Предпросмотр условия"
                  className="teacher-question-editor__preview-image"
                />
              </button>
            )}
            <div className={`teacher-question-editor__preview-text ${question.trim() ? '' : 'is-empty'}`}>
              {question.trim() || 'Здесь появится текст вопроса. Можно оставить его пустым, если условие находится на изображении.'}
            </div>
          </aside>
        </div>

        <section className="teacher-question-editor__section teacher-question-editor__label-section">
          <div className="teacher-question-editor__section-heading">
            <span className="teacher-question-editor__step">2</span>
            <div>
              <h4>Метка задачи</h4>
              <p>Необязательная подпись для сложных или особых заданий.</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(120px,0.42fr)]">
            <input
              type="text"
              value={questionLabelText}
              maxLength={QUESTION_LABEL_TEXT_MAX_LENGTH}
              onChange={(event) => setQuestionLabelText(event.target.value)}
              className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-purple-400"
              placeholder="Например: Сложная или С подвохом"
              aria-label="Текст метки задачи"
            />
            <input
              type="color"
              value={normalizeQuestionLabelColor(questionLabelColor)}
              onChange={(event) => setQuestionLabelColor(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-xl border border-purple-100 bg-white p-1 sm:w-12"
              aria-label="Выбрать цвет метки"
            />
            <input
              type="text"
              value={questionLabelColor}
              maxLength={7}
              onChange={(event) => setQuestionLabelColor(event.target.value)}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 font-mono text-sm outline-none ${
                !questionLabelText.trim() || isQuestionLabelColorValid(questionLabelColor)
                  ? 'border-purple-100 focus:border-purple-400'
                  : 'border-red-300 text-red-600 focus:border-red-400'
              }`}
              placeholder="#7c3aed"
              aria-label="HEX-цвет метки"
            />
          </div>
        </section>

        <section className="teacher-question-editor__section teacher-question-editor__materials-section">
          <div className="teacher-question-editor__section-heading">
            <span className="teacher-question-editor__step">3</span>
            <div>
              <h4>Материалы к вопросу</h4>
              <p>Добавьте изображения или доп. файлы. Клик по картинке откроет её крупно.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center justify-between gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                <span className="inline-flex items-center gap-1.5"><ImagePlus size={14} /> Изображения</span>
                <span>{questionScreenshots.length + existingQuestionScreenshots.length}</span>
              </label>
              <div
                onDrop={handleScreenshotsDrop}
                onDragOver={handleScreenshotsDragOver}
                onDragLeave={handleScreenshotsDragLeave}
                className={`teacher-question-editor__drop-zone rounded-2xl border-2 border-dashed p-4 transition-colors ${
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
                  <span className="inline-flex items-center gap-2"><UploadCloud size={18} className="text-purple-500" /> Перетащите изображения</span>
                  <button
                    type="button"
                    onClick={() => screenshotsRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                  >
                    Выбрать
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {screenshotPreviews.map((item, idx) => (
                  <div key={`${item.file.name}-${idx}`} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="bg-gray-50 p-2 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500 truncate">{item.file.name}</span>
                      <button type="button" onClick={() => removeScreenshot(idx)} className="text-xs text-red-500 hover:text-red-600">
                        Удалить
                      </button>
                    </div>
                    <button
                      type="button"
                      className="teacher-question-editor__attached-image-button"
                      onClick={() => openQuestionImageLightbox(item.url, item.file.name)}
                    >
                      <img src={item.url} alt={item.file.name} className="w-full object-contain bg-white" style={{ maxHeight: '260px' }} />
                    </button>
                  </div>
                ))}
                {existingQuestionScreenshots.map((item, idx) => {
                  const imgUrl = withUploadsAuthToken(item?.url || (item?.storageName ? `/uploads/${item.storageName}` : ''));
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
                        <button
                          type="button"
                          className="teacher-question-editor__attached-image-button"
                          onClick={() => openQuestionImageLightbox(imgUrl, item.name || 'Скриншот')}
                        >
                          <img src={imgUrl} alt={item.name || 'Скриншот'} className="w-full object-contain bg-white" style={{ maxHeight: '260px' }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                <span className="inline-flex items-center gap-1.5"><FileText size={14} /> Доп. файлы</span>
                <span>{questionFiles.length + existingQuestionFiles.length}</span>
              </label>
              <div
                onDrop={handleFilesDrop}
                onDragOver={handleFilesDragOver}
                onDragLeave={handleFilesDragLeave}
                className={`teacher-question-editor__drop-zone rounded-2xl border-2 border-dashed p-4 transition-colors ${
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
                  <span className="inline-flex items-center gap-2"><UploadCloud size={18} className="text-purple-500" /> Перетащите файлы</span>
                  <button
                    type="button"
                    onClick={() => filesRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                  >
                    Выбрать
                  </button>
                </div>
              </div>
              {(questionFiles.length > 0 || existingQuestionFiles.length > 0) && (
                <div className="mt-3 space-y-1">
                  {questionFiles.map((entry, idx) => (
                    <div key={entry.id || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                      <span className="truncate">{getQuestionFileName(entry)}</span>
                      <button type="button" onClick={() => removeExtraFile(idx)} className="text-red-500 hover:text-red-600">Удалить</button>
                    </div>
                  ))}
                  {existingQuestionFiles.map((file, idx) => (
                    <div key={file.id || file.storageName || file.url || idx} className="flex items-center justify-between text-xs text-gray-500 gap-2">
                      <span className="truncate">{file.name || 'Файл'}</span>
                      <button
                        type="button"
                        onClick={() => setExistingQuestionFiles((prev) => prev.filter((_, i) => i !== idx))}
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
        </section>

        {questionUploadError && <p className="text-xs text-red-500">{questionUploadError}</p>}

        <section className={answerSectionClassName}>
          <div className="teacher-question-editor__section-heading">
            <span className="teacher-question-editor__step">4</span>
            <div>
              <h4>Правильный ответ</h4>
              <p>{answerCount > 1 ? `Для этого задания нужно заполнить ${answerCount} полей.` : 'Ответ будет использован для автоматической проверки.'}</p>
              {canPasteAnswerTable && renderTeacherAnswerPasteHint()}
            </div>
          </div>
          {renderAnswerInputFields()}
        </section>

        <div className="teacher-question-editor__footer">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-700">Сохранить изменения вопроса №{editorQuestionNumber}</div>
            <div className="mt-0.5 text-[11px] text-gray-500">
              {hasQuestionCondition && hasQuestionAnswer
                ? 'Основные поля заполнены — вопрос готов к сохранению.'
                : 'Нужно добавить условие или изображение и указать правильный ответ.'}
            </div>
          </div>
          <Button onClick={handleSaveQuestion} className="teacher-question-editor__save" disabled={isUploadingQuestion}>
            <Save size={18} /> {isUploadingQuestion ? 'Загрузка...' : 'Сохранить изменения'}
          </Button>
        </div>
      </div>
    </Card>
  );

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
    const grade = normalizeStudentGradeValue(newStudentGrade);
    const egeScore = grade === 'graduate' ? parseOptionalEgeScore(newStudentEgeScore) : null;
    if (typeof egeScore === 'undefined') {
      setStudentActionError('Балл ЕГЭ: целое число от 0 до 100');
      return;
    }
    setStudentActionLoading(true);
    try {
      const created = await api.createStudent(name, teacherId, {
        grade,
        informaticsEgeScore: egeScore,
      });
      const { code, ...rest } = created || {};
      if (rest?.id) onStudentCreated?.(rest);
      if (code) {
        setLastIssuedCode({ name: rest?.name || name, code });
        setIsStudentsExpanded(true);
      }
      setNewStudentName('');
      setNewStudentGrade('11');
      setNewStudentEgeScore('');
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
      if (res?.code) {
        setLastIssuedCode({ name: student.name, code: res.code });
        setIsStudentsExpanded(true);
      }
      if (res?.codeHint) onStudentUpdated?.({ ...student, codeHint: res.codeHint });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      setResettingStudentId(null);
    }
  };

  const handleResetStudentBoard = async (student) => {
    if (!student?.id) return;
    if (!confirm(`Сбросить доску для "${student.name}"? Все элементы на совместной доске будут удалены.`)) return;
    setResettingBoardStudentId(student.id);
    setStudentActionError('');
    try {
      await api.resetStudentBoard(student.id);
      if (typeof window !== 'undefined') {
        window.alert(`Доска ученика "${student.name}" очищена. Можно заново открыть её.`);
      }
    } catch (err) {
      setStudentActionError(err?.message || err);
    } finally {
      setResettingBoardStudentId(null);
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

  const saveStudentFinanceProfile = async (studentId, lessonPrice, commissionAmount) => {
    const normalizedId = String(studentId || '').trim();
    if (!normalizedId) return null;
    let snapshot = teacherFinanceSnapshot;
    if (!snapshot || !Array.isArray(snapshot.students)) {
      snapshot = await api.getTeacherFinance(undefined, teacherId);
    }
    const month = snapshot?.month || getCurrentTeacherFinanceMonthKey();
    const row = getStudentFinanceRow(normalizedId, snapshot);
    const profile = row?.profile && typeof row.profile === 'object' ? row.profile : {};
    const record = row?.record && typeof row.record === 'object' ? row.record : {};
    const payload = {
      month,
      pricingMode: record.pricingMode || profile.pricingMode || 'perLesson',
      lessonPrice,
      commissionAmount,
      monthlyRate: Number.isFinite(Number(record.monthlyRate)) ? Number(record.monthlyRate) : Number(profile.monthlyRate) || 0,
      plannedLessons: Number.isFinite(Number(record.plannedLessons)) ? Number(record.plannedLessons) : Number(profile.plannedLessons) || 0,
      completedLessons: Number(record.completedLessons) || 0,
      cancelledLessons: Number(record.cancelledLessons) || 0,
      paidAmount: Number(record.paidAmount) || 0,
      extraCharge: Number(record.extraCharge) || 0,
      discount: Number(record.discount) || 0,
      expenses: Number(record.expenses) || 0,
      paymentDay: record.paymentDay ?? profile.paymentDay ?? null,
      note: typeof record.note === 'string' && record.note.trim()
        ? record.note.trim()
        : (typeof profile.note === 'string' ? profile.note.trim() : ''),
    };
    const nextSnapshot = await api.updateTeacherFinanceStudent(normalizedId, payload, teacherId);
    setTeacherFinanceSnapshot(nextSnapshot && typeof nextSnapshot === 'object' ? nextSnapshot : snapshot);
    setTeacherFinanceError('');
    return nextSnapshot;
  };

  const handlePaymentSenderDraftChange = (studentId, value) => {
    const normalizedId = String(studentId || '').trim();
    if (!normalizedId) return;
    setPaymentSenderDrafts((prev) => ({
      ...prev,
      [normalizedId]: value,
    }));
    setPaymentSenderLinksError('');
  };

  const handleAddPaymentSenderLink = async (student) => {
    const studentId = String(student?.id || '').trim();
    if (!studentId) return;
    const senderName = String(paymentSenderDrafts[studentId] || '').trim();
    if (!senderName) {
      setPaymentSenderLinksError('Введите имя отправителя из уведомления Т-Банка.');
      return;
    }
    setPaymentSenderSavingKey(`add:${studentId}`);
    setPaymentSenderLinksError('');
    try {
      const data = await api.updatePaymentSenderLink({ senderName, studentId }, teacherId);
      setPaymentSenderLinks(Array.isArray(data?.links) ? data.links : []);
      setPaymentSenderDrafts((prev) => ({ ...prev, [studentId]: '' }));
    } catch (err) {
      setPaymentSenderLinksError(err?.message || String(err));
      await loadPaymentSenderLinks();
    } finally {
      setPaymentSenderSavingKey('');
    }
  };

  const handleRemovePaymentSenderLink = async (senderName) => {
    const normalizedSenderName = String(senderName || '').trim();
    if (!normalizedSenderName) return;
    setPaymentSenderSavingKey(`remove:${normalizedSenderName}`);
    setPaymentSenderLinksError('');
    try {
      const data = await api.updatePaymentSenderLink({ senderName: normalizedSenderName, unset: true }, teacherId);
      setPaymentSenderLinks(Array.isArray(data?.links) ? data.links : []);
    } catch (err) {
      setPaymentSenderLinksError(err?.message || String(err));
      await loadPaymentSenderLinks();
    } finally {
      setPaymentSenderSavingKey('');
    }
  };

  const startEditStudent = (student) => {
    if (!student?.id) return;
    const lessonPrice = toFinanceInputValue(getStudentLessonPrice(student.id));
    const commissionAmount = toFinanceInputValue(getStudentCommissionAmount(student.id));
    setIsStudentsExpanded(true);
    setEditingStudentId(student.id);
    setEditStudentName(student.name || '');
    setEditStudentNickname(student.nickname || '');
    setEditStudentLessonPrice(lessonPrice);
    setEditStudentLessonPriceInitial(lessonPrice);
    setEditStudentCommissionAmount(commissionAmount);
    setEditStudentCommissionAmountInitial(commissionAmount);
    setEditStudentGrade(normalizeStudentGradeValue(student.grade));
    setEditStudentEgeScore(
      typeof student.informaticsEgeScore === 'number'
        ? String(student.informaticsEgeScore)
        : ''
    );
    const alias = typeof student.leaderboardAlias === 'string' ? student.leaderboardAlias : '';
    setEditStudentLeaderboardAlias(alias);
    setEditStudentLeaderboardAliasInitial(alias);
    setEditStudentCoinsGrant('');
    setEditStudentError('');
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setEditStudentName('');
    setEditStudentNickname('');
    setEditStudentLessonPrice('');
    setEditStudentLessonPriceInitial('');
    setEditStudentCommissionAmount('');
    setEditStudentCommissionAmountInitial('');
    setEditStudentGrade('11');
    setEditStudentEgeScore('');
    setEditStudentLeaderboardAlias('');
    setEditStudentLeaderboardAliasInitial('');
    setEditStudentCoinsGrant('');
    setEditStudentError('');
  };

  const saveEditStudent = async (student) => {
    if (!student?.id) return;
    const nextName = editStudentName.trim();
    const nextAlias = String(editStudentLeaderboardAlias || '').trim();
    const initialAlias = String(editStudentLeaderboardAliasInitial || '').trim();
    const aliasChanged = nextAlias !== initialAlias;
    const rawCoinsGrant = String(editStudentCoinsGrant || '').trim();
    const nextGrade = normalizeStudentGradeValue(editStudentGrade);
    const egeScore = nextGrade === 'graduate' ? parseOptionalEgeScore(editStudentEgeScore) : null;
    const nextLessonPrice = parseLessonPriceInput(editStudentLessonPrice);
    const initialLessonPrice = parseLessonPriceInput(editStudentLessonPriceInitial);
    const nextCommissionAmount = parseLessonPriceInput(editStudentCommissionAmount);
    const initialCommissionAmount = parseLessonPriceInput(editStudentCommissionAmountInitial);
    setEditStudentError('');
    if (!nextName) {
      setEditStudentError('Введите имя ученика');
      return;
    }
    if (nextName.length > 60) {
      setEditStudentError('Имя слишком длинное');
      return;
    }
    if (/[/\\]/.test(nextName)) {
      setEditStudentError('Недопустимые символы');
      return;
    }
    if (aliasChanged && nextAlias && !/^[А-Яа-яЁё]{2,6}$/.test(nextAlias)) {
      setEditStudentError('Псевдоним: 2-6 символов, только русские буквы.');
      return;
    }
    if (rawCoinsGrant) {
      if (!/^\d+$/.test(rawCoinsGrant)) {
        setEditStudentError('Монеты: только целое число не меньше 0.');
        return;
      }
      if (Number(rawCoinsGrant) <= 0) {
        setEditStudentError('Чтобы выдать монеты, введите число больше 0.');
        return;
      }
    }
    if (typeof egeScore === 'undefined') {
      setEditStudentError('Балл ЕГЭ: целое число от 0 до 100');
      return;
    }
    if (typeof nextLessonPrice === 'undefined') {
      setEditStudentError('Стоимость урока: введите число не меньше 0.');
      return;
    }
    if (typeof nextCommissionAmount === 'undefined') {
      setEditStudentError('Комиссия: введите число не меньше 0.');
      return;
    }

    setEditStudentSaving(true);
    try {
      const payload = {
        name: nextName,
        nickname: editStudentNickname,
        grade: nextGrade,
        informaticsEgeScore: egeScore,
      };
      if (aliasChanged) payload.leaderboardAlias = nextAlias;
      if (rawCoinsGrant) payload.coinsGrant = Number(rawCoinsGrant);
      const res = await api.updateStudent(student.id, payload);
      onStudentUpdated?.({ ...student, ...res });
      if (nextLessonPrice !== initialLessonPrice || nextCommissionAmount !== initialCommissionAmount) {
        await saveStudentFinanceProfile(student.id, nextLessonPrice, nextCommissionAmount);
      }
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
  const selectedSignupChatSummary = signupChats.find((chat) => chat.id === selectedSignupChatId) || null;
  const selectedSignupChat = signupChatDetails?.id === selectedSignupChatId
    ? signupChatDetails
    : selectedSignupChatSummary;
  const isDeletingSelectedSignupChat = Boolean(selectedSignupChatId && signupChatDeletingId === selectedSignupChatId);
  const canToggleTeacherSignupNotify = typeof onToggleTeacherSignupNotify === 'function'
    && !teacherSignupNotifyBusy
    && !teacherSignupNotifySyncing
    && teacherSignupNotifyReady;
  const resolvedTeacherSignupNotifyStatus = teacherSignupNotifyStatusText
    || (teacherSignupNotifyPermission === 'denied'
      ? 'Уведомления заблокированы в настройках браузера.'
      : 'Включите уведомления, чтобы не пропускать новые сообщения.');


  return (
    <div className="teacher-panel-shell animate-fadeIn pb-10">
      <div className={`teacher-panel-hero ${isTestsMode ? '' : 'teacher-panel-hero--simple'}`}>
        <div className="teacher-panel-hero__copy">
          <h2 className="teacher-panel-title text-2xl font-bold text-gray-900 flex items-center gap-2">
            {isSignupChatsMode ? <MessageSquare className="text-purple-600" /> : <Settings className="text-purple-600" />}
            {isSignupChatsMode ? 'Чаты с записывающимися' : 'Панель учителя'}
          </h2>
          <p className="teacher-panel-subtitle text-gray-500">
            {isSignupChatsMode
              ? 'Сообщения от людей, которые нажали "Я хочу записаться"'
              : 'Тесты, ученики и служебные действия в одном рабочем месте'}
          </p>
          {isTestsMode && testsLoading && <p className="text-xs text-gray-400 mt-2">Загрузка базы тестов...</p>}
          {isTestsMode && testsError && <p className="text-xs text-red-500 mt-2">{testsError}</p>}
        </div>

        {isTestsMode && (
          <div className="teacher-panel-hero__stats" aria-label="Сводка панели учителя">
            <div className="teacher-panel-stat">
              <span>Ученики</span>
              <strong>{studentsList.length}</strong>
              <small>{activeStudentLabel}</small>
            </div>
            <div className="teacher-panel-stat">
              <span>Текущий уровень</span>
              <strong>{selectedLevelLabel}</strong>
              <small>{`Задание ${selectedTaskDisplay}`}</small>
            </div>
            <div className="teacher-panel-stat">
              <span>Вопросы</span>
              <strong>{currentQuestions.length}</strong>
              <small>{selectedTaskTitle}</small>
            </div>
          </div>
        )}
      </div>

      {isSignupChatsMode && (
      <Card className="teacher-signup-card mb-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="teacher-signup-title flex items-center gap-2 text-lg font-bold text-gray-800">
              <MessageSquare size={20} className="text-purple-600" />
              Чаты с записывающимися
            </h3>
            <p className="teacher-signup-subtitle text-xs text-gray-500">
              Сообщения от людей, которые нажали "Я хочу записаться"
            </p>
          </div>
          <span className="teacher-signup-count text-xs text-gray-500">Всего чатов: {signupChats.length}</span>
        </div>

        <div className="teacher-signup-notify mb-3 rounded-xl border border-purple-200/80 bg-gradient-to-r from-purple-50 via-white to-fuchsia-50 px-3 py-2.5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-purple-600">
                Уведомления
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {resolvedTeacherSignupNotifyStatus}
              </div>
              {teacherSignupNotifyError && (
                <div className="mt-1 text-xs text-red-500">{teacherSignupNotifyError}</div>
              )}
            </div>
            <Button
              type="button"
              variant={teacherSignupNotifyEnabled ? 'secondary' : 'primary'}
              onClick={() => onToggleTeacherSignupNotify?.()}
              disabled={!canToggleTeacherSignupNotify || (!teacherSignupNotifySupported && !teacherSignupNotifyEnabled)}
              className="sm:ml-3"
            >
              {teacherSignupNotifyEnabled ? <BellOff size={16} /> : <Bell size={16} />}
              {teacherSignupNotifyBusy || teacherSignupNotifySyncing
                ? 'Сохраняем...'
                : (teacherSignupNotifyEnabled ? 'Отключить уведомления' : 'Включить уведомления')}
            </Button>
          </div>
        </div>

        {signupChatsError && <p className="mb-3 text-xs text-red-500">{signupChatsError}</p>}

        <div className="teacher-signup-grid grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <div className="teacher-signup-list max-h-[430px] space-y-2 overflow-y-auto pr-1">
            {signupChatsLoading && signupChats.length === 0 ? (
              <div className="teacher-signup-list-state rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Загружаем чаты...
              </div>
            ) : signupChats.length === 0 ? (
              <div className="teacher-signup-list-state rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Пока нет новых заявок.
              </div>
            ) : (
              signupChats.map((chat) => {
                const isActive = chat.id === selectedSignupChatId;
                const unread = Number(chat?.unreadForTeacher) || 0;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => setSelectedSignupChatId(chat.id)}
                    className={`teacher-signup-item w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'teacher-signup-item--active border-purple-300 bg-purple-50'
                        : 'border-gray-200 bg-white hover:border-purple-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">{chat.guestName || 'Гость'}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {chat.lastMessagePreview || 'Новый чат без сообщений'}
                        </p>
                      </div>
                      {unread > 0 && (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-purple-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {unread}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      {formatSignupDateTime(chat.lastMessageAt || chat.createdAt)}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="teacher-signup-thread rounded-2xl border border-gray-200 bg-gray-50/70 p-3">
            {!selectedSignupChatId ? (
              <div className="teacher-signup-empty flex min-h-[260px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white text-sm text-gray-500">
                Выберите чат слева.
              </div>
            ) : (
              <>
                <div className="teacher-signup-thread-header flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white bg-white px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {selectedSignupChat?.guestName || 'Гость'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Создан: {formatSignupDateTime(selectedSignupChat?.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">
                      {selectedSignupChat?.messageCount || 0} сообщений
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={handleDeleteSignupChat}
                      disabled={isDeletingSelectedSignupChat}
                      className="h-8 min-w-[122px] px-3 text-xs"
                    >
                      <Trash2 size={14} />
                      {isDeletingSelectedSignupChat ? 'Удаление...' : 'Удалить чат'}
                    </Button>
                  </div>
                </div>

                <div
                  ref={signupMessagesRef}
                  className="teacher-signup-messages mt-3 max-h-[320px] min-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3"
                >
                  {signupMessagesLoading ? (
                    <div className="text-sm text-gray-500">Загружаем переписку...</div>
                  ) : signupMessages.length === 0 ? (
                    <div className="text-sm text-gray-500">Пока сообщений нет.</div>
                  ) : (
                    signupMessages.map((message) => {
                      const isTeacherMessage = message?.senderRole === 'teacher';
                      const messageId = typeof message?.id === 'string' ? message.id.trim() : '';
                      const isEditingMessage = Boolean(
                        isTeacherMessage &&
                        messageId &&
                        editingSignupMessageId === messageId
                      );
                      const isUpdatingMessage = Boolean(messageId && signupMessageUpdatingId === messageId);
                      const isDeletingMessage = Boolean(messageId && signupMessageDeletingId === messageId);
                      const messageActionsBusy = signupMessageSending || isDeletingSelectedSignupChat || Boolean(signupMessageDeletingId) || Boolean(signupMessageUpdatingId);
                      return (
                        <div key={message.id} className={`flex ${isTeacherMessage ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`teacher-signup-bubble max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                              isTeacherMessage
                                ? 'teacher-signup-bubble--teacher bg-purple-600 text-white'
                                : 'teacher-signup-bubble--guest border border-gray-200 bg-gray-50 text-gray-800'
                            }`}
                          >
                            {!isTeacherMessage && (
                              <div className="mb-1 text-[11px] font-semibold text-purple-600">
                                {message?.senderName || selectedSignupChat?.guestName || 'Гость'}
                              </div>
                            )}
                            {isEditingMessage ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingSignupMessageText}
                                  onChange={(event) => setEditingSignupMessageText(event.target.value)}
                                  onKeyDown={(event) => {
                                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                                      event.preventDefault();
                                      handleSaveSignupMessageEdit();
                                      return;
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      handleCancelSignupMessageEdit();
                                    }
                                  }}
                                  rows={3}
                                  className="w-full resize-none rounded-lg border border-white/30 bg-white/10 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/70 focus:border-white/60"
                                  placeholder="Отредактируйте сообщение..."
                                  disabled={isUpdatingMessage || isDeletingMessage}
                                />
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={handleCancelSignupMessageEdit}
                                    className="rounded-md border border-white/30 px-2 py-1 text-[11px] font-semibold text-white/90 transition hover:bg-white/10"
                                    disabled={isUpdatingMessage || isDeletingMessage}
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveSignupMessageEdit}
                                    className="rounded-md border border-white/30 bg-white/15 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-white/25 disabled:opacity-60"
                                    disabled={isUpdatingMessage || isDeletingMessage || !editingSignupMessageText.trim()}
                                  >
                                    {isUpdatingMessage ? 'Сохраняем...' : 'Сохранить'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <LinkifiedText
                                text={message?.text || ''}
                                className="whitespace-pre-wrap break-words"
                                linkClassName={isTeacherMessage ? 'underline decoration-white/70 underline-offset-2' : 'text-purple-700 underline decoration-purple-400 underline-offset-2'}
                              />
                            )}
                            <div className={`mt-1 flex items-center justify-between gap-2 text-[10px] ${isTeacherMessage ? 'text-purple-100' : 'text-gray-400'}`}>
                              <span>
                                {formatSignupDateTime(message?.createdAt)}
                                {message?.editedAt ? ' • изменено' : ''}
                              </span>
                              {isTeacherMessage && !isEditingMessage && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartSignupMessageEdit(message)}
                                    className="rounded-md border border-white/25 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 transition hover:bg-white/10 disabled:opacity-50"
                                    disabled={messageActionsBusy || isUpdatingMessage || isDeletingMessage}
                                    title="Редактировать сообщение"
                                  >
                                    Ред.
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSignupMessage(message)}
                                    className="rounded-md border border-rose-200/40 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                                    disabled={messageActionsBusy || isUpdatingMessage || isDeletingMessage}
                                    title="Удалить сообщение"
                                  >
                                    {isDeletingMessage ? '...' : 'Удал.'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <textarea
                    value={signupMessageText}
                    onChange={(event) => setSignupMessageText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSendSignupMessage();
                      }
                    }}
                    rows={3}
                    placeholder="Ответить в чат..."
                    className="teacher-signup-textarea w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500"
                  />
                  <Button
                    type="button"
                    onClick={handleSendSignupMessage}
                    disabled={signupMessageSending || isDeletingSelectedSignupChat || !signupMessageText.trim() || !selectedSignupChatId}
                    className="teacher-signup-send h-[46px] min-w-[136px] self-end sm:self-stretch"
                  >
                    <SendHorizontal size={16} />
                    {signupMessageSending ? 'Отправка...' : 'Отправить'}
                  </Button>
                </div>
                {signupMessagesError && <p className="mt-2 text-xs text-red-500">{signupMessagesError}</p>}
              </>
            )}
          </div>
        </div>
      </Card>
      )}

      {isTestsMode && (
      <>
      <div className="teacher-panel-admin-grid">
      <div className="teacher-panel-broadcast-stack">
        <BroadcastNotificationsPanel role={role} />
      </div>

      <Card className="teacher-panel-card teacher-students-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Ученики</h3>
            <p className="text-xs text-gray-500">
              {`Всего: ${studentsList.length} • Конспекты: ${formatStorageBytes(totalNotesUsageBytes)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {studentsError && <span className="text-xs text-red-500">{studentsError}</span>}
            <button
              type="button"
              onClick={() => setIsStudentsExpanded((prev) => !prev)}
              className="teacher-broadcast-history__toggle inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-purple-200 hover:text-purple-700"
              aria-expanded={isStudentsExpanded}
            >
              {isStudentsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {isStudentsExpanded ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
        </div>

        {!isStudentsExpanded ? (
          <div className="text-sm text-gray-500">
            Разверни блок, чтобы посмотреть список учеников и управлять им.
          </div>
        ) : (
        <>
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <input
            type="text"
            value={newStudentName}
            onChange={(e) => { setNewStudentName(e.target.value); setStudentActionError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateStudent(); }}
            placeholder="Имя ученика"
            className="flex-1 px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none"
          />
          <div className="inline-flex shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-1">
            {STUDENT_GRADE_OPTIONS.map((option) => {
              const isActive = normalizeStudentGradeValue(newStudentGrade) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNewStudentGrade(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-white'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {normalizeStudentGradeValue(newStudentGrade) === 'graduate' && (
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              inputMode="numeric"
              value={newStudentEgeScore}
              onChange={(e) => {
                setNewStudentEgeScore(normalizeEgeScoreInput(e.target.value));
                setStudentActionError('');
              }}
              placeholder="Балл ЕГЭ"
              className="w-full px-4 py-2 rounded-xl bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none md:w-32"
            />
          )}
          <Button onClick={handleCreateStudent} disabled={studentActionLoading || !newStudentName.trim()}>
            <Plus size={16}/> Добавить
          </Button>
        </div>
        {studentActionError && <p className="text-xs text-red-500 mb-3">{studentActionError}</p>}
        {teacherFinanceError && (
          <p className="text-xs text-amber-600 mb-3">Стоимость уроков: {teacherFinanceError}</p>
        )}
        {paymentSenderLinksError && (
          <p className="text-xs text-red-500 mb-3">Плательщики: {paymentSenderLinksError}</p>
        )}
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
            studentsList.map((student) => {
              const studentXpTotal = normalizeXpTotal(student?.xpTotal);
              const studentCoinsTotal = Math.max(0, Math.floor(Number(student?.coinsTotal) || 0));
              const studentNotesUsageBytes = normalizeStorageBytes(student?.notesUsageBytes);
              const studentLessonPrice = getStudentLessonPrice(student.id);
              const studentFinanceRow = getStudentFinanceRow(student.id);
              const studentProfitability = studentFinanceRow?.profitability && typeof studentFinanceRow.profitability === 'object'
                ? studentFinanceRow.profitability
                : {};
              const studentCommissionAmount = getStudentCommissionAmount(student.id);
              const studentProfitabilityLessonCount = Math.max(0, Math.floor(Number(studentProfitability.lessonCount) || 0));
              const studentGrossRevenue = Math.max(0, Number(studentProfitability.grossRevenue) || 0);
              const studentNetAfterCommission = Number.isFinite(Number(studentProfitability.netAfterCommission))
                ? Number(studentProfitability.netAfterCommission)
                : studentGrossRevenue - studentCommissionAmount;
              const studentRemainingToPayback = Math.max(
                0,
                Number.isFinite(Number(studentProfitability.remainingToPayback))
                  ? Number(studentProfitability.remainingToPayback)
                  : studentCommissionAmount - studentGrossRevenue
              );
              const studentCommissionPaidBack = studentCommissionAmount > 0
                && (studentProfitability.isPaidBack === true || studentGrossRevenue >= studentCommissionAmount);
              const studentPaybackPercent = Math.max(
                0,
                Math.min(
                  100,
                  Number.isFinite(Number(studentProfitability.paybackPercent))
                    ? Number(studentProfitability.paybackPercent)
                    : (studentCommissionAmount > 0 ? (studentGrossRevenue / studentCommissionAmount) * 100 : 0)
                )
              );
              const studentPaymentSenderLinks = getStudentPaymentSenderLinks(student.id);
              const rawStudentLevel = Number(student?.level);
              const studentLevel = Number.isFinite(rawStudentLevel) && rawStudentLevel > 0
                ? Math.floor(rawStudentLevel)
                : (typeof getLevelFromXp === 'function' ? getLevelFromXp(studentXpTotal) : 1);
              const studentXpLabel = studentXpTotal.toLocaleString('ru-RU');
              const studentCoinsLabel = studentCoinsTotal.toLocaleString('ru-RU');
              const studentGrade = normalizeStudentGradeValue(student.grade);
              const studentGradeLabel = getStudentGradeLabel(student.grade);
              const studentEgeScore = Number(student?.informaticsEgeScore);
              const hasStudentEgeScore = studentGrade === 'graduate'
                && Number.isInteger(studentEgeScore)
                && studentEgeScore >= 0
                && studentEgeScore <= 100;
              return (
                <div
                  key={student.id}
                  onClick={() => onSelectStudent?.(student.id)}
                  className={`teacher-student-card p-3 rounded-xl border flex items-start justify-between gap-3 cursor-pointer transition-all ${
                    activeStudentId === student.id
                      ? 'teacher-student-card--active border-purple-300 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-purple-200'
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
                          placeholder="Имя2 (только для вас)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="block min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-gray-500">Стоимость занятия</span>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={editStudentLessonPrice}
                                onChange={(e) => setEditStudentLessonPrice(normalizeFinanceNumberInput(e.target.value).replace(/[^\d.]/g, ''))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEditStudent(student);
                                  if (e.key === 'Escape') cancelEditStudent();
                                }}
                                placeholder={teacherFinanceLoading ? 'Загрузка...' : '0'}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-sm outline-none focus:border-purple-500"
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">₽</span>
                            </div>
                          </label>
                          <label className="block min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-gray-500">Комиссия за ученика</span>
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={editStudentCommissionAmount}
                                onChange={(e) => setEditStudentCommissionAmount(normalizeFinanceNumberInput(e.target.value).replace(/[^\d.]/g, ''))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveEditStudent(student);
                                  if (e.key === 'Escape') cancelEditStudent();
                                }}
                                placeholder={teacherFinanceLoading ? 'Загрузка...' : '0'}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-3 pr-8 text-sm outline-none focus:border-purple-500"
                                aria-describedby={`student-commission-hint-${student.id}`}
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">₽</span>
                            </div>
                            <span id={`student-commission-hint-${student.id}`} className="mt-1 block text-[10px] text-gray-400">
                              Разовый расход за привлечение
                            </span>
                          </label>
                        </div>
                        <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2">
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold uppercase text-sky-700">
                              Плательщики Т-Банка
                            </span>
                            {paymentSenderLinksLoading && (
                              <span className="text-[11px] text-sky-600">загрузка...</span>
                            )}
                          </div>
                          {studentPaymentSenderLinks.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {studentPaymentSenderLinks.map((link) => {
                                const senderName = String(link?.senderName || '').trim();
                                const removeKey = `remove:${senderName}`;
                                return (
                                  <span
                                    key={link.senderKey || senderName}
                                    className="inline-flex min-w-0 items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-1 text-[11px] font-semibold text-sky-700"
                                  >
                                    <span className="max-w-[180px] truncate">{senderName}</span>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleRemovePaymentSenderLink(senderName);
                                      }}
                                      disabled={paymentSenderSavingKey === removeKey}
                                      className="rounded-full p-0.5 text-sky-500 hover:bg-sky-100 hover:text-sky-700 disabled:opacity-50"
                                      title="Удалить привязку"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="text"
                              value={paymentSenderDrafts[student.id] || ''}
                              onChange={(e) => handlePaymentSenderDraftChange(student.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddPaymentSenderLink(student);
                              }}
                              placeholder="Имя отправителя из банка"
                              className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                            />
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleAddPaymentSenderLink(student);
                              }}
                              disabled={paymentSenderSavingKey === `add:${student.id}` || !String(paymentSenderDrafts[student.id] || '').trim()}
                              className="inline-flex items-center justify-center gap-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
                            >
                              <Plus size={14} />
                              Привязать
                            </button>
                          </div>
                        </div>
                        <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                          {STUDENT_GRADE_OPTIONS.map((option) => {
                            const isActive = normalizeStudentGradeValue(editStudentGrade) === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setEditStudentGrade(option.value)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                  isActive
                                    ? 'bg-purple-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:bg-white'
                                }`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        {normalizeStudentGradeValue(editStudentGrade) === 'graduate' && (
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            inputMode="numeric"
                            value={editStudentEgeScore}
                            onChange={(e) => setEditStudentEgeScore(normalizeEgeScoreInput(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditStudent(student);
                              if (e.key === 'Escape') cancelEditStudent();
                            }}
                            placeholder="Балл ЕГЭ по информатике"
                            className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                          />
                        )}
                        <input
                          type="text"
                          value={editStudentLeaderboardAlias}
                          onChange={(e) => {
                            const next = String(e.target.value || '')
                              .replace(/[^А-Яа-яЁё]/g, '')
                              .slice(0, 6);
                            setEditStudentLeaderboardAlias(next);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditStudent(student);
                            if (e.key === 'Escape') cancelEditStudent();
                          }}
                          placeholder="Псевдоним в рейтинге (пусто = аноним)"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 focus:border-purple-500 outline-none text-sm"
                        />
                        <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2">
                          <div className="text-[11px] font-semibold text-amber-700">
                            {`Сейчас у ученика: ${studentCoinsLabel} монет`}
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={editStudentCoinsGrant}
                            onChange={(e) => setEditStudentCoinsGrant(String(e.target.value || '').replace(/[^\d]/g, ''))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditStudent(student);
                              if (e.key === 'Escape') cancelEditStudent();
                            }}
                            placeholder="Выдать монеты"
                            className="mt-2 w-full px-3 py-2 rounded-lg bg-white border border-amber-200 focus:border-amber-400 outline-none text-sm"
                          />
                          <p className="mt-1 text-[11px] text-amber-700/80">Введите, сколько монет добавить к текущему балансу.</p>
                        </div>
                        <p className="text-[11px] text-gray-500">2-6 русских букв, плохие слова блокируются.</p>
                        {editStudentError && <p className="text-xs text-red-500">{editStudentError}</p>}
                      </div>
                    ) : (
                      <>
                        <p className="teacher-student-card__name font-medium text-gray-800 truncate">{student.name}</p>
                        {student.nickname && (
                          <p className="teacher-student-card__nickname text-xs text-purple-600 truncate">Имя2: {student.nickname}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className="teacher-student-card__pill inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700"
                            data-tone="level"
                          >
                            {`Ур. ${studentLevel}`}
                          </span>
                          <span
                            className="teacher-student-card__pill inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                            data-tone="xp"
                          >
                            {`${studentXpLabel} XP`}
                          </span>
                          <span
                            className="teacher-student-card__pill inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"
                            data-tone="coins"
                          >
                            {`${studentCoinsLabel} монет`}
                          </span>
                          <span
                            className="teacher-student-card__pill inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700"
                            data-tone="grade"
                          >
                            {studentGradeLabel}
                          </span>
                          {studentLessonPrice > 0 && (
                            <span
                              className="teacher-student-card__pill inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700"
                              data-tone="lesson-price"
                            >
                              {`Урок ${formatLessonPrice(studentLessonPrice)}`}
                            </span>
                          )}
                          {studentPaymentSenderLinks.length > 0 && (
                            <span
                              className="teacher-student-card__pill inline-flex max-w-full items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                              data-tone="payment-senders"
                            >
                              <span className="truncate">
                                {`Т-Банк: ${studentPaymentSenderLinks.map((link) => link.senderName).filter(Boolean).join(', ')}`}
                              </span>
                            </span>
                          )}
                          {hasStudentEgeScore && (
                            <span
                              className="teacher-student-card__pill inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                              data-tone="ege-score"
                            >
                              {`ЕГЭ ${studentEgeScore}`}
                            </span>
                          )}
                          <span
                            className="teacher-student-card__pill inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700"
                            data-tone="notes"
                          >
                            {`Конспекты: ${formatStorageBytes(studentNotesUsageBytes)}`}
                          </span>
                        </div>
                        {studentCommissionAmount > 0 && (
                          <div
                            className={`teacher-student-card__profitability mt-2 rounded-xl border px-3 py-2 ${
                              studentCommissionPaidBack
                                ? 'border-emerald-200 bg-emerald-50/80'
                                : 'border-amber-200 bg-amber-50/80'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                                  Окупаемость комиссии
                                </div>
                                <div className="mt-0.5 text-xs font-semibold text-gray-700">
                                  {`${formatLessonCount(studentProfitabilityLessonCount)} · ${formatFinanceMoney(studentGrossRevenue)} доход`}
                                </div>
                              </div>
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                  studentCommissionPaidBack
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {studentCommissionPaidBack
                                  ? `Окуплена · +${formatFinanceMoney(Math.max(0, studentNetAfterCommission))}`
                                  : `Осталось ${formatFinanceMoney(studentRemainingToPayback)}`}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/90 ring-1 ring-black/5">
                                <div
                                  className={`h-full rounded-full ${studentCommissionPaidBack ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  style={{ width: `${studentPaybackPercent}%` }}
                                />
                              </div>
                              <span className={`text-[10px] font-bold ${studentCommissionPaidBack ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {`${Math.round(studentPaybackPercent)}%`}
                              </span>
                            </div>
                          </div>
                        )}
                        <p className="teacher-student-card__meta text-xs text-gray-500 truncate">
                          Рейтинг:{' '}
                          <span className="teacher-student-card__meta-value font-medium text-gray-700">
                            {student.leaderboardAlias || 'аноним'}
                          </span>
                        </p>
                        <p className="teacher-student-card__meta text-xs text-gray-500">
                          Код:{' '}
                          <span className="teacher-student-card__meta-value font-mono">
                            {student.codeHint ? `****${student.codeHint}` : 'скрыт'}
                          </span>
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
                          onClick={(e) => { e.stopPropagation(); handleResetStudentBoard(student); }}
                          className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          title="Очистить совместную доску"
                          disabled={resettingBoardStudentId === student.id}
                          type="button"
                        >
                          {resettingBoardStudentId === student.id ? '...' : 'Сбросить доску'}
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
              );
            })
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
                const studentGrade = normalizeStudentGradeValue(student.grade);
                const studentEgeScore = Number(student?.informaticsEgeScore);
                const hasStudentEgeScore = studentGrade === 'graduate'
                  && Number.isInteger(studentEgeScore)
                  && studentEgeScore >= 0
                  && studentEgeScore <= 100;
                return (
                  <div
                    key={student.id}
                    className="p-3 rounded-xl border border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-700 truncate">{student.name}</p>
                      {student.nickname && (
                        <p className="text-xs text-purple-600 truncate">Имя2: {student.nickname}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Класс: {getStudentGradeLabel(student.grade)}
                        {hasStudentEgeScore ? ` • ЕГЭ ${studentEgeScore}` : ''}
                      </p>
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
        </>
        )}
      </Card>
      </div>

      <Card className={`teacher-panel-card teacher-code-card ${isTeacherCodeExpanded ? 'is-expanded' : ''}`}>
        <div className="teacher-code-card__header">
          <div className="teacher-code-card__title">
            <span className="teacher-code-card__icon">
              <Settings size={16} />
            </span>
            <div>
              <h3>Код учителя</h3>
              <p>Смена кода входа</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTeacherCodeExpanded((prev) => !prev)}
            className="teacher-panel-toggle"
            aria-expanded={isTeacherCodeExpanded}
          >
            {isTeacherCodeExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {isTeacherCodeExpanded ? 'Свернуть' : 'Развернуть'}
          </button>
        </div>

        {!isTeacherCodeExpanded ? (
          <div className="teacher-code-card__preview">Код скрыт и меняется только при необходимости.</div>
        ) : (
          <>
            <div className="teacher-code-card__form">
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
              <Button onClick={handleChangeTeacherCode} disabled={teacherCodeSaving} className="teacher-code-card__button">
                {teacherCodeSaving ? 'Сохранение...' : 'Обновить код'}
              </Button>
            </div>
            <span className="teacher-code-card__hint">Код хранится в зашифрованном виде. Новый код вступит в силу сразу.</span>
          </>
        )}
        {teacherCodeError && <p className="text-xs text-red-500 mt-2">{teacherCodeError}</p>}
        {teacherCodeSuccess && <p className="text-xs text-green-600 mt-2">{teacherCodeSuccess}</p>}
      </Card>

      <div className="teacher-test-builder-layout" style={selectedTaskAccentStyle}>
        {/* LEFT COLUMN: Controls */}
        <div className="teacher-test-builder-controls">
          <Card className="teacher-test-builder-control-card teacher-test-builder-control-card--task teacher-task-selector-card">
            <label className="block text-sm font-medium text-gray-700 mb-2">Куда добавляем вопрос</label>
            <div className="teacher-task-selector-card__current">
              <span>{selectedTaskContextLabel}</span>
              <strong>{selectedTaskTitle}</strong>
              <small>Новый вопрос сохранится именно в этот раздел.</small>
            </div>
            <select 
              value={selectedTask} 
              onChange={(e) => setSelectedTask(Number(e.target.value))}
              className="teacher-task-selector-card__select w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none focus:border-purple-500"
            >
              {tasksList.map(t => (
                <option key={t.id} value={t.number}>Задание {getTaskDisplayNumber(t)}: {t.title}</option>
              ))}
            </select>
          </Card>

          <Card className="teacher-test-builder-control-card teacher-test-builder-control-card--levels">
            <label className="block text-sm font-medium text-gray-700 mb-2">Уровень сложности</label>
            <div className="teacher-test-builder-levels">
              {Object.values(LEVELS).map((lvl) => (
                <button
                  key={lvl.id}
                  onClick={() => setSelectedLevel(lvl.id)}
                  className={`teacher-test-builder-level p-3 rounded-xl border text-left flex justify-between items-center transition-all ${
                    selectedLevel === lvl.id 
                    ? `is-selected border-purple-500 bg-purple-50 text-purple-700 ring-1 ring-purple-500`
                    : 'border-gray-200 hover:border-purple-300 text-gray-600'
                  }`}
                >
                  <span className="font-medium">{lvl.label}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded border opacity-70">до {lvl.maxScore}%</span>
                </button>
              ))}
            </div>
          </Card>

          <Card className="teacher-test-builder-control-card teacher-question-insert-card">
            <label htmlFor="teacher-question-insert-mode">Место нового вопроса</label>
            <select
              id="teacher-question-insert-mode"
              value={questionInsertMode}
              onChange={(event) => handleQuestionInsertModeChange(event.target.value)}
              disabled={Boolean(editingQuestionId)}
              className="teacher-question-insert-card__select"
            >
              <option value={QUESTION_INSERT_MODE_END}>В конец списка</option>
              <option value={QUESTION_INSERT_MODE_START}>В начало списка</option>
              <option value={QUESTION_INSERT_MODE_CUSTOM}>На выбранное место</option>
            </select>

            {questionInsertMode === QUESTION_INSERT_MODE_CUSTOM && (
              <>
                <div className="teacher-question-insert-card__custom">
                  <span>Место</span>
                  <input
                    type="number"
                    min="1"
                    max={maxQuestionInsertPosition}
                    inputMode="numeric"
                    value={questionInsertPosition}
                    onChange={(event) => {
                      setQuestionInsertPosition(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                      setQuestionUploadError('');
                    }}
                    onBlur={() => {
                      setQuestionInsertPosition((previous) => {
                        if (!String(previous).trim()) return previous;
                        const numericPosition = Number(previous);
                        if (!Number.isInteger(numericPosition)) return previous;
                        return String(Math.max(1, Math.min(maxQuestionInsertPosition, numericPosition)));
                      });
                    }}
                    disabled={Boolean(editingQuestionId)}
                    aria-label={`Место нового вопроса от 1 до ${maxQuestionInsertPosition}`}
                    aria-invalid={newQuestionInsertPosition === null}
                    aria-describedby={newQuestionInsertPosition === null ? 'teacher-question-insert-error' : undefined}
                  />
                  <span>из {maxQuestionInsertPosition}</span>
                </div>
                {newQuestionInsertPosition === null && !editingQuestionId && (
                  <span
                    id="teacher-question-insert-error"
                    className="teacher-question-insert-card__error"
                    role="alert"
                  >
                    Введите число от 1 до {maxQuestionInsertPosition}
                  </span>
                )}
              </>
            )}

            <div className="teacher-question-insert-card__summary">
              <strong>
                {editingQuestionId
                  ? `Редактируется вопрос №${editorQuestionNumber}`
                  : (newQuestionInsertPosition === null
                      ? 'Укажите место'
                      : `Следующий будет №${newQuestionInsertPosition}`)}
              </strong>
              <span>Сейчас: {currentQuestions.length} · рекомендуется от 11</span>
            </div>
            <p>
              {editingQuestionId
                ? 'При редактировании порядок вопросов не меняется.'
                : (questionInsertMode === QUESTION_INSERT_MODE_START
                    ? 'Каждый новый вопрос будет становиться первым.'
                    : (questionInsertMode === QUESTION_INSERT_MODE_CUSTOM
                        ? 'Новый вопрос займёт выбранное место, остальные сдвинутся ниже.'
                        : 'По умолчанию новые вопросы добавляются после существующих.'))}
            </p>
          </Card>
        </div>

        {/* MIDDLE COLUMN: Form */}
        <div className="teacher-test-builder-main">
          {!editingQuestionId && (
          <Card
            className={`teacher-question-editor question-attachment-drop-card ${isDraggingQuestionAttachments ? 'is-dragging-attachments' : ''}`}
            onDragEnter={handleQuestionAttachmentDragEnter}
            onDragOver={handleQuestionAttachmentDragOver}
            onDragLeave={handleQuestionAttachmentDragLeave}
            onDrop={handleQuestionAttachmentDrop}
          >
            <div className="teacher-question-editor__header">
              <div className="teacher-question-editor__header-content min-w-0">
                <div className="teacher-question-editor__target-banner">
                  <div className="teacher-question-editor__target-main">
                    <span>{editingQuestionId ? 'Редактируете в' : 'Добавляете в'}</span>
                    <strong>
                      <b>{selectedTaskContextLabel}</b>
                      {selectedTaskTitle}
                    </strong>
                  </div>
                  <div className="teacher-question-editor__target-meta">
                    <span>{selectedLevelLabel}</span>
                    <span>{editingQuestionId ? `Вопрос №${editorQuestionNumber}` : `Новый вопрос №${editorQuestionNumber}`}</span>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <span className="teacher-question-editor__title-icon">
                    {editingQuestionId ? <Pencil size={18} /> : <Plus size={18} />}
                  </span>
                  {editingQuestionId ? `Редактирование вопроса №${editorQuestionNumber}` : `Новый вопрос №${editorQuestionNumber}`}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Добавьте условие, материалы и ответ — справа сразу виден результат для ученика.
                </p>
              </div>
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

            <div className="teacher-question-editor__status-row">
              <span className={hasQuestionCondition ? 'is-ready' : ''}>
                <CheckCircle2 size={14} /> Условие
              </span>
              <span className={questionAttachmentCount > 0 ? 'is-ready' : ''}>
                <Paperclip size={14} /> Материалы {questionAttachmentCount > 0 ? `· ${questionAttachmentCount}` : ''}
              </span>
              <span className={hasQuestionAnswer ? 'is-ready' : ''}>
                <CheckCircle2 size={14} /> Ответ
              </span>
            </div>
            
            <div className="teacher-question-editor__body" onPaste={handlePasteImages}>
              <div className="teacher-question-editor__intro-grid">
                <section className="teacher-question-editor__section teacher-question-editor__condition-section">
                  <div className="teacher-question-editor__section-heading">
                    <span className="teacher-question-editor__step">1</span>
                    <div>
                      <h4>Условие вопроса</h4>
                      <p>Введите текст или добавьте изображение ниже.</p>
                    </div>
                  </div>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="teacher-question-editor__textarea"
                    placeholder="Напишите условие задания, пояснение или инструкцию ученику…"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-gray-400">
                    <span>Поддерживаются переносы строк</span>
                    <span>{question.length} символов</span>
                  </div>
                </section>

                <aside className="teacher-question-editor__preview">
                  <div className="teacher-question-editor__preview-title">
                    <span><Eye size={15} /> Предпросмотр</span>
                    <span>вид ученика</span>
                  </div>
                  {normalizedQuestionLabelPreview && (
                    <span
                      className="mt-3 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-bold"
                      style={getQuestionLabelStyle({ text: normalizedQuestionLabelPreview, color: questionLabelColor })}
                    >
                      <span className="truncate">{normalizedQuestionLabelPreview}</span>
                    </span>
                  )}
                  {questionPreviewImageUrl && (
                    <button
                      type="button"
                      className="teacher-question-editor__preview-image-button"
                      onClick={() => openQuestionImageLightbox(questionPreviewImageUrl, questionPreviewImageName)}
                      title="Открыть изображение крупно"
                    >
                      <img
                        src={questionPreviewImageUrl}
                        alt="Предпросмотр условия"
                        className="teacher-question-editor__preview-image"
                      />
                    </button>
                  )}
                  <div className={`teacher-question-editor__preview-text ${question.trim() ? '' : 'is-empty'}`}>
                    {question.trim() || 'Здесь появится текст вопроса. Можно оставить его пустым, если условие находится на изображении.'}
                  </div>
                  <div className="teacher-question-editor__preview-answer">
                    <span>Ответ ученика</span>
                    <div>Поле для ответа</div>
                  </div>
                </aside>
              </div>

              <section className="teacher-question-editor__section teacher-question-editor__label-section">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="teacher-question-editor__section-heading mb-0">
                    <span className="teacher-question-editor__step">2</span>
                    <div>
                      <h4>Метка задачи</h4>
                      <p>Необязательно: выделите сложное или особое задание.</p>
                    </div>
                  </div>
                  {normalizedQuestionLabelPreview && (
                    <span
                      className="inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm"
                      style={getQuestionLabelStyle({ text: questionLabelText, color: questionLabelColor })}
                    >
                      <span className="truncate">{normalizedQuestionLabelPreview}</span>
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(120px,0.42fr)]">
                  <input
                    type="text"
                    value={questionLabelText}
                    maxLength={QUESTION_LABEL_TEXT_MAX_LENGTH}
                    onChange={(event) => setQuestionLabelText(event.target.value)}
                    className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-purple-400"
                    placeholder="Например: Сложная или С подвохом"
                    aria-label="Текст метки задачи"
                  />
                  <input
                    type="color"
                    value={normalizeQuestionLabelColor(questionLabelColor)}
                    onChange={(event) => setQuestionLabelColor(event.target.value)}
                    className="h-10 w-full cursor-pointer rounded-xl border border-purple-100 bg-white p-1 sm:w-12"
                    aria-label="Выбрать цвет метки"
                  />
                  <input
                    type="text"
                    value={questionLabelColor}
                    maxLength={7}
                    onChange={(event) => setQuestionLabelColor(event.target.value)}
                    className={`w-full rounded-xl border bg-white px-3 py-2.5 font-mono text-sm outline-none ${
                      !questionLabelText.trim() || isQuestionLabelColorValid(questionLabelColor)
                        ? 'border-purple-100 focus:border-purple-400'
                        : 'border-red-300 text-red-600 focus:border-red-400'
                    }`}
                    placeholder="#7c3aed"
                    aria-label="HEX-цвет метки"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-500">Быстрый цвет:</span>
                    {QUESTION_LABEL_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setQuestionLabelColor(color)}
                        className={`teacher-question-editor__color-preset ${normalizeQuestionLabelColor(questionLabelColor) === color ? 'is-active' : ''}`}
                        style={{ backgroundColor: color }}
                        title={color}
                        aria-label={`Цвет ${color}`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-gray-400">
                    {questionLabelText.length}/{QUESTION_LABEL_TEXT_MAX_LENGTH}
                  </span>
                </div>
              </section>

              <section className="teacher-question-editor__section teacher-question-editor__materials-section">
                <div className="teacher-question-editor__section-heading">
                  <span className="teacher-question-editor__step">3</span>
                  <div>
                    <h4>Материалы к вопросу</h4>
                    <p>Перетащите файлы, выберите их вручную или вставьте изображение через Ctrl+V.</p>
                  </div>
                </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center justify-between gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                    <span className="inline-flex items-center gap-1.5"><ImagePlus size={14} /> Изображения</span>
                    <span>{questionScreenshots.length + existingQuestionScreenshots.length}</span>
                  </label>
                  <div
                    onDrop={handleScreenshotsDrop}
                    onDragOver={handleScreenshotsDragOver}
                    onDragLeave={handleScreenshotsDragLeave}
                    className={`teacher-question-editor__drop-zone rounded-2xl border-2 border-dashed p-4 transition-colors ${
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
                      <span className="inline-flex items-center gap-2"><UploadCloud size={18} className="text-purple-500" /> Перетащите изображения</span>
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
                          <button
                            type="button"
                            className="teacher-question-editor__attached-image-button"
                            onClick={() => openQuestionImageLightbox(item.url, item.file.name)}
                          >
                            <img
                              src={item.url}
                              alt={item.file.name}
                              className="w-full object-contain bg-white"
                              style={{ maxHeight: '360px' }}
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {existingQuestionScreenshots.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {existingQuestionScreenshots.map((item, idx) => {
                        const imgUrl = withUploadsAuthToken(item?.url || (item?.storageName ? `/uploads/${item.storageName}` : ''));
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
                              <button
                                type="button"
                                className="teacher-question-editor__attached-image-button"
                                onClick={() => openQuestionImageLightbox(imgUrl, item.name || 'Скриншот')}
                              >
                                <img
                                  src={imgUrl}
                                  alt={item.name || 'Скриншот'}
                                  className="w-full object-contain bg-white"
                                  style={{ maxHeight: '360px' }}
                                />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <label className="flex items-center justify-between gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
                    <span className="inline-flex items-center gap-1.5"><FileText size={14} /> Доп. файлы</span>
                    <span>{questionFiles.length + existingQuestionFiles.length}</span>
                  </label>
                  <div
                    onDrop={handleFilesDrop}
                    onDragOver={handleFilesDragOver}
                    onDragLeave={handleFilesDragLeave}
                    className={`teacher-question-editor__drop-zone rounded-2xl border-2 border-dashed p-4 transition-colors ${
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
                      <span className="inline-flex items-center gap-2"><UploadCloud size={18} className="text-purple-500" /> Перетащите файлы</span>
                      <button
                        type="button"
                        onClick={() => filesRef.current?.click()}
                        className="px-3 py-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50"
                      >
                        Выбрать
                      </button>
                    </div>
                  </div>
                  <div className="teacher-question-editor__bulk-file-rename">
                    <div className="teacher-question-editor__bulk-file-rename-header">
                      <span><Pencil size={13} /> Общее имя файлов уровня</span>
                      <span>{formatQuestionFileCount(bulkQuestionFileCount)}</span>
                    </div>
                    <div className="teacher-question-editor__bulk-file-rename-controls">
                      <input
                        type="text"
                        value={bulkQuestionFileName}
                        onChange={(event) => {
                          setBulkQuestionFileName(event.target.value);
                          setBulkQuestionFileRenameMessage('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleBulkRenameQuestionFiles();
                          }
                        }}
                        placeholder="Имя без расширения"
                        aria-label="Новое имя всех дополнительных файлов выбранного уровня"
                      />
                      <button
                        type="button"
                        onClick={handleBulkRenameQuestionFiles}
                        disabled={isBulkRenamingQuestionFiles || bulkQuestionFileCount === 0 || !bulkQuestionFileName.trim()}
                      >
                        {isBulkRenamingQuestionFiles ? 'Переименовываю…' : 'Переименовать все'}
                      </button>
                    </div>
                    <p>
                      Во всех вопросах задания №{selectedTask}, уровень «{selectedLevelInfo?.label || selectedLevel}».
                      Расширения сохранятся.
                    </p>
                    {bulkQuestionFileRenameMessage && (
                      <span className="teacher-question-editor__bulk-file-rename-success">
                        <CheckCircle2 size={12} /> {bulkQuestionFileRenameMessage}
                      </span>
                    )}
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
              </section>
              {questionUploadError && <p className="text-xs text-red-500">{questionUploadError}</p>}

              <section className={answerSectionClassName}>
                <div className="teacher-question-editor__section-heading">
                  <span className="teacher-question-editor__step">4</span>
                  <div>
                    <h4>Правильный ответ</h4>
                    <p>{answerCount > 1 ? `Для этого задания нужно заполнить ${answerCount} полей.` : 'Ответ будет использован для автоматической проверки.'}</p>
                    {canPasteAnswerTable && renderTeacherAnswerPasteHint()}
                  </div>
                </div>
                {renderAnswerInputFields()}
              </section>

              <div className="teacher-question-editor__footer">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-700">
                    {editingQuestionId ? `Сохранить изменения вопроса №${editorQuestionNumber}` : `Добавить вопрос №${editorQuestionNumber}`}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {hasQuestionCondition && hasQuestionAnswer
                      ? 'Основные поля заполнены — вопрос готов к сохранению.'
                      : 'Нужно добавить условие или изображение и указать правильный ответ.'}
                  </div>
                </div>
                <Button
                  onClick={handleSaveQuestion}
                  className="teacher-question-editor__save"
                  disabled={isUploadingQuestion || (!editingQuestionId && newQuestionInsertPosition === null)}
                >
                  <Save size={18} /> {isUploadingQuestion
                    ? 'Загрузка...'
                    : (editingQuestionId
                        ? 'Сохранить изменения'
                        : (newQuestionInsertPosition === null
                            ? 'Укажите место вопроса'
                            : `Добавить вопрос №${editorQuestionNumber}`))}
                </Button>
              </div>
            </div>
          </Card>
          )}

          {/* Question List */}
          <div className="teacher-question-list" onDragOver={handleQuestionListDragOver}>
            <div className="teacher-question-list__context">
              <div className="teacher-question-list__context-main">
                <span>Сейчас открыт раздел</span>
                <strong>
                  <b>{selectedTaskContextLabel}</b>
                  {selectedTaskTitle}
                </strong>
              </div>
              <div className="teacher-question-list__context-meta">
                <span>{selectedLevelLabel}</span>
                <span>{`${currentQuestions.length} ${currentQuestions.length === 1 ? 'вопрос' : 'вопросов'}`}</span>
                <span>{currentQuestions.length > 0 ? `Места: 1–${currentQuestions.length}` : 'Мест пока нет'}</span>
              </div>
            </div>
            <div className="teacher-question-list-heading">
              <div>
                <h3 className="font-bold text-gray-700">Существующие вопросы ({currentQuestions.length})</h3>
                {currentQuestions.length > 1 && (
                  <p>Перетаскивайте карточки за ручку слева или нажмите на неё, чтобы ввести место вручную.</p>
                )}
              </div>
              {questionReorderMessage && (
                <span className={questionReorderMessage.includes('Не удалось') ? 'is-error' : ''}>
                  {questionReorderMessage}
                </span>
              )}
            </div>
            {currentQuestions.length === 0 ? (
              <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                В этой категории пока нет вопросов.
              </div>
            ) : (
              currentQuestions.map((q, idx) => (
                <React.Fragment key={q.id}>
                {String(dragOverQuestionId) === String(q.id) && dragOverQuestionPosition === 'before' && String(draggingQuestionId) !== String(q.id) && (
                  <div
                    className="teacher-question-drop-indicator"
                    onDragOver={(event) => handleQuestionDragOver(event, q.id, 'before')}
                    onDrop={(event) => handleQuestionDrop(event, q.id, 'before')}
                  >
                    <span>Вставить сюда</span>
                  </div>
                )}
                <article
                  className={`teacher-question-card ${editingQuestionId === q.id ? 'is-editing' : ''} ${String(draggingQuestionId) === String(q.id) ? 'is-dragging' : ''}`}
                  onDragOver={(event) => handleQuestionDragOver(event, q.id)}
                  onDrop={(event) => handleQuestionDrop(event, q.id)}
                  onDragEnd={resetQuestionDragState}
                >
                  <button
                    type="button"
                    draggable={currentQuestions.length > 1 && !isReorderingQuestions}
                    onClick={() => openQuestionMoveDraft(q.id, idx + 1)}
                    onDragStart={(event) => handleQuestionDragStart(event, q.id)}
                    onDragEnd={resetQuestionDragState}
                    className="teacher-question-card__drag-handle"
                    title="Перетащить или нажать, чтобы поставить на место"
                    aria-label={`Перетащить или поставить вопрос №${idx + 1} на место`}
                  >
                    <GripVertical size={18} />
                  </button>
                  <div className="teacher-question-card__content">
                    <div className="teacher-question-card__topline">
                      <span className="teacher-question-card__position">#{idx + 1}</span>
                    {normalizeQuestionLabel(q.label) && (
                      <span
                        className="teacher-question-card__label"
                        style={getQuestionLabelStyle(q.label)}
                      >
                        <span className="truncate">{normalizeQuestionLabel(q.label).text}</span>
                      </span>
                    )}
                      <span className="teacher-question-card__level-pill">{selectedLevelLabel}</span>
                    </div>
                    <p className="teacher-question-card__text">{q.question || 'Вопрос без текста'}</p>
                    <div className="teacher-question-card__answer-row">
                      <span>Ответ</span>
                      <strong>
                        {(() => {
                          const count = getAnswerCountForTask(selectedTask);
                          const answers = getExpectedAnswers(q, count);
                          const answerSummary = count <= 1 ? answers[0] : answers.filter(Boolean).join('; ');
                          return answerSummary || 'не указан';
                        })()}
                      </strong>
                    </div>
                    {String(questionMoveDraft.questionId) === String(q.id) && (
                      <div className="teacher-question-card__move-panel">
                        <label>
                          <span>Поставить на место</span>
                          <em>{`1–${currentQuestions.length}`}</em>
                        </label>
                        <div>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoFocus
                            value={questionMoveDraft.value}
                            onChange={(event) => handleQuestionMoveDraftChange(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                submitQuestionMoveDraft(q.id);
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                closeQuestionMoveDraft();
                              }
                            }}
                            disabled={isReorderingQuestions}
                            aria-label={`Новое место вопроса от 1 до ${currentQuestions.length}`}
                          />
                          <button
                            type="button"
                            onClick={() => submitQuestionMoveDraft(q.id)}
                            disabled={isReorderingQuestions}
                          >
                            OK
                          </button>
                        </div>
                        <small className={questionMoveDraft.error ? 'is-error' : ''}>
                          {questionMoveDraft.error || `Введите номер от 1 до ${currentQuestions.length} и нажмите Enter.`}
                        </small>
                      </div>
                    )}
                    <div className="teacher-question-card__materials-summary">
                      <span>
                        <ImagePlus size={13} />
                        {Array.isArray(q.screenshots) ? q.screenshots.length : 0}
                      </span>
                      <span>
                        <Paperclip size={13} />
                        {Array.isArray(q.files) ? q.files.length : 0}
                      </span>
                    </div>
                    {Array.isArray(q.screenshots) && q.screenshots.length > 0 && (
                      <div className="teacher-question-card__image-grid">
                        {q.screenshots.map((img) => {
                          const imgUrl = withUploadsAuthToken(img?.url || (img?.storageName ? `/uploads/${img.storageName}` : ''));
                          return (
                          <button
                            key={img.id || img.url || img.storageName}
                            type="button"
                            onClick={() => openQuestionImageLightbox(imgUrl, img.name || 'Скриншот')}
                            className="teacher-question-card__image-button"
                            title="Открыть изображение крупно"
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
                      <div className="teacher-question-card__files">
                        {q.files.map((file) => {
                          const fileUrl = withUploadsAuthToken(file?.url || (file?.storageName ? `/uploads/${file.storageName}` : ''));
                          return (
                            <a
                              key={file.id || file.url || file.storageName}
                              href={buildDownloadUrl(fileUrl)}
                              download={file?.name || undefined}
                              className="teacher-question-card__file-link"
                            >
                              <span className="truncate">{file.name || 'Файл'}</span>
                              <Download size={16} className="text-purple-600" />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="teacher-question-card__actions">
                    <button
                      type="button"
                      onClick={() => startEditQuestion(q)}
                      className="teacher-question-card__icon-action"
                      title="Редактировать"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(selectedTask, selectedLevel, q.id)}
                      className="teacher-question-card__icon-action teacher-question-card__icon-action--danger"
                      title="Удалить"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </article>
                {String(dragOverQuestionId) === String(q.id) && dragOverQuestionPosition === 'after' && String(draggingQuestionId) !== String(q.id) && (
                  <div
                    className="teacher-question-drop-indicator"
                    onDragOver={(event) => handleQuestionDragOver(event, q.id, 'after')}
                    onDrop={(event) => handleQuestionDrop(event, q.id, 'after')}
                  >
                    <span>Вставить сюда</span>
                  </div>
                )}
                {editingQuestionId === q.id && (
                  <div className="teacher-question-editor-inline-wrap" data-inline-question-editor={q.id}>
                    {renderInlineQuestionEditor()}
                  </div>
                )}
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </div>
      </>
      )}
      {questionImageLightbox?.url && typeof document !== 'undefined' && createPortal((
        <div
          className="teacher-question-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр изображения"
          onClick={() => setQuestionImageLightbox(null)}
        >
          <div
            className="teacher-question-image-lightbox__panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="teacher-question-image-lightbox__bar">
              <span>{questionImageLightbox.name || 'Изображение'}</span>
              <button
                type="button"
                onClick={() => setQuestionImageLightbox(null)}
                aria-label="Закрыть изображение"
              >
                <X size={18} />
              </button>
            </div>
            <img
              src={questionImageLightbox.url}
              alt={questionImageLightbox.name || 'Изображение'}
              className="teacher-question-image-lightbox__image"
            />
          </div>
        </div>
      ), document.body)}
    </div>
  );
};
export default TeacherPanel;
