import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Download, MessageSquare, Pencil, Plus, RefreshCcw, Save, SendHorizontal, Settings, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button, Card } from './ui';
import LinkifiedText from './LinkifiedText';
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
  XP_PER_LEVEL,
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
}) => {
  const isSignupChatsMode = mode === 'signup-chats';
  const isTestsMode = !isSignupChatsMode;
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
  const [editStudentLeaderboardAlias, setEditStudentLeaderboardAlias] = useState('');
  const [editStudentLeaderboardAliasInitial, setEditStudentLeaderboardAliasInitial] = useState('');
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
  const [signupChats, setSignupChats] = useState([]);
  const [signupChatsLoading, setSignupChatsLoading] = useState(false);
  const [signupChatsError, setSignupChatsError] = useState('');
  const [selectedSignupChatId, setSelectedSignupChatId] = useState('');
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
    const alias = typeof student.leaderboardAlias === 'string' ? student.leaderboardAlias : '';
    setEditStudentLeaderboardAlias(alias);
    setEditStudentLeaderboardAliasInitial(alias);
    setEditStudentError('');
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
    setEditStudentName('');
    setEditStudentNickname('');
    setEditStudentLeaderboardAlias('');
    setEditStudentLeaderboardAliasInitial('');
    setEditStudentError('');
  };

  const saveEditStudent = async (student) => {
    if (!student?.id) return;
    const nextName = editStudentName.trim();
    const nextAlias = String(editStudentLeaderboardAlias || '').trim();
    const initialAlias = String(editStudentLeaderboardAliasInitial || '').trim();
    const aliasChanged = nextAlias !== initialAlias;
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

    setEditStudentSaving(true);
    try {
      const payload = { name: nextName, nickname: editStudentNickname };
      if (aliasChanged) payload.leaderboardAlias = nextAlias;
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
    <div className="animate-fadeIn pb-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          {isSignupChatsMode ? <MessageSquare className="text-purple-600" /> : <Settings className="text-purple-600" />}
          {isSignupChatsMode ? 'Чаты с записывающимися' : 'Панель учителя'}
        </h2>
        <p className="text-gray-500">
          {isSignupChatsMode
            ? 'Сообщения от людей, которые нажали "Я хочу записаться"'
            : 'Добавление и редактирование заданий для тестов'}
        </p>
        {isTestsMode && testsLoading && <p className="text-xs text-gray-400 mt-2">Загрузка базы тестов...</p>}
        {isTestsMode && testsError && <p className="text-xs text-red-500 mt-2">{testsError}</p>}
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
            studentsList.map((student) => {
              const studentXpTotal = normalizeXpTotal(student?.xpTotal);
              const rawStudentLevel = Number(student?.level);
              const studentLevel = Number.isFinite(rawStudentLevel) && rawStudentLevel > 0
                ? Math.floor(rawStudentLevel)
                : (Math.floor(studentXpTotal / XP_PER_LEVEL) + 1);
              const studentXpLabel = studentXpTotal.toLocaleString('ru-RU');
              return (
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
                        <p className="text-[11px] text-gray-500">2-6 русских букв, плохие слова блокируются.</p>
                        {editStudentError && <p className="text-xs text-red-500">{editStudentError}</p>}
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-gray-800 truncate">{student.name}</p>
                        {student.nickname && (
                          <p className="text-xs text-purple-600 truncate">Прозвище: {student.nickname}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                            {`Ур. ${studentLevel}`}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            {`${studentXpLabel} XP`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          Рейтинг: <span className="font-medium text-gray-700">{student.leaderboardAlias || 'аноним'}</span>
                        </p>
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
                          const imgUrl = withUploadsAuthToken(img?.url || (img?.storageName ? `/uploads/${img.storageName}` : ''));
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
                          const fileUrl = withUploadsAuthToken(file?.url || (file?.storageName ? `/uploads/${file.storageName}` : ''));
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
      </>
      )}
    </div>
  );
};
export default TeacherPanel;
