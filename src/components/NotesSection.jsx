import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Monitor,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import ImageViewer from './ImageViewer';
import { api, authenticatedUploadsFetch } from '../services/api';
import { ensureMonacoColorTheme, resolveMonacoColorTheme } from '../utils/monacoTheme';
import { Button, Card } from './ui';

const mergeFolderLists = (lists) => {
  const merged = [];
  const seen = new Set();
  for (const list of lists || []) {
    for (const folder of list || []) {
      if (!folder?.id || seen.has(folder.id)) continue;
      seen.add(folder.id);
      merged.push(folder);
    }
  }
  return merged;
};
const AUTO_REFRESH_INTERVAL_MS = 5000;
const DEFAULT_NOTES_CATEGORY = 'class';

const NotesSection = ({
  theme = '',
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
  const monacoTheme = resolveMonacoColorTheme(theme);
  const [currentCategory, setCurrentCategory] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesError, setFilesError] = useState('');
  const [isRefreshingData, setIsRefreshingData] = useState(false);
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
  const [deletingFolderId, setDeletingFolderId] = useState(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState({});
  const [renamingId, setRenamingId] = useState(null);
  const [renameBase, setRenameBase] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [_draggingFileId, setDraggingFileId] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [selectedFileIds, setSelectedFileIds] = useState({});
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
  const [showMobileFolderTools, setShowMobileFolderTools] = useState(false);
  const restoringRef = useRef(false);
  const didRestoreRef = useRef(false);
  const skipNullSaveRef = useRef(true);
  const pendingFolderIdRef = useRef(null);
  const dragDepthRef = useRef(0);
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
  const normalizeParentFolderId = (value) => {
    const id = typeof value === 'string' ? value.trim() : '';
    return id || null;
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
    const nextCategory = nextTask ? DEFAULT_NOTES_CATEGORY : null;
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

  const normalizedFolders = useMemo(() => {
    const ids = new Set((folders || []).map((folder) => String(folder?.id || '').trim()).filter(Boolean));
    return (folders || []).map((folder) => {
      const folderId = String(folder?.id || '').trim();
      let parentFolderId = normalizeParentFolderId(folder?.parentFolderId);
      if (parentFolderId === folderId) parentFolderId = null;
      if (parentFolderId && !ids.has(parentFolderId)) parentFolderId = null;
      return { ...folder, parentFolderId };
    });
  }, [folders]);

  const foldersById = useMemo(() => {
    const map = new Map();
    normalizedFolders.forEach((folder) => {
      const folderId = String(folder?.id || '').trim();
      if (!folderId || map.has(folderId)) return;
      map.set(folderId, folder);
    });
    return map;
  }, [normalizedFolders]);

  const folderChildrenByParent = useMemo(() => {
    const childrenByParent = new Map();
    const addChild = (parentId, folder) => {
      const key = parentId || '__root__';
      const list = childrenByParent.get(key) || [];
      list.push(folder);
      childrenByParent.set(key, list);
    };
    normalizedFolders.forEach((folder) => {
      addChild(normalizeParentFolderId(folder?.parentFolderId), folder);
    });
    const sortFolders = (left, right) => {
      const leftShared = isLessonSharedFolder(left);
      const rightShared = isLessonSharedFolder(right);
      if (leftShared !== rightShared) return leftShared ? -1 : 1;
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'ru');
    };
    childrenByParent.forEach((list, key) => {
      childrenByParent.set(key, [...list].sort(sortFolders));
    });
    return childrenByParent;
  }, [normalizedFolders]);

  const folderTreeEntries = useMemo(() => {
    const result = [];
    const walk = (parentId, depth, chain) => {
      const key = parentId || '__root__';
      const children = folderChildrenByParent.get(key) || [];
      children.forEach((folder) => {
        const folderId = String(folder?.id || '').trim();
        if (!folderId || chain.has(folderId)) return;
        const childrenCount = (folderChildrenByParent.get(folderId) || []).length;
        const isExpanded = Boolean(expandedFolderIds[folderId]);
        result.push({
          folder,
          depth,
          hasChildren: childrenCount > 0,
          isExpanded
        });
        if (!childrenCount || !isExpanded) return;
        const nextChain = new Set(chain);
        nextChain.add(folderId);
        walk(folderId, depth + 1, nextChain);
      });
    };
    walk(null, 0, new Set());
    return result;
  }, [folderChildrenByParent, expandedFolderIds]);

  const currentFolder = useMemo(() => (
    currentFolderId ? (foldersById.get(currentFolderId) || null) : null
  ), [foldersById, currentFolderId]);

  const isFolderInLessonSharedTree = useCallback((folderId) => {
    if (!folderId) return false;
    const visited = new Set();
    let cursor = foldersById.get(folderId) || null;
    while (cursor && typeof cursor === 'object') {
      const cursorId = String(cursor?.id || '').trim();
      if (!cursorId || visited.has(cursorId)) break;
      visited.add(cursorId);
      if (isLessonSharedFolder(cursor)) return true;
      const parentId = normalizeParentFolderId(cursor?.parentFolderId);
      if (!parentId) break;
      cursor = foldersById.get(parentId) || null;
    }
    return false;
  }, [foldersById]);

  const isCurrentFolderLessonShared = isFolderInLessonSharedTree(currentFolderId);
  const currentFolderParentId = normalizeParentFolderId(currentFolder?.parentFolderId);
  const canUploadToCurrentFolder = !(role === 'student' && isCurrentFolderLessonShared);
  const canManageFile = (file) => !(role === 'student' && isLessonSharedFile(file));
  const activeUsageByNumber = isCurrentFolderLessonShared ? sharedTaskUsageByNumber : taskUsageByNumber;

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      const next = {};
      let changed = false;
      Object.entries(prev || {}).forEach(([folderId, isExpanded]) => {
        if (!isExpanded) return;
        if (!foldersById.has(folderId)) {
          changed = true;
          return;
        }
        next[folderId] = true;
      });
      const prevExpanded = Object.keys(prev || {}).filter((folderId) => prev[folderId]);
      if (!changed && prevExpanded.length === Object.keys(next).length) return prev;
      return next;
    });
  }, [foldersById]);

  useEffect(() => {
    if (!currentFolderId) return;
    const idsToExpand = [];
    const visited = new Set();
    let cursor = foldersById.get(currentFolderId) || null;
    while (cursor && typeof cursor === 'object') {
      const cursorId = String(cursor?.id || '').trim();
      if (!cursorId || visited.has(cursorId)) break;
      visited.add(cursorId);
      const parentId = normalizeParentFolderId(cursor?.parentFolderId);
      if (!parentId) break;
      idsToExpand.push(parentId);
      cursor = foldersById.get(parentId) || null;
    }
    if (!idsToExpand.length) return;
    setExpandedFolderIds((prev) => {
      const next = { ...(prev || {}) };
      let changed = false;
      idsToExpand.forEach((folderId) => {
        if (next[folderId]) return;
        next[folderId] = true;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [currentFolderId, foldersById]);

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
        setFolders(mergeFolderLists(lists));
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
    setDeletingFolderId(null);
    setRenamingId(null);
    setRenameBase('');
    setRenameExt('');
    setIsRenaming(false);
    setDraggingFileId(null);
    setDragOverFolderId(null);
    setSelectedFileIds({});
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
    setShowMobileFolderTools(false);
    if (restoringRef.current && (currentTask || currentCategory)) {
      restoringRef.current = false;
    }
  }, [currentTask, currentCategory]);

  useEffect(() => {
    if (restoringRef.current) {
      setFolders([]);
      setFiles([]);
      setSelectedFileIds({});
      setExpandedPyIds({});
      setExpandedPdfIds({});
      setExpandedImageIds({});
      setDeletingFolderId(null);
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
    setSelectedFileIds({});
    setExpandedPyIds({});
    setExpandedPdfIds({});
    setExpandedImageIds({});
    setDeletingFolderId(null);
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

  useEffect(() => {
    if (!currentTask || currentCategory) return;
    setCurrentCategory(DEFAULT_NOTES_CATEGORY);
  }, [currentTask, currentCategory]);

  useEffect(() => {
    setSelectedFileIds((prev) => {
      const validIds = new Set((files || []).map((entry) => String(entry?.id || '').trim()).filter(Boolean));
      const next = {};
      let changed = false;
      Object.keys(prev || {}).forEach((id) => {
        if (!prev[id]) return;
        if (!validIds.has(id)) {
          changed = true;
          return;
        }
        next[id] = true;
      });
      const prevKeys = Object.keys(prev || {}).filter((id) => prev[id]);
      if (!changed && prevKeys.length === Object.keys(next).length) return prev;
      return next;
    });
  }, [files]);

  useEffect(() => {
    setSelectedFileIds({});
  }, [currentFolderId]);

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
    dragDepthRef.current = 0;
    setIsDragging(false);
    const dropped = getDataTransferFiles(e.dataTransfer);
    handleUploadFiles(dropped);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (!isDragging) setIsDragging(true);
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
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
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
    if (!canUploadToCurrentFolder) {
      setFoldersError(`В папке "${LESSON_SHARED_FOLDER_NAME}" может создавать подпапки только учитель.`);
      return;
    }
    try {
      const created = await api.createFolder(
        uploadTaskNumber,
        currentCategory,
        name,
        effectiveStudentId,
        currentFolderId || null
      );
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

  const canDeleteFolder = (folder) => {
    if (!folder?.id) return false;
    if (role !== 'teacher') return false;
    if (folder?.isSystem) return false;
    if (isLessonSharedFolder(folder) && String(folder?.name || '').trim().toLowerCase() === LESSON_SHARED_FOLDER_NAME) {
      return false;
    }
    return true;
  };

  const handleDeleteFolder = async (folder) => {
    if (!canDeleteFolder(folder)) return;
    const folderName = String(folder?.name || 'Папка').trim() || 'Папка';
    const confirmed = window.confirm(`Удалить папку "${folderName}" и всё внутри?`);
    if (!confirmed) return;
    setDeletingFolderId(folder.id);
    try {
      const response = await api.deleteFolder(folder.id);
      const deletedFolderIds = Array.isArray(response?.deletedFolderIds)
        ? response.deletedFolderIds.map((item) => String(item || '').trim()).filter(Boolean)
        : [String(folder.id || '').trim()];
      const deletedFolderIdSet = new Set(deletedFolderIds);
      const deletedFileIdSet = new Set(
        Array.isArray(response?.deletedFileIds)
          ? response.deletedFileIds.map((item) => String(item || '').trim()).filter(Boolean)
          : []
      );

      setFolders((prev) => prev.filter((entry) => !deletedFolderIdSet.has(String(entry?.id || '').trim())));
      setFiles((prev) => prev.filter((entry) => {
        const fileId = String(entry?.id || '').trim();
        const fileFolderId = String(entry?.folderId || '').trim();
        if (deletedFileIdSet.has(fileId)) return false;
        if (fileFolderId && deletedFolderIdSet.has(fileFolderId)) return false;
        return true;
      }));
      setExpandedFolderIds((prev) => {
        const next = { ...(prev || {}) };
        let changed = false;
        Object.keys(next).forEach((folderKey) => {
          if (!deletedFolderIdSet.has(String(folderKey || '').trim())) return;
          delete next[folderKey];
          changed = true;
        });
        return changed ? next : prev;
      });
      setSelectedFileIds((prev) => {
        if (!prev || !Object.keys(prev).length) return prev;
        const next = { ...prev };
        let changed = false;
        deletedFileIdSet.forEach((fileId) => {
          if (!next[fileId]) return;
          delete next[fileId];
          changed = true;
        });
        return changed ? next : prev;
      });
      setCurrentFolderId((prev) => {
        const currentId = String(prev || '').trim();
        if (!currentId) return prev;
        if (deletedFolderIdSet.has(currentId)) return null;
        return prev;
      });
      if (renamingFolderId && deletedFolderIdSet.has(String(renamingFolderId || '').trim())) {
        cancelRenameFolder();
      }
      setFoldersError('');
    } catch (err) {
      setFoldersError(err?.message || err);
    } finally {
      setDeletingFolderId(null);
    }
  };

  const handleDragStartFile = (e, file) => {
    if (renamingId === file.id) return;
    const selectedIds = Object.keys(selectedFileIds || {}).filter((id) => selectedFileIds[id]);
    const isDraggingSelected = Boolean(selectedFileIds?.[file.id]);
    const dragIds = isDraggingSelected && selectedIds.length ? selectedIds : [file.id];
    if (!isDraggingSelected) {
      setSelectedFileIds({ [file.id]: true });
    }
    setDraggingFileId(file.id);
    e.dataTransfer.setData('text/plain', file.id);
    e.dataTransfer.setData('application/x-notes-file-ids', JSON.stringify(dragIds));
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
    let fileIds = [];
    const rawMulti = e.dataTransfer.getData('application/x-notes-file-ids');
    if (rawMulti) {
      try {
        const parsed = JSON.parse(rawMulti);
        if (Array.isArray(parsed)) {
          fileIds = parsed.map((id) => String(id || '').trim()).filter(Boolean);
        }
      } catch {
        fileIds = [];
      }
    }
    if (!fileIds.length) {
      const fallbackId = String(e.dataTransfer.getData('text/plain') || '').trim();
      if (fallbackId) fileIds = [fallbackId];
    }
    const uniqueFileIds = Array.from(new Set(fileIds));
    if (!uniqueFileIds.length) return;
    const draggedFiles = uniqueFileIds
      .map((fileId) => files.find((item) => item.id === fileId))
      .filter(Boolean);
    if (!draggedFiles.length) return;
    const unmanageableFile = draggedFiles.find((file) => !canManageFile(file));
    if (unmanageableFile) {
      alert('Недостаточно прав для изменения одного или нескольких файлов.');
      setDragOverFolderId(null);
      return;
    }
    const destinationFolderId = folderId || null;
    if (folderId) {
      const folder = folders.find((item) => item.id === folderId);
      const destinationIsLessonShared = folder ? isFolderInLessonSharedTree(folder.id) : false;
      if (destinationIsLessonShared) {
        if (role === 'student') {
          alert(`В папку "${LESSON_SHARED_FOLDER_NAME}" может перемещать файлы только учитель.`);
          setDragOverFolderId(null);
          return;
        }
      }
      const mismatchedTaskFile = draggedFiles.find((file) => {
        const fileTask = Number(file?.taskNumber);
        const folderTask = Number(folder?.taskNumber);
        return Number.isFinite(fileTask) && Number.isFinite(folderTask) && fileTask !== folderTask;
      });
      if (mismatchedTaskFile) {
        alert('Нельзя переместить файл в папку другого задания.');
        setDragOverFolderId(null);
        return;
      }
    }
    const filesToMove = draggedFiles.filter((file) => (
      (file?.folderId || null) !== destinationFolderId
    ));
    if (!filesToMove.length) {
      setDragOverFolderId(null);
      setDraggingFileId(null);
      return;
    }
    try {
      const movedFiles = [];
      const errors = [];
      for (const file of filesToMove) {
        try {
          const updated = await api.moveFile(file.id, folderId);
          movedFiles.push(updated);
        } catch (err) {
          errors.push(`${file.name}: ${err?.message || err}`);
        }
      }
      if (movedFiles.length) {
        const movedById = new Map(movedFiles.map((entry) => [entry.id, entry]));
        setFiles((prev) => prev.map((f) => (
          movedById.has(f.id) ? { ...f, ...movedById.get(f.id) } : f
        )));
        setSelectedFileIds({});
      }
      if (errors.length) {
        const details = errors.slice(0, 3).join('\n');
        const suffix = errors.length > 3 ? `\nи ещё ${errors.length - 3}` : '';
        alert(`Не удалось переместить часть файлов:\n${details}${suffix}`);
      }
      setDraggingFileId(null);
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

  const FileIcon = ({ name, compact = false }) => {
    const badgeClass = compact
      ? 'h-8 w-8 rounded-lg border border-slate-200 bg-white'
      : 'w-10 h-10 bg-transparent';
    const typeClass = compact
      ? 'mt-0 text-[9px]'
      : 'mt-1 text-[10px]';

    if (isImageFile(name)) {
      return (
        <div className={`flex flex-col items-center ${compact ? 'w-8' : 'w-12'}`}>
          <div className={`flex items-center justify-center ${badgeClass}`}>
            <ImageIcon size={22} className="text-violet-600" />
          </div>
          {!compact && <span className={`font-bold text-violet-700 ${typeClass}`}>IMG</span>}
        </div>
      );
    }
    if (isPdfFile(name)) {
      return (
        <div className={`flex flex-col items-center ${compact ? 'w-8' : 'w-12'}`}>
          <div className={`flex items-center justify-center ${badgeClass}`}>
            <PdfLogo />
          </div>
          {!compact && <span className={`font-bold text-red-600 ${typeClass}`}>PDF</span>}
        </div>
      );
    }
    if (isExcelFile(name)) {
      return (
        <div className={`flex flex-col items-center ${compact ? 'w-8' : 'w-12'}`}>
          <div className={`flex items-center justify-center ${badgeClass}`}>
            <ExcelLogo />
          </div>
          {!compact && <span className={`font-bold text-green-700 ${typeClass}`}>XLS</span>}
        </div>
      );
    }
    if (isPyFile(name)) {
      return (
        <div className={`flex flex-col items-center ${compact ? 'w-8' : 'w-12'}`}>
          <div className={`flex items-center justify-center ${badgeClass}`}>
            <PyLogo />
          </div>
          {!compact && <span className={`font-bold text-blue-600 ${typeClass}`}>PY</span>}
        </div>
      );
    }
    return (
      <div className={`flex items-center justify-center ${badgeClass}`}>
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
      const res = await authenticatedUploadsFetch(url);
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
      setSelectedFileIds((prev) => {
        if (!prev[file.id]) return prev;
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
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

  const handleRefreshData = useCallback(async () => {
    if (!effectiveStudentId || isRefreshingData) return;
    setIsRefreshingData(true);
    try {
      const taskNumbers = Number.isFinite(normalizedCurrentTask)
        ? (normalizedCurrentTask === GAME_THEORY_TASK ? [19, 20, 21] : [normalizedCurrentTask])
        : [];
      const [filesData, folderLists] = await Promise.all([
        api.getFiles(effectiveStudentId),
        (taskNumbers.length > 0 && currentCategory)
          ? Promise.all(taskNumbers.map((taskNumber) => api.getFolders(taskNumber, currentCategory, effectiveStudentId)))
          : Promise.resolve(null),
      ]);
      setFiles(Array.isArray(filesData) ? filesData : []);
      setFilesError('');
      if (folderLists) {
        setFolders(mergeFolderLists(folderLists));
        setFoldersError('');
      }
    } catch (err) {
      console.error(err);
      setFilesError('Не удалось обновить файлы. Проверьте, что сервер запущен.');
      if (Number.isFinite(normalizedCurrentTask) && currentCategory) {
        setFoldersError('Не удалось обновить папки.');
      }
    } finally {
      setIsRefreshingData(false);
    }
  }, [
    currentCategory,
    effectiveStudentId,
    isRefreshingData,
    normalizedCurrentTask,
    GAME_THEORY_TASK,
  ]);

  useEffect(() => {
    if (!effectiveStudentId) return;
    const poll = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      handleRefreshData();
    };
    const intervalId = setInterval(poll, AUTO_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        handleRefreshData();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [effectiveStudentId, handleRefreshData]);

  const renderStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="notes-explorer-student-picker inline-flex w-full sm:w-auto items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <select
          value={activeStudentId || ''}
          onChange={(e) => {
            const value = e.target.value;
            onSelectStudent?.(value || null);
          }}
          disabled={studentsLoading || studentsList.length === 0}
          className="notes-explorer-student-picker-select w-full min-w-0 sm:min-w-[180px] rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70"
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

  const openTaskExplorer = (taskNumber) => {
    const normalized = normalizeTaskNumber(taskNumber);
    if (!Number.isFinite(normalized)) return;
    setCurrentTask(normalized);
    setCurrentCategory(DEFAULT_NOTES_CATEGORY);
    setCurrentFolderId(null);
  };

  const closeTaskExplorer = () => {
    setCurrentTask(null);
    setCurrentCategory(null);
    setCurrentFolderId(null);
  };

  const getFileTypeLabel = (file) => {
    if (isPyFile(file?.name)) return 'Python';
    if (isPdfFile(file?.name)) return 'PDF';
    if (isImageFile(file)) return 'Изображение';
    if (isExcelFile(file?.name)) return 'Таблица';
    return 'Файл';
  };

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
              <p className="hidden md:block text-sm text-slate-600">Выберите задание, чтобы открыть файловый проводник</p>
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
              onClick={() => openTaskExplorer(task.number)}
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

  const effectiveCategory = currentCategory || DEFAULT_NOTES_CATEGORY;
  const filtered = files.filter((f) =>
    getNotesTaskNumber(f?.taskNumber) === normalizedCurrentTask &&
    f.category === effectiveCategory &&
    (currentFolderId ? f.folderId === currentFolderId : !f.folderId)
  );
  const currentFolderPath = (() => {
    if (!currentFolderId) return [];
    const labels = [];
    const visited = new Set();
    let cursorId = currentFolderId;
    while (cursorId && !visited.has(cursorId)) {
      visited.add(cursorId);
      const folder = foldersById.get(cursorId);
      if (!folder) break;
      labels.push(folder.name || 'Папка');
      cursorId = normalizeParentFolderId(folder.parentFolderId);
    }
    return labels.reverse();
  })();
  const currentFolderLabel = currentFolderPath.length
    ? currentFolderPath[currentFolderPath.length - 1]
    : 'Без папки';
  const currentFolderPathLabel = currentFolderPath.length
    ? `На уроке (корень) / ${currentFolderPath.join(' / ')}`
    : 'На уроке (корень)';
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
  const currentCategoryLabel = 'На уроке';
  const uploadBlockedByRole = !canUploadToCurrentFolder;
  const uploadButtonLabel = isUploading
    ? 'Загрузка...'
    : (uploadBlockedByRole ? 'Только учитель' : 'Загрузить');
  const handleExplorerBack = () => {
    if (currentFolderId) {
      setCurrentFolderId(currentFolderParentId);
      return;
    }
    closeTaskExplorer();
  };

  return (
    <div className="notes-explorer-shell animate-fadeIn space-y-4 md:space-y-5" data-tour="notes">
      <div className="notes-explorer-window overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
        <div className="notes-explorer-toolbar border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-3 py-3 md:px-4 md:py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Button
                variant="secondary"
                onClick={handleExplorerBack}
                className="notes-explorer-back-btn shrink-0"
                title="Назад"
              >
                <ArrowLeft size={16} />
                Назад
              </Button>
              <div className="space-y-1">
                <h3 className="notes-explorer-title text-base font-semibold text-slate-900 md:text-lg">
                  {`Проводник: задание ${currentTaskLabel}`}
                </h3>
              </div>
            </div>
            <div className="notes-explorer-quick-actions flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {renderStudentPicker()}
              <input type="file" ref={fileRef} className="hidden" onChange={handleUpload} multiple disabled={uploadBlockedByRole} />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={isUploading || uploadBlockedByRole}
                className="notes-explorer-upload-btn w-full sm:w-auto min-w-[156px]"
              >
                <Upload size={18} /> {uploadButtonLabel}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="notes-explorer-address flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm whitespace-nowrap text-slate-600">
              <Monitor size={14} className="shrink-0 text-slate-500" />
              <span className="shrink-0 text-slate-700">Конспекты</span>
              <ChevronRight size={13} className="shrink-0 text-slate-300" />
              <span className="shrink-0">{`Задание ${currentTaskLabel}`}</span>
              <ChevronRight size={13} className="shrink-0 text-slate-300" />
              <span className="shrink-0">{currentCategoryLabel}</span>
              {currentFolderPath.length > 0 ? (
                currentFolderPath.map((segment, index) => (
                  <React.Fragment key={`address-path-segment-${index}`}>
                    <ChevronRight size={13} className="shrink-0 text-slate-300" />
                    <span className={`shrink-0 ${index === currentFolderPath.length - 1 ? 'notes-explorer-address-current text-slate-900' : 'text-slate-600'}`}>
                      {segment}
                    </span>
                  </React.Fragment>
                ))
              ) : (
                <>
                  <ChevronRight size={13} className="shrink-0 text-slate-300" />
                  <span className="notes-explorer-address-empty shrink-0 text-slate-500">Без папки</span>
                </>
              )}
            </div>
          </div>
          {role !== 'student' && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold md:text-xs">
              <span className="notes-explorer-stat inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700 md:px-2.5">
                {`Файлов в папке: ${filtered.length}`}
              </span>
              <span className="notes-explorer-stat inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700 md:px-2.5">
                {`Использовано: ${formatBytes(taskUsageBytes)} / ${formatBytes(totalLimitBytes)}`}
              </span>
              <span className={`notes-explorer-stat notes-explorer-stat-remaining inline-flex items-center rounded-full border px-2 py-1 md:px-2.5 ${
                remainingBytes <= 10 * 1024 * 1024
                  ? 'border-rose-200 bg-rose-50 text-rose-600'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                Осталось: {formatBytes(remainingBytes)}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="md:hidden grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => {
            setShowMobileFolderTools((prev) => !prev);
          }}
          className={`notes-explorer-mobile-toggle rounded-xl border px-3 py-2 text-xs font-semibold ${
            showMobileFolderTools
              ? 'border-purple-500 bg-purple-50 text-purple-700'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          {showMobileFolderTools ? 'Скрыть папки' : `Папки (${normalizedFolders.length})`}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[320px,minmax(0,1fr)] md:items-start">
        <div className="space-y-3">
          <Card className={`notes-explorer-panel notes-explorer-folder-panel space-y-4 border-slate-200 bg-white/90 ${showMobileFolderTools ? 'block' : 'hidden'} md:block`}>
            <div className="notes-explorer-folder-header flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="notes-explorer-folder-title font-bold text-gray-800">Папки</h3>
                <p className="notes-explorer-folder-subtitle text-xs text-slate-500">Создавайте папки и подпапки</p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setIsCreatingFolder((v) => !v)}
                disabled={uploadBlockedByRole}
                className="notes-explorer-folder-add-btn w-full sm:w-auto"
              >
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
                  placeholder={currentFolderId ? 'Название подпапки' : 'Название папки'}
                  className="notes-explorer-folder-input flex-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                />
                <Button onClick={handleCreateFolder} disabled={!newFolderName.trim() || uploadBlockedByRole} className="notes-explorer-folder-create-submit w-full md:w-auto">
                  Создать
                </Button>
              </div>
            )}

            <div className="notes-explorer-folder-tree space-y-1 rounded-2xl p-2">
              <button
                onClick={() => setCurrentFolderId(null)}
                onDragOver={(e) => handleFolderDragOver(e, 'root')}
                onDragLeave={(e) => handleFolderDragLeave(e, 'root')}
                onDrop={(e) => handleFolderDrop(e, null)}
                className={`notes-explorer-folder-row notes-explorer-folder-row-root ${
                  dragOverFolderId === 'root'
                    ? 'is-drop-target'
                    : currentFolderId === null
                      ? 'is-current'
                      : ''
                }`}
                type="button"
              >
                <span className="notes-explorer-folder-label">
                  <Folder size={16} className="notes-explorer-folder-icon" />
                  <span className="notes-explorer-folder-name">На уроке (корень)</span>
                </span>
                <span className="notes-explorer-folder-row-meta">
                  <span className="notes-explorer-folder-count">{folderCounts.root}</span>
                </span>
              </button>
              {folderTreeEntries.map(({ folder, depth, hasChildren, isExpanded }) => {
                const sharedFolder = isLessonSharedFolder(folder);
                const isCurrentFolder = currentFolderId === folder.id;
                const canDeleteCurrentFolder = canDeleteFolder(folder);
                const indent = Math.min(depth, 8) * 16;
                return (
                  <div
                    key={folder.id}
                    onClick={() => {
                      if (renamingFolderId !== folder.id) setCurrentFolderId(folder.id);
                    }}
                    onKeyDown={(e) => {
                      if (renamingFolderId === folder.id) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCurrentFolderId(folder.id);
                      }
                    }}
                    onDoubleClick={() => {
                      if (!sharedFolder) startRenameFolder(folder);
                    }}
                    onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                    onDragLeave={(e) => handleFolderDragLeave(e, folder.id)}
                    onDrop={(e) => handleFolderDrop(e, folder.id)}
                    className={`notes-explorer-folder-row ${
                      dragOverFolderId === folder.id
                        ? 'is-drop-target'
                        : isCurrentFolder
                          ? 'is-current'
                          : ''
                    } ${sharedFolder ? 'is-shared' : ''}`}
                    style={{ paddingLeft: `${12 + indent}px` }}
                    role="button"
                    tabIndex={renamingFolderId === folder.id ? -1 : 0}
                  >
                    <div className="notes-explorer-folder-label">
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedFolderIds((prev) => {
                              const next = { ...(prev || {}) };
                              if (next[folder.id]) delete next[folder.id];
                              else next[folder.id] = true;
                              return next;
                            });
                          }}
                          className="notes-explorer-folder-toggle"
                          aria-label={isExpanded ? 'Свернуть папку' : 'Развернуть папку'}
                          title={isExpanded ? 'Свернуть папку' : 'Развернуть папку'}
                        >
                          <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      ) : (
                        <span className="notes-explorer-folder-toggle-spacer" />
                      )}
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
                          className="notes-explorer-folder-rename-input px-2 py-1 rounded-lg bg-white border border-purple-100 focus:border-purple-500 outline-none text-sm"
                          autoFocus
                        />
                      ) : (
                        <span className="notes-explorer-folder-label">
                          <Folder size={16} className="notes-explorer-folder-icon" />
                          <span className="notes-explorer-folder-name">{folder.name}</span>
                        </span>
                      )}
                    </div>
                    {renamingFolderId === folder.id && !sharedFolder ? null : (
                      <span className="notes-explorer-folder-row-meta">
                        {canDeleteCurrentFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFolder(folder);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            disabled={deletingFolderId === folder.id}
                            className="notes-explorer-folder-delete-btn"
                            title="Удалить папку"
                            aria-label="Удалить папку"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <span className="notes-explorer-folder-count">{folderCounts.map.get(folder.id) || 0}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {foldersError && <p className="text-xs text-red-500 mt-2">{foldersError}</p>}
          </Card>
        </div>

      <div
        onDrop={uploadBlockedByRole ? undefined : handleDrop}
        onDragEnter={uploadBlockedByRole ? undefined : handleDragEnter}
        onDragOver={uploadBlockedByRole ? undefined : handleDragOver}
        onDragLeave={uploadBlockedByRole ? undefined : handleDragLeave}
        data-tour="files"
        className={`notes-explorer-files rounded-3xl border-2 border-dashed p-3.5 md:p-5 transition-all ${
          isDragging ? 'is-dragging' : ''
        } ${
          uploadBlockedByRole
            ? 'border-slate-200 bg-slate-50/70'
            : isDragging
            ? 'border-purple-400 bg-gradient-to-br from-purple-50 via-white to-fuchsia-50/40'
            : 'border-slate-200 bg-gradient-to-br from-white via-white to-slate-50/70'
        }`}
      >
        <div className="notes-explorer-python-card mb-3 rounded-2xl border border-slate-200/80 bg-white/85 p-3 md:mb-4 md:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h3 className="notes-explorer-python-title text-sm font-bold text-gray-800">Python файл</h3>
              <p className="notes-explorer-python-subtitle text-xs text-slate-500">Создайте .py файл сразу в текущей папке</p>
            </div>
            <Button variant="secondary" onClick={() => setShowPyCreator((v) => !v)} disabled={uploadBlockedByRole} className="notes-explorer-python-toggle w-full sm:w-auto">
              <Plus size={16} /> {showPyCreator ? 'Скрыть' : 'Создать'}
            </Button>
          </div>
          {showPyCreator && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  type="text"
                  value={pyDraftName}
                  onChange={(e) => { setPyDraftName(e.target.value); setPyDraftError(''); }}
                  placeholder="Название файла (без .py)"
                  className="notes-explorer-python-input flex-1 min-w-0 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
                />
                <Button onClick={handleCreatePyFile} disabled={pyDraftSaving || !pyDraftName.trim() || uploadBlockedByRole} className="notes-explorer-python-save-btn w-full md:w-auto">
                  {pyDraftSaving ? 'Сохранение...' : 'Сохранить файл'}
                </Button>
              </div>
              <div className="rounded-2xl overflow-hidden border border-gray-800">
                <Editor
                  height={pyDraftEditorHeight}
                  language="python"
                  theme={monacoTheme}
                  beforeMount={ensureMonacoColorTheme}
                  value={pyDraftCode}
                  onChange={(value) => {
                    setPyDraftCode(value ?? '');
                    if (pyDraftError) setPyDraftError('');
                  }}
                  options={pyEditorOptions}
                  loading={<div className="p-4 text-sm text-gray-400">Загрузка редактора...</div>}
                />
              </div>
              <div className="notes-explorer-python-meta flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
                <span>Файл сохранится в папке: {currentFolderLabel}</span>
                <span>Размер: {formatBytes(getPyDraftSize(pyDraftCode))}</span>
              </div>
              {pyDraftError && <p className="text-xs text-red-500">{pyDraftError}</p>}
            </div>
          )}
        </div>

        <div className="notes-explorer-files-meta mb-3 md:mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          {uploadBlockedByRole ? (
            <span>Загрузка в эту папку доступна только учителю</span>
          ) : (
            <>
              <span className="hidden md:inline">Перетащите файл сюда или вставьте изображение через Ctrl+V</span>
              <span className="md:hidden">Загрузите файл или вставьте изображение</span>
            </>
          )}
          <span className="notes-explorer-files-meta-path text-[11px] md:text-xs text-slate-400">
            Папка: {currentFolderPathLabel} • Осталось {formatBytes(remainingBytes)}
          </span>
          {isUploading && <span className="notes-explorer-files-meta-progress text-xs font-bold text-purple-600">Загрузка...</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="notes-explorer-empty-state rounded-2xl border border-dashed border-slate-200 bg-white/80 p-6 md:p-10 text-center text-sm text-slate-400">
            {filesError || 'Пусто'}
          </div>
        ) : (
          <div className="notes-explorer-table overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Имя</th>
                    <th className="px-3 py-2 text-left">Тип</th>
                    <th className="px-3 py-2 text-left">Размер</th>
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => {
                    const manageable = canManageFile(f);
                    const isPreviewable = isPyFile(f.name) || isPdfFile(f.name) || isImageFile(f);
                    const isExpanded = Boolean(expandedPyIds[f.id] || expandedPdfIds[f.id] || expandedImageIds[f.id]);
                    const isSelected = Boolean(selectedFileIds[f.id]);
                    return (
                      <React.Fragment key={f.id}>
                        <tr
                          className={`border-t border-slate-100 ${
                            isSelected
                              ? 'notes-row-selected bg-blue-100/80'
                              : (isExpanded ? 'notes-row-expanded bg-blue-50/55' : 'hover:bg-slate-50')
                          } ${isPreviewable ? 'cursor-pointer' : ''}`}
                          draggable={renamingId !== f.id && manageable}
                          onDragStart={(e) => {
                            if (!manageable) return;
                            handleDragStartFile(e, f);
                          }}
                          onDragEnd={handleDragEndFile}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              if (!manageable) return;
                              setSelectedFileIds((prev) => {
                                const next = { ...(prev || {}) };
                                if (next[f.id]) delete next[f.id];
                                else next[f.id] = true;
                                return next;
                              });
                              return;
                            }
                            if (isPreviewable) toggleFilePreview(f);
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && isPreviewable) {
                              e.preventDefault();
                              toggleFilePreview(f);
                            }
                          }}
                          role={isPreviewable ? 'button' : undefined}
                          tabIndex={isPreviewable ? 0 : undefined}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex min-w-[220px] items-center gap-2">
                              <FileIcon name={f.name} compact />
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
                                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {renameExt ? (
                                      <span className="text-sm text-gray-500 select-none">.{renameExt}</span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="notes-explorer-file-name block truncate font-medium text-slate-800">{f.name}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{getFileTypeLabel(f)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{f.size}</td>
                          <td className="px-3 py-2.5 text-slate-500">{f.date}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {!isPyFile(f.name) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(f);
                                  }}
                                  className="notes-explorer-file-action-btn rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                  title="Скачать файл"
                                  type="button"
                                >
                                  <Download size={16} />
                                </button>
                              )}
                              {manageable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(f);
                                  }}
                                  className="notes-explorer-file-action-btn rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                  title="Переименовать"
                                  type="button"
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {manageable && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(f);
                                  }}
                                  className="notes-explorer-file-action-btn notes-explorer-file-action-btn-danger rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                                  title="Удалить файл"
                                  type="button"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isPyFile(f.name) && (
                          <tr className={`${expandedPyIds[f.id] ? '' : 'hidden'}`}>
                            <td colSpan={5} className="notes-explorer-preview-cell border-t border-slate-100 bg-white px-3 py-3">
                              <div className="notes-explorer-preview-panel space-y-2 rounded-xl border border-slate-200 bg-white p-2">
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
                                    <div className="overflow-hidden rounded-xl border border-gray-800">
                                      <Editor
                                        height={pyFileEditorHeight}
                                        language="python"
                                        theme={monacoTheme}
                                        beforeMount={ensureMonacoColorTheme}
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
                                    <div className="notes-explorer-console-panel space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                                        className="notes-explorer-console-input min-h-[220px] w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none focus:border-purple-500"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="max-h-[55vh] overflow-auto rounded-xl">
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
                            </td>
                          </tr>
                        )}
                        {isPdfFile(f.name) && (
                          <tr className={`${expandedPdfIds[f.id] ? '' : 'hidden'}`}>
                            <td colSpan={5} className="notes-explorer-preview-cell border-t border-slate-100 bg-white px-3 py-3">
                              <div className="notes-explorer-preview-panel overflow-hidden rounded-xl border border-slate-200 bg-white">
                                <iframe
                                  title={f.name}
                                  src={getFileUrl(f)}
                                  className="w-full"
                                  style={{ height: pdfPreviewHeight }}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                        {isImageFile(f) && (
                          <tr className={`${expandedImageIds[f.id] ? '' : 'hidden'}`}>
                            <td colSpan={5} className="notes-explorer-preview-cell border-t border-slate-100 bg-white px-3 py-3">
                              <ImageViewer
                                src={getFileUrl(f)}
                                alt={f.name || 'Изображение'}
                                maxHeight={imagePreviewMaxHeight}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default NotesSection;



