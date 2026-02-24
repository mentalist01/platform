import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import ImageViewer from './ImageViewer';
import { api } from '../services/api';
import { Button, Card } from './ui';

const NotesSection = ({
  role,
  studentId,
  students,
  activeStudentId,
  onSelectStudent,
  studentsLoading,
  initialLocation,
  onLocationChange,
  withStudentId,
  MOCK_TASKS,
  normalizeTaskNumber,
  GAME_THEORY_TASK,
  getEntrySizeBytes,
  MAX_TASK_BYTES,
  mergeRuntimeErrorText,
  createPyodideWorker,
  ensurePyodideReady,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
  getStudentLabel,
  getTaskDisplayNumber,
  formatTaskNumber,
  buildIdleConsoleText,
  formatBytes,
  PY_IDLE_STDIN_HEADER,
  parseIdleConsoleInput,
  highlightPython
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
  const [expandedImageIds, setExpandedImageIds] = useState({});
  const [pyContent, setPyContent] = useState({});
  const [pyError, setPyError] = useState({});
  const [pyLoadingId, setPyLoadingId] = useState(null);
  const [editingPyId, setEditingPyId] = useState(null);
  const [pyEditDraft, setPyEditDraft] = useState('');
  const [pyEditSaving, setPyEditSaving] = useState(false);
  const [pyEditError, setPyEditError] = useState('');
  const [pyRunInput, setPyRunInput] = useState('');
  const [pyRunOutput, setPyRunOutput] = useState('');
  const [pyRunError, setPyRunError] = useState('');
  const [pyRunLoading, setPyRunLoading] = useState(false);
  const [showPyCreator, setShowPyCreator] = useState(false);
  const [pyDraftName, setPyDraftName] = useState('');
  const [pyDraftCode, setPyDraftCode] = useState('');
  const [pyDraftError, setPyDraftError] = useState('');
  const [pyDraftSaving, setPyDraftSaving] = useState(false);
  const [showMobilePyTools, setShowMobilePyTools] = useState(false);
  const [showMobileFolderTools, setShowMobileFolderTools] = useState(false);
  const restoringRef = useRef(false);
  const didRestoreRef = useRef(false);
  const skipNullSaveRef = useRef(true);
  const pendingFolderIdRef = useRef(null);
  const fileRef = useRef(null);
  const pyRunnerWorkerRef = useRef(null);
  const pyRunnerPendingRef = useRef(new Map());
  const editingPyIdRef = useRef(null);
  const studentsList = students || [];
  const effectiveStudentId = role === 'teacher' ? activeStudentId : studentId;
  const getFileUrl = (file) => withStudentId(file?.url, effectiveStudentId);

  const taskOptions = MOCK_TASKS;
  const normalizedCurrentTask = normalizeTaskNumber(currentTask);
  const LESSON_SHARED_SCOPE = 'lesson-files';
  const LESSON_SHARED_FOLDER_NAME = 'файлы к уроку';
  const getNotesTaskNumber = (value) => normalizeTaskNumber(value);
  const getNotesTaskNumbers = (value) => {
    const normalized = normalizeTaskNumber(value);
    if (!Number.isFinite(normalized)) return [];
    if (normalized === GAME_THEORY_TASK) return [19, 20, 21];
    return [normalized];
  };
  const isLessonSharedFile = (entry) => (
    entry?.sharedScope === LESSON_SHARED_SCOPE || entry?.isLessonShared === true
  );
  const isLessonSharedFolder = (entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (entry.isLessonShared === true) return true;
    return String(entry.name || '').trim().toLowerCase() === LESSON_SHARED_FOLDER_NAME;
  };

  useEffect(() => {
    editingPyIdRef.current = editingPyId;
  }, [editingPyId]);

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
      if (isLessonSharedFile(f)) continue;
      const taskNum = Number(f?.taskNumber);
      if (!Number.isFinite(taskNum)) continue;
      map.set(taskNum, (map.get(taskNum) || 0) + getEntrySizeBytes(f));
    }
    return map;
  }, [files]);

  const sharedTaskUsageByNumber = useMemo(() => {
    const map = new Map();
    for (const f of files) {
      if (!isLessonSharedFile(f)) continue;
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

  const currentFolder = useMemo(
    () => folders.find((folder) => folder.id === currentFolderId) || null,
    [folders, currentFolderId]
  );
  const isCurrentFolderLessonShared = Boolean(currentFolder && isLessonSharedFolder(currentFolder));
  const canUploadToCurrentFolder = !(role === 'student' && isCurrentFolderLessonShared);
  const canManageFile = (file) => !(role === 'student' && isLessonSharedFile(file));
  const activeUsageByNumber = isCurrentFolderLessonShared ? sharedTaskUsageByNumber : taskUsageByNumber;

  const taskUsageBytes = useMemo(() => {
    if (!Number.isFinite(normalizedCurrentTask)) return 0;
    const folderTaskNumber = getFolderTaskNumber(currentFolderId);
    if (Number.isFinite(folderTaskNumber)) {
      return activeUsageByNumber.get(folderTaskNumber) || 0;
    }
    if (normalizedCurrentTask === GAME_THEORY_TASK) {
      return getNotesTaskNumbers(normalizedCurrentTask)
        .reduce((sum, taskNumber) => sum + (activeUsageByNumber.get(taskNumber) || 0), 0);
    }
    return activeUsageByNumber.get(normalizedCurrentTask) || 0;
  }, [normalizedCurrentTask, currentFolderId, activeUsageByNumber, folders]);

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
    setExpandedImageIds({});
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setShowMobilePyTools(false);
    setShowMobileFolderTools(false);
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
      setExpandedImageIds({});
      setEditingPyId(null);
      setPyEditDraft('');
      setPyEditSaving(false);
      setPyEditError('');
      setPyRunInput('');
      setPyRunOutput('');
      setPyRunError('');
      setPyRunLoading(false);
      setShowPyCreator(false);
      setPyDraftName('');
      setPyDraftCode('');
      setPyDraftError('');
      setPyDraftSaving(false);
      setShowMobilePyTools(false);
      setShowMobileFolderTools(false);
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
    setExpandedImageIds({});
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
    setShowPyCreator(false);
    setPyDraftName('');
    setPyDraftCode('');
    setPyDraftError('');
    setPyDraftSaving(false);
    setShowMobilePyTools(false);
    setShowMobileFolderTools(false);
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

  const isImageMimeType = (value) => String(value || '').toLowerCase().startsWith('image/');
  const isImageFileName = (name) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|heic|heif)$/i.test(String(name || ''));

  const getImageExtensionFromMime = (mime) => {
    const normalized = String(mime || '').toLowerCase();
    if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
    if (normalized === 'image/png') return 'png';
    if (normalized === 'image/gif') return 'gif';
    if (normalized === 'image/webp') return 'webp';
    if (normalized === 'image/bmp') return 'bmp';
    if (normalized === 'image/svg+xml') return 'svg';
    if (normalized === 'image/avif') return 'avif';
    if (normalized === 'image/heic') return 'heic';
    if (normalized === 'image/heif') return 'heif';
    if (normalized === 'image/x-icon' || normalized === 'image/vnd.microsoft.icon') return 'ico';
    return 'png';
  };

  const ensureFileName = (file, prefix = 'upload', index = 0) => {
    if (!file) return null;
    const trimmedName = String(file.name || '').trim();
    if (trimmedName) return file;
    const ext = getImageExtensionFromMime(file.type);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return new File([file], `${prefix}-${stamp}-${index + 1}.${ext}`, { type: file.type || 'application/octet-stream' });
  };

  const getDataTransferFiles = (dataTransfer) => {
    const list = Array.from(dataTransfer?.files || []).filter(Boolean);
    if (list.length > 0) return list;
    const items = Array.from(dataTransfer?.items || []);
    const fromItems = [];
    for (const item of items) {
      if (item?.kind !== 'file') continue;
      const file = item.getAsFile?.();
      if (file) fromItems.push(file);
    }
    return fromItems;
  };

  const getClipboardImageFiles = (clipboardData) => {
    const files = [];
    const fromFiles = Array.from(clipboardData?.files || []);
    fromFiles.forEach((file) => {
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    if (files.length > 0) return files;

    const items = Array.from(clipboardData?.items || []);
    items.forEach((item) => {
      if (item?.kind !== 'file') return;
      const file = item.getAsFile?.();
      if (!file) return;
      if (!isImageMimeType(file.type) && !isImageFileName(file.name)) return;
      const normalized = ensureFileName(file, 'clipboard', files.length);
      if (normalized) files.push(normalized);
    });
    return files;
  };

  const handleUploadFiles = async (fileList) => {
    const filesToUpload = Array.from(fileList || []).filter(Boolean);
    if (filesToUpload.length === 0) return;
    if (!effectiveStudentId) {
      alert('Сначала выберите ученика.');
      return;
    }
    if (!canUploadToCurrentFolder) {
      alert(`В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель.`);
      return;
    }
    const candidates = getUploadCandidates();
    if (!candidates.length) {
      alert('Сначала выберите задание и категорию.');
      return;
    }
    if (isUploading) return;
    setIsUploading(true);
    const usageByTask = new Map(activeUsageByNumber);
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
    const dropped = getDataTransferFiles(e.dataTransfer);
    handleUploadFiles(dropped);
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

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onPaste = (event) => {
      if (!effectiveStudentId || !Number.isFinite(normalizedCurrentTask) || !currentCategory) return;
      if (isUploading) return;
      if (!canUploadToCurrentFolder) return;
      const imageFiles = getClipboardImageFiles(event.clipboardData);
      if (!imageFiles.length) return;
      event.preventDefault();
      event.stopPropagation();
      handleUploadFiles(imageFiles);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [
    effectiveStudentId,
    normalizedCurrentTask,
    currentCategory,
    isUploading,
    canUploadToCurrentFolder,
    handleUploadFiles
  ]);

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
    if (isLessonSharedFolder(folder)) return;
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
    if (isLessonSharedFolder(folder)) {
      cancelRenameFolder();
      return;
    }
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
    const file = files.find((item) => item.id === fileId);
    if (!file) return;
    if (!canManageFile(file)) {
      alert('Недостаточно прав для изменения этого файла.');
      setDragOverFolderId(null);
      return;
    }
    if (isLessonSharedFile(file)) {
      alert(`Файлы из папки "${LESSON_SHARED_FOLDER_NAME}" нельзя перемещать.`);
      setDragOverFolderId(null);
      return;
    }
    if (folderId) {
      const folder = folders.find((item) => item.id === folderId);
      if (folder && isLessonSharedFolder(folder)) {
        alert(`В папку "${LESSON_SHARED_FOLDER_NAME}" можно загружать только напрямую.`);
        setDragOverFolderId(null);
        return;
      }
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
  const isImageFile = (value) => {
    const name = typeof value === 'string' ? value : value?.name;
    const mime = typeof value === 'string' ? '' : value?.type;
    return isImageFileName(name) || isImageMimeType(mime);
  };
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
    if (!canUploadToCurrentFolder) {
      setPyDraftError(`В папку "${LESSON_SHARED_FOLDER_NAME}" может загружать только учитель.`);
      return;
    }
    const usageByTask = new Map(activeUsageByNumber);
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
    if (isImageFile(name)) {
      return (
        <div className="flex flex-col items-center w-12">
          <div className="w-10 h-10 flex items-center justify-center bg-transparent">
            <ImageIcon size={22} className="text-violet-600" />
          </div>
          <span className="text-[10px] font-bold text-violet-700 mt-1">IMG</span>
        </div>
      );
    }
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

  const getPyFileSize = (code) => new Blob([code ?? ''], { type: 'text/x-python' }).size;

  const resolvePyRunnerPending = (message) => {
    pyRunnerPendingRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      const output = typeof entry.output === 'string' ? entry.output : '';
      const error = mergeRuntimeErrorText(entry.error, message);
      if (typeof entry.onProgress === 'function') {
        entry.onProgress({ output, error, done: true });
      }
      entry.resolve({ output, error });
    });
    pyRunnerPendingRef.current.clear();
  };

  const disposePyRunnerWorker = (message = '') => {
    if (pyRunnerWorkerRef.current) {
      pyRunnerWorkerRef.current.terminate();
      pyRunnerWorkerRef.current = null;
    }
    if (message) resolvePyRunnerPending(message);
  };

  const ensurePyRunnerWorker = () => {
    if (typeof Worker === 'undefined') return null;
    if (pyRunnerWorkerRef.current) return pyRunnerWorkerRef.current;
    try {
      const worker = createPyodideWorker();
      worker.onmessage = (event) => {
        const data = event.data || {};
        const pending = pyRunnerPendingRef.current.get(data.id);
        if (!pending) return;
        const messageType = typeof data.type === 'string' ? data.type : 'result';
        if (messageType === 'stdout' || messageType === 'stderr') {
          const chunk = typeof data.chunk === 'string' ? data.chunk : String(data.chunk ?? '');
          if (!chunk) return;
          if (messageType === 'stdout') {
            pending.output = `${pending.output || ''}${chunk}`;
          } else {
            pending.error = `${pending.error || ''}${chunk}`;
          }
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({
              output: pending.output || '',
              error: pending.error || '',
              done: false,
            });
          }
          return;
        }
        clearTimeout(pending.timer);
        pyRunnerPendingRef.current.delete(data.id);
        const output = typeof data.output === 'string'
          ? data.output
          : (data.output ? String(data.output) : (pending.output || ''));
        const error = typeof data.error === 'string'
          ? data.error
          : (data.error ? String(data.error) : (pending.error || ''));
        if (typeof pending.onProgress === 'function') {
          pending.onProgress({ output, error, done: true });
        }
        pending.resolve({ output, error });
      };
      worker.onerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      worker.onmessageerror = () => disposePyRunnerWorker('Ошибка выполнения Python.');
      pyRunnerWorkerRef.current = worker;
      return worker;
    } catch {
      return null;
    }
  };

  useEffect(() => () => disposePyRunnerWorker('Python runner stopped.'), []);

  const runPyInMainThread = async (source, inputValue) => {
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

  const runPyCode = async (source, inputValue, onProgress = null) => {
    const worker = ensurePyRunnerWorker();
    if (worker) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          const pending = pyRunnerPendingRef.current.get(id);
          if (!pending) return;
          pyRunnerPendingRef.current.delete(id);
          const timeoutMessage = `Превышено время выполнения (${Math.round(PYODIDE_RUN_TIMEOUT_MS / 1000)} сек).`;
          const output = pending.output || '';
          const error = mergeRuntimeErrorText(pending.error, timeoutMessage);
          if (typeof pending.onProgress === 'function') {
            pending.onProgress({ output, error, done: true });
          }
          resolve({ output, error });
          disposePyRunnerWorker('Превышено время выполнения.');
        }, PYODIDE_RUN_TIMEOUT_MS);
        pyRunnerPendingRef.current.set(id, {
          resolve,
          timer,
          output: '',
          error: '',
          onProgress: typeof onProgress === 'function' ? onProgress : null,
        });
        worker.postMessage({ id, source, input: inputValue });
      });
    }
    if (!ALLOW_MAIN_THREAD_PYTHON_FALLBACK) {
      return {
        output: '',
        error: 'Не удалось запустить Python в изолированном режиме. Перезагрузите страницу.'
      };
    }
    return runPyInMainThread(source, inputValue);
  };

  const handleRunEditedPyFile = async () => {
    if (!editingPyId) return;
    if (pyRunLoading) return;
    const targetId = editingPyId;
    setPyRunLoading(true);
    setPyRunError('');
    setPyRunOutput('');
    try {
      const result = await runPyCode(pyEditDraft, pyRunInput, (progress) => {
        if (editingPyIdRef.current !== targetId) return;
        setPyRunOutput(progress?.output || '');
        setPyRunError(progress?.error || '');
      });
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput(result.output || '');
      setPyRunError(result.error || '');
    } catch (err) {
      if (editingPyIdRef.current !== targetId) return;
      setPyRunOutput('');
      setPyRunError(err?.message || 'Ошибка выполнения Python');
    } finally {
      const activeEditorId = editingPyIdRef.current;
      if (activeEditorId === targetId || activeEditorId === null) {
        setPyRunLoading(false);
      }
    }
  };

  const loadPyFileContent = async (file) => {
    const url = getFileUrl(file);
    if (!url || !isPyFile(file?.name)) return null;
    if (Object.prototype.hasOwnProperty.call(pyContent, file.id)) {
      return pyContent[file.id] ?? '';
    }
    if (pyError[file.id]) return null;

    setPyLoadingId(file.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Не удалось загрузить файл');
      const text = await res.text();
      setPyContent((prev) => ({ ...prev, [file.id]: text }));
      return text;
    } catch (err) {
      setPyError((prev) => ({ ...prev, [file.id]: err?.message || 'Ошибка загрузки' }));
      return null;
    } finally {
      setPyLoadingId(null);
    }
  };

  const togglePyPreview = async (file) => {
    if (!isPyFile(file?.name)) return;
    const willOpen = !expandedPyIds[file.id];
    setExpandedPyIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
    if (!willOpen && editingPyId === file.id) {
      setEditingPyId(null);
      setPyEditDraft('');
      setPyEditSaving(false);
      setPyEditError('');
      setPyRunInput('');
      setPyRunOutput('');
      setPyRunError('');
      setPyRunLoading(false);
      return;
    }
    if (!willOpen) return;
    await loadPyFileContent(file);
  };

  const startEditingPyFile = async (file) => {
    if (!isPyFile(file?.name)) return;
    if (!canManageFile(file)) {
      alert('Недостаточно прав для изменения этого файла.');
      return;
    }
    if (pyEditSaving) return;
    if (!expandedPyIds[file.id]) {
      setExpandedPyIds((prev) => ({ ...prev, [file.id]: true }));
    }
    let content = Object.prototype.hasOwnProperty.call(pyContent, file.id) ? (pyContent[file.id] ?? '') : null;
    if (content === null) {
      content = await loadPyFileContent(file);
    }
    if (content === null) return;
    setEditingPyId(file.id);
    setPyEditDraft(String(content ?? ''));
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const cancelEditingPyFile = () => {
    setEditingPyId(null);
    setPyEditDraft('');
    setPyEditSaving(false);
    setPyEditError('');
    setPyRunInput('');
    setPyRunOutput('');
    setPyRunError('');
    setPyRunLoading(false);
  };

  const saveEditingPyFile = async (file) => {
    if (!isPyFile(file?.name) || !file?.id) return;
    if (!canManageFile(file)) return;
    if (editingPyId !== file.id || pyEditSaving) return;
    setPyEditSaving(true);
    setPyEditError('');
    try {
      const content = String(pyEditDraft ?? '');
      const updated = await api.updateFileContent(file.id, content);
      setFiles((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
      setPyContent((prev) => ({ ...prev, [file.id]: content }));
      cancelEditingPyFile();
    } catch (err) {
      setPyEditError(err?.message || 'Не удалось сохранить файл');
    } finally {
      setPyEditSaving(false);
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

  const toggleImagePreview = (file) => {
    const url = getFileUrl(file);
    if (!url || !isImageFile(file)) return;
    setExpandedImageIds((prev) => {
      const next = { ...prev };
      if (next[file.id]) delete next[file.id];
      else next[file.id] = true;
      return next;
    });
  };

  const toggleFilePreview = (file) => {
    if (isPyFile(file.name)) return togglePyPreview(file);
    if (isPdfFile(file.name)) return togglePdfPreview(file);
    if (isImageFile(file)) return toggleImagePreview(file);
    return null;
  };

  const handleDelete = async (file) => {
    if (!canManageFile(file)) {
      alert('Недостаточно прав для удаления этого файла.');
      return;
    }
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
      setExpandedImageIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      if (renamingId === file.id) {
        cancelRename();
      }
      if (editingPyId === file.id) {
        cancelEditingPyFile();
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
    if (!canManageFile(file)) return;
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
    if (!canManageFile(file)) return;
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
        if (editingPyId === file.id) {
          cancelEditingPyFile();
        }
      }
      if (!isPdfFile(updated.name)) {
        setExpandedPdfIds((prev) => {
          if (!prev[file.id]) return prev;
          const next = { ...prev };
          delete next[file.id];
          return next;
        });
      }
      if (!isImageFile(updated)) {
        setExpandedImageIds((prev) => {
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
      <div className="inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
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

  const tasksWithFilesCount = taskOptions.reduce((sum, task) => {
    return sum + ((taskCounts.get(task.number) || 0) > 0 ? 1 : 0);
  }, 0);

  const renderNotesIntro = (message) => (
    <div className="animate-fadeIn space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Конспекты</h2>
              <p className="hidden md:block text-sm text-slate-600">Материалы по заданиям, папкам и категориям</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="rounded-2xl border border-dashed border-purple-200 bg-white/75 px-3 py-2.5 md:px-4 md:py-3 text-[13px] md:text-sm text-slate-600">
            {message}
          </div>
        </div>
      </div>
    </div>
  );

  if (role === 'teacher' && studentsList.length === 0) {
    return renderNotesIntro(
      studentsLoading ? 'Загрузка списка учеников...' : 'Сначала создайте ученика в панели учителя.'
    );
  }

  if (role === 'teacher' && !effectiveStudentId) {
    return renderNotesIntro('Выберите ученика, чтобы открыть его материалы.');
  }

  if (!currentTask) return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Конспекты</h2>
              <p className="hidden md:block text-sm text-slate-600">Выберите задание, чтобы открыть материалы</p>
            </div>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
            <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
              {`Файлов: ${files.length}`}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
              <span className="sm:hidden">{`Заполнено: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
              <span className="hidden sm:inline">{`Заполнено заданий: ${tasksWithFilesCount}/${taskOptions.length}`}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {taskOptions.map((task) => {
          const taskFilesCount = taskCounts.get(task.number) || 0;
          const hasFiles = taskFilesCount > 0;
          return (
            <Card
              key={task.number}
              onClick={() => setCurrentTask(normalizeTaskNumber(task.number))}
              className={`group space-y-2.5 md:space-y-3 p-3 sm:p-5 ${
                hasFiles
                  ? 'border-purple-200/80 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/35'
                  : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                  №{getTaskDisplayNumber(task)}
                </span>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] md:text-[11px] font-semibold ${
                    hasFiles
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-100 text-slate-500'
                  }`}
                >
                  {hasFiles ? `${taskFilesCount} файлов` : 'Пусто'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-xl md:rounded-2xl border ${
                  hasFiles ? 'border-purple-200 bg-white text-purple-600' : 'border-slate-200 bg-white text-slate-400'
                }`}>
                  <Folder size={19} />
                </span>
                <p className="hidden sm:block text-xs text-slate-500">
                  {hasFiles ? 'Открыть материалы задания' : 'Добавьте материалы для этой темы'}
                </p>
                <p className="sm:hidden text-[11px] text-slate-500">
                  {hasFiles ? 'Открыть' : 'Пусто'}
                </p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );

  if (!currentCategory) return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setCurrentTask(null)}
              className="inline-flex items-center gap-1 rounded-xl border border-purple-100 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-purple-300 hover:text-purple-700"
            >
              <ArrowLeft size={16} />
              К заданиям
            </button>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
            <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
              {`Задание ${formatTaskNumber(currentTask) || currentTask}`}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
              {`Файлов: ${taskCounts.get(normalizedCurrentTask) || 0}`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <Card
          onClick={() => setCurrentCategory('class')}
          className={`p-4 md:p-7 flex items-center gap-3 md:gap-4 ${
            categoryCounts.class > 0
              ? 'border-orange-200/80 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/45'
              : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
          }`}
        >
          <div className={`inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl border ${
            categoryCounts.class > 0 ? 'border-orange-200 bg-white text-orange-500' : 'border-slate-200 bg-white text-slate-400'
          }`}>
            <BookOpen size={24} />
          </div>
          <div>
            <h3 className="font-bold text-base md:text-lg text-gray-800">На уроке</h3>
            <p className="hidden md:block text-gray-500 text-sm">Презентации и скрипты</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              categoryCounts.class > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}>
              {categoryCounts.class > 0 ? `Файлов: ${categoryCounts.class}` : 'Пусто'}
            </span>
          </div>
        </Card>
        <Card
          onClick={() => setCurrentCategory('home')}
          className={`p-4 md:p-7 flex items-center gap-3 md:gap-4 ${
            categoryCounts.home > 0
              ? 'border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-lime-50/45'
              : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'
          }`}
        >
          <div className={`inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-xl md:rounded-2xl border ${
            categoryCounts.home > 0 ? 'border-emerald-200 bg-white text-emerald-500' : 'border-slate-200 bg-white text-slate-400'
          }`}>
            <FileText size={24} />
          </div>
          <div>
            <h3 className="font-bold text-base md:text-lg text-gray-800">Домашка</h3>
            <p className="hidden md:block text-gray-500 text-sm">Файлы заданий</p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
              categoryCounts.home > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}>
              {categoryCounts.home > 0 ? `Файлов: ${categoryCounts.home}` : 'Пусто'}
            </span>
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
  const currentFolderLabel = currentFolder
    ? (currentFolder.name || 'Папка')
    : 'Без папки';
  const pyEditorOptions = {
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: 'on',
    automaticLayout: true
  };
  const isMobileViewport = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 767px)').matches
    : false;
  const pyDraftEditorHeight = isMobileViewport ? '180px' : '220px';
  const pyFileEditorHeight = isMobileViewport ? '220px' : '340px';
  const pyIdleConsoleText = buildIdleConsoleText(pyRunInput, pyRunOutput, pyRunError);
  const pdfPreviewHeight = isMobileViewport ? '48vh' : '60vh';
  const imagePreviewMaxHeight = isMobileViewport ? '56vh' : '72vh';
  const currentTaskLabel = formatTaskNumber(currentTask) || currentTask;
  const currentCategoryLabel = currentCategory === 'class' ? 'На уроке' : 'Домашка';
  const uploadBlockedByRole = !canUploadToCurrentFolder;
  const uploadButtonLabel = isUploading
    ? 'Загрузка...'
    : (uploadBlockedByRole ? 'Только учитель' : 'Загрузить');

  return (
    <div className="animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 space-y-3 md:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setCurrentCategory(null)}
              className="inline-flex items-center gap-1 rounded-xl border border-purple-100 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-purple-300 hover:text-purple-700"
            >
              <ArrowLeft size={16} />
              Назад
            </button>
            {renderStudentPicker()}
          </div>
          <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="hidden md:flex text-base md:text-lg font-semibold text-gray-700 flex-wrap items-center gap-2">
                <button
                  onClick={() => setCurrentCategory(null)}
                  className="hover:text-purple-600"
                  type="button"
                >
                  Задание {currentTaskLabel}
                </button>
                <ChevronRight size={16} className="text-gray-300" />
                <button
                  onClick={() => setCurrentFolderId(null)}
                  className="hover:text-purple-600"
                  type="button"
                >
                  {currentCategoryLabel}
                </button>
                <ChevronRight size={16} className="text-gray-300" />
                <span className={currentFolderId ? 'text-gray-700' : 'text-gray-400'}>
                  {currentFolderLabel}
                </span>
              </div>
              <div className="md:hidden text-sm font-semibold text-gray-700">
                {`Задание ${currentTaskLabel} · ${currentCategoryLabel}`}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
                <span className="inline-flex items-center rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
                  <span className="md:hidden">{`Исп.: ${formatBytes(taskUsageBytes)}`}</span>
                  <span className="hidden md:inline">{`Использовано: ${formatBytes(taskUsageBytes)} из ${formatBytes(totalLimitBytes)}`}</span>
                </span>
                <span className={`inline-flex items-center rounded-full border px-2 py-1 md:px-2.5 ${
                  remainingBytes <= 10 * 1024 * 1024
                    ? 'border-rose-200 bg-rose-50 text-rose-600'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  Осталось: {formatBytes(remainingBytes)}
                </span>
                <span className="hidden md:inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-slate-600">
                  {`Файлов в разделе: ${filtered.length}`}
                </span>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} multiple disabled={uploadBlockedByRole} />
              <Button onClick={() => fileRef.current?.click()} disabled={isUploading || uploadBlockedByRole} className="w-full sm:w-auto min-w-[128px]">
                <Upload size={18} /> {uploadButtonLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setShowMobileFolderTools((prev) => {
              const next = !prev;
              if (next) setShowMobilePyTools(false);
              return next;
            });
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
            showMobileFolderTools
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {showMobileFolderTools ? 'Скрыть папки' : `Папки (${folders.length})`}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowMobilePyTools((prev) => {
              const next = !prev;
              if (next) setShowMobileFolderTools(false);
              return next;
            });
          }}
          className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
            showMobilePyTools
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {showMobilePyTools ? 'Скрыть Python' : 'Python файл'}
        </button>
      </div>

      <Card className={`space-y-4 border-purple-200/70 bg-gradient-to-br from-white via-white to-purple-50/45 ${showMobilePyTools ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800">Python файл</h3>
            <p className="text-xs text-slate-500">Создайте .py файл сразу в текущей папке</p>
          </div>
          <Button variant="secondary" onClick={() => setShowPyCreator((v) => !v)} disabled={uploadBlockedByRole}>
            <Plus size={16} /> {showPyCreator ? 'Скрыть' : 'Создать'}
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
                className="flex-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <Button onClick={handleCreatePyFile} disabled={pyDraftSaving || !pyDraftName.trim() || uploadBlockedByRole} className="w-full md:w-auto">
                {pyDraftSaving ? 'Сохранение...' : 'Сохранить файл'}
              </Button>
            </div>
            <div className="rounded-2xl overflow-hidden border border-gray-800">
              <Editor
                height={pyDraftEditorHeight}
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
      </Card>

      <Card className={`space-y-4 border-slate-200 bg-white/90 ${showMobileFolderTools ? 'block' : 'hidden'} md:block`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-800">Папки</h3>
            <p className="text-xs text-slate-500">Организуйте материалы внутри выбранного раздела</p>
          </div>
          <Button variant="secondary" onClick={() => setIsCreatingFolder((v) => !v)} className="w-full sm:w-auto">
            <FolderPlus size={16} /> Новая папка
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
              className="flex-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()} className="w-full md:w-auto">
              Создать
            </Button>
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
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
          {folders.map((folder) => {
            const sharedFolder = isLessonSharedFolder(folder);
            return (
              <button
                key={folder.id}
                onClick={() => {
                  if (renamingFolderId !== folder.id) setCurrentFolderId(folder.id);
                }}
                onDoubleClick={() => {
                  if (!sharedFolder) startRenameFolder(folder);
                }}
                onDragOver={(e) => {
                  if (!sharedFolder) handleFolderDragOver(e, folder.id);
                }}
                onDragLeave={(e) => {
                  if (!sharedFolder) handleFolderDragLeave(e, folder.id);
                }}
                onDrop={(e) => handleFolderDrop(e, folder.id)}
                className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                  dragOverFolderId === folder.id
                    ? 'border-purple-500 bg-purple-50 text-purple-700 ring-2 ring-purple-200'
                    : currentFolderId === folder.id
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : sharedFolder
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-gray-200 text-gray-600 hover:border-purple-300'
                }`}
              >
                {renamingFolderId === folder.id && !sharedFolder ? (
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
                    className="px-2 py-1 rounded-lg bg-white border border-purple-100 focus:border-purple-500 outline-none text-sm"
                    autoFocus
                  />
                ) : (
                  <>
                    {folder.name}
                    {sharedFolder && <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">общая</span>}
                    <span className="ml-2 text-xs opacity-70">{folderCounts.map.get(folder.id) || 0}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {foldersError && <p className="text-xs text-red-500 mt-2">{foldersError}</p>}
      </Card>

      <div
        onDrop={uploadBlockedByRole ? undefined : handleDrop}
        onDragOver={uploadBlockedByRole ? undefined : handleDragOver}
        onDragLeave={uploadBlockedByRole ? undefined : handleDragLeave}
        data-tour="files"
        className={`rounded-3xl border-2 border-dashed p-3.5 md:p-5 transition-all ${
          uploadBlockedByRole
            ? 'border-slate-200 bg-slate-50/70'
            : isDragging
            ? 'border-purple-400 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40'
            : 'border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70'
        }`}
      >
        <div className="mb-3 md:mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          {uploadBlockedByRole ? (
            <span>Загрузка в эту папку доступна только учителю</span>
          ) : (
            <>
              <span className="hidden md:inline">Перетащите файл сюда или вставьте изображение через Ctrl+V</span>
              <span className="md:hidden">Загрузите файл или вставьте изображение</span>
            </>
          )}
          <span className="text-[11px] md:text-xs text-slate-400">
            Папка: {currentFolderLabel} • Осталось {formatBytes(remainingBytes)}
          </span>
          {isUploading && <span className="text-xs font-bold text-purple-600">Загрузка...</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 md:p-10 text-center text-sm text-slate-400">
            {filesError || 'Пусто'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((f) => {
              const manageable = canManageFile(f);
              return (
              <div key={f.id} className="space-y-2">
                <div
                className={`flex items-start justify-between rounded-2xl border border-slate-200 bg-white/90 p-3 md:p-4 shadow-sm transition-all ${
                  draggingFileId === f.id ? 'opacity-60' : 'hover:border-purple-200 hover:shadow-md'
                }`}
                draggable={renamingId !== f.id && manageable}
                onDragStart={(e) => {
                  if (!manageable) return;
                  handleDragStartFile(e, f);
                }}
                onDragEnd={handleDragEndFile}
                onClick={() => toggleFilePreview(f)}
                role={(isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f)) ? 'button' : undefined}
                tabIndex={(isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f)) ? 0 : undefined}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && (isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f))) {
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
                      ) : manageable ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(f);
                          }}
                          className="font-medium text-sm md:text-base text-gray-800 truncate text-left hover:text-purple-600"
                          title="Переименовать"
                        >
                          {f.name}
                        </button>
                      ) : (
                        <span className="font-medium text-sm md:text-base text-gray-800 truncate text-left">
                          {f.name}
                        </span>
                      )}
                      <p className="text-xs text-gray-500">
                        {f.size}
                        <span className="hidden sm:inline">{` • ${f.date}`}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 md:gap-2">
                    {renamingId === f.id ? null : (
                      <>
                        {!isPyFile(f.name) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownload(f); }}
                            className="p-1.5 md:p-2 hover:bg-gray-100 rounded text-gray-500"
                            title="Скачать файл"
                          >
                            <Download size={17}/>
                          </button>
                        )}
                        {manageable && (
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(f); }} className="p-1.5 md:p-2 hover:bg-red-50 rounded text-red-500"><Trash2 size={17}/></button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                {isPyFile(f.name) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedPyIds[f.id] ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <div className="bg-white border rounded-xl p-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">
                          {editingPyId === f.id
                            ? `Размер: ${formatBytes(getPyFileSize(pyEditDraft))}`
                            : 'Просмотр Python'}
                        </span>
                        {editingPyId === f.id ? (
                          <div className="flex w-full sm:w-auto items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelEditingPyFile();
                              }}
                              disabled={pyEditSaving}
                              className="w-full sm:w-auto"
                            >
                              Отмена
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                saveEditingPyFile(f);
                              }}
                              disabled={pyEditSaving}
                              className="w-full sm:w-auto"
                            >
                              {pyEditSaving ? 'Сохранение...' : 'Сохранить'}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingPyFile(f);
                            }}
                            disabled={pyLoadingId === f.id || Boolean(pyError[f.id]) || !manageable}
                            className="w-full sm:w-auto"
                          >
                            Редактировать
                          </Button>
                        )}
                      </div>
                      {editingPyId === f.id ? (
                        <div className="space-y-2">
                          <div className="rounded-xl overflow-hidden border border-gray-800">
                            <Editor
                              height={pyFileEditorHeight}
                              language="python"
                              theme="vs-dark"
                              value={pyEditDraft}
                              onChange={(value) => {
                                setPyEditDraft(value ?? '');
                                if (pyEditError) setPyEditError('');
                                if (pyRunOutput) setPyRunOutput('');
                                if (pyRunError) setPyRunError('');
                              }}
                              options={pyEditorOptions}
                              loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                            />
                          </div>
                          <div className="rounded-xl border p-2 bg-gray-50 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-600">
                                Консоль (IDLE): редактируйте секцию `{PY_IDLE_STDIN_HEADER}`
                              </span>
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRunEditedPyFile();
                                }}
                                disabled={pyRunLoading || pyEditSaving}
                                className="w-full sm:w-auto"
                              >
                                {pyRunLoading ? 'Запуск...' : 'Запустить'}
                              </Button>
                            </div>
                            <textarea
                              value={pyIdleConsoleText}
                              onChange={(e) => {
                                setPyRunInput(parseIdleConsoleInput(e.target.value, pyRunInput));
                              }}
                              readOnly={pyRunLoading}
                              spellCheck={false}
                              className="w-full min-h-[220px] text-xs font-mono leading-5 px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none focus:border-purple-500 resize-y"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl max-h-[55vh] overflow-auto">
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
                      )}
                      {editingPyId === f.id && pyEditError && (
                        <p className="text-xs text-red-500">{pyEditError}</p>
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
                        className="w-full"
                        style={{ height: pdfPreviewHeight }}
                      />
                    </div>
                  </div>
                )}
                {isImageFile(f) && (
                  <div className={`overflow-hidden transition-all duration-300 ease-out ${
                    expandedImageIds[f.id] ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
                  }`}>
                    <ImageViewer
                      src={getFileUrl(f)}
                      alt={f.name || 'Изображение'}
                      maxHeight={imagePreviewMaxHeight}
                    />
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesSection;



