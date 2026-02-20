import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BarChart2, CheckCircle, Pencil, PlayCircle, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import ProgressReviewModal from './ProgressReviewModal';
import PythonReviewModal from './PythonReviewModal';
import PythonTestModal from './PythonTestModal';
import StudentTestModal from './StudentTestModal';
import { Button, Card, ProgressBar } from './ui';
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
  onStreakSaved,
  onXpGain,
  PYTHON_TASKS,
  PYTHON_LEVEL_ID,
  isPythonTaskNumber,
  getStudentLabel,
  parseTestsFileContent,
  buildGoogleDocEmbedUrl,
  buildGoogleDocFullUrl,
  getTaskDisplayNumber,
  ensurePyodideReady,
  mergeRuntimeErrorText,
  createPyodideWorker,
  withStudentId,
  isGoogleDocEmbedUrl,
  normalizeOutput,
  normalizeOutputForComparison,
  normalizeRuntimeErrorForCheck,
  getLocalDayKey,
  normalizeXpTotal,
  PYODIDE_RUN_TIMEOUT_MS,
  ALLOW_MAIN_THREAD_PYTHON_FALLBACK,
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
  const [showTeacherTaskToolsMobile, setShowTeacherTaskToolsMobile] = useState(false);
  const [showTeacherTheoryToolsMobile, setShowTeacherTheoryToolsMobile] = useState(false);
  const mobilePythonPathCanvasRef = useRef(null);
  const [mobilePythonPathCanvasWidth, setMobilePythonPathCanvasWidth] = useState(0);
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
    setShowTeacherTaskToolsMobile(false);
    setShowTeacherTheoryToolsMobile(false);
  }, [effectiveStudentId, role]);

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

  useLayoutEffect(() => {
    if (role !== 'student') return undefined;
    const element = mobilePythonPathCanvasRef.current;
    if (!element) return undefined;
    const updateWidth = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      if (!Number.isFinite(width) || width <= 0) return;
      setMobilePythonPathCanvasWidth((prev) => (Math.abs(prev - width) > 1 ? width : prev));
    };
    updateWidth();

    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateWidth());
      observer.observe(element);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    return undefined;
  }, [role, taskList.length]);

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
  const totalMasteryRounded = Math.round(totalMastery);
  const totalMasteryLabel = Number.isFinite(totalMastery) && totalMastery % 1 !== 0
    ? totalMastery.toFixed(1)
    : totalMasteryRounded.toString();
  const masteredTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) >= 70).length;
  const needsPracticeTopicsCount = taskList.filter((task) => Number(progressMap[task.id] || 0) < 40).length;
  const mobilePythonPathLayout = useMemo(() => {
    const ringSize = 124;
    const strokeWidth = 10;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const labelGap = 7;
    const labelHeight = 42;
    const topPadding = 10;
    const bottomPadding = 24;
    const nodeWidth = 156;
    const labelBoxWidth = 154;
    const pathWidth = Math.max(296, Math.round(mobilePythonPathCanvasWidth || 336));
    const xPattern = [22, 74, 34, 70, 28, 76, 40, 68, 30, 74, 42, 66];
    const stepPattern = [136, 148, 142, 156, 138, 150, 144, 152, 140, 154];
    const connectorPresets = [
      { sway: 22, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 18, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -19, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 20, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -22, lift: 19, pullA: 0.02, pullB: 0.02 },
      { sway: 17, lift: 16, pullA: 0.03, pullB: 0.01 },
      { sway: -20, lift: 18, pullA: 0.02, pullB: 0.02 },
      { sway: 19, lift: 17, pullA: 0.03, pullB: 0.01 },
      { sway: -21, lift: 19, pullA: 0.02, pullB: 0.02 },
    ];
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const pointInRect = (x, y, rect) => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
    const segmentHitsRect = (x1, y1, x2, y2, rect) => {
      if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
      const steps = 30;
      for (let i = 1; i < steps; i += 1) {
        const t = i / steps;
        const x = x1 + ((x2 - x1) * t);
        const y = y1 + ((y2 - y1) * t);
        if (pointInRect(x, y, rect)) return true;
      }
      return false;
    };
    const nodeHalfWidth = nodeWidth / 2;
    const centerMin = nodeHalfWidth + 4;
    const centerMax = Math.max(centerMin, pathWidth - nodeHalfWidth - 4);
    let currentTop = topPadding;
    const nodes = taskList.map((task, idx) => {
      const rawVal = Number(progressMap[task.id] || 0);
      const val = Number.isFinite(rawVal) ? Math.max(0, Math.min(100, rawVal)) : 0;
      const ringColor = val >= 85
        ? '#10b981'
        : (val >= 60 ? '#8b5cf6' : (val >= 40 ? '#f59e0b' : '#9ca3af'));
      const numericSeed = Number(task?.number);
      const seed = Number.isFinite(numericSeed) ? numericSeed : (idx + 1);
      const jitter = ((seed * 13) % 11) - 5;
      const xBase = clamp(xPattern[idx % xPattern.length] + jitter, 20, 80);
      const centerX = clamp((xBase / 100) * pathWidth, centerMin, centerMax);
      const top = currentTop;
      const centerY = top + (ringSize / 2);
      currentTop += stepPattern[idx % stepPattern.length];
      const compactTitle = String(task.title || '').replace(/\s+/g, ' ').trim();
      const title = compactTitle.length > 52 ? `${compactTitle.slice(0, 52)}...` : compactTitle;
      const labelTop = top + ringSize + labelGap;
      const labelLeft = centerX - (labelBoxWidth / 2);
      const labelRight = centerX + (labelBoxWidth / 2);
      const labelBottom = labelTop + labelHeight;
      return {
        task,
        idx,
        val,
        ringColor,
        centerX,
        centerY,
        top,
        labelTop,
        labelLeft,
        labelRight,
        labelBottom,
        title
      };
    });
    const curves = nodes.slice(0, -1).map((node, idx) => {
      const next = nodes[idx + 1];
      const preset = connectorPresets[idx % connectorPresets.length];
      const deltaX = next.centerX - node.centerX;
      const deltaY = next.centerY - node.centerY;
      const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
      const unitX = deltaX / distance;
      const unitY = deltaY / distance;
      const anchorOffset = (ringSize / 2) + (strokeWidth / 2) + 2;
      const startX = node.centerX + (unitX * anchorOffset);
      const startY = node.centerY + (unitY * anchorOffset);
      const endX = next.centerX - (unitX * anchorOffset);
      const endY = next.centerY - (unitY * anchorOffset);

      const currentLabelRect = {
        left: node.labelLeft - 4,
        right: node.labelRight + 4,
        top: node.labelTop - 4,
        bottom: node.labelBottom + 4
      };
      const nextLabelRect = {
        left: next.labelLeft - 4,
        right: next.labelRight + 4,
        top: next.labelTop - 4,
        bottom: next.labelBottom + 4
      };
      const shouldBypassLabels = segmentHitsRect(startX, startY, endX, endY, currentLabelRect)
        || segmentHitsRect(startX, startY, endX, endY, nextLabelRect);
      if (!shouldBypassLabels) {
        return {
          id: `${node.task.id}-${next.task.id}`,
          d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} L ${endX.toFixed(2)} ${endY.toFixed(2)}`
        };
      }

      const safeY = Math.min(node.labelTop, next.labelTop) - 16;
      const straightMidY = (startY + endY) / 2;
      const requiredLift = Math.max(0, straightMidY - safeY + 4);
      const tangentOut = clamp(distance * (0.23 + preset.pullA * 0.45), 18, 34);
      const tangentIn = clamp(distance * (0.23 + preset.pullB * 0.45), 18, 34);
      const baseC1X = startX + (unitX * tangentOut);
      const baseC1Y = startY + (unitY * tangentOut);
      const baseC2X = endX - (unitX * tangentIn);
      const baseC2Y = endY - (unitY * tangentIn);
      const nearVertical = Math.abs(deltaX) < 72 && Math.abs(deltaY) > 36;
      const swayFactor = nearVertical
        ? Math.max(0.28, Math.min(0.9, (72 - Math.abs(deltaX)) / 72))
        : 0.18;
      const lateral = preset.sway * swayFactor * 0.34;
      const lift = clamp((preset.lift * 0.58) + requiredLift, 8, 30);
      let c1x = clamp(baseC1X + lateral, 8, pathWidth - 8);
      let c2x = clamp(baseC2X - (lateral * 0.78), 8, pathWidth - 8);
      let c1y = baseC1Y - lift;
      let c2y = baseC2Y - (lift * 0.92);
      const yOvershoot = Math.max(c1y - safeY, c2y - safeY, 0);
      if (yOvershoot > 0) {
        c1y -= yOvershoot;
        c2y -= yOvershoot;
      }
      const minCurveY = Math.min(startY, endY) - 58;
      c1y = Math.max(minCurveY, c1y);
      c2y = Math.max(minCurveY + 6, c2y);
      const minControlGap = Math.max(8, Math.abs(deltaX) * 0.06);
      if (deltaX >= 0 && c2x < c1x + minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
      } else if (deltaX < 0 && c2x > c1x - minControlGap) {
        const mid = (c1x + c2x) / 2;
        c1x = clamp(mid + (minControlGap / 2), 8, pathWidth - 8);
        c2x = clamp(mid - (minControlGap / 2), 8, pathWidth - 8);
      }
      return {
        id: `${node.task.id}-${next.task.id}`,
        d: `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${endX.toFixed(2)} ${endY.toFixed(2)}`
      };
    });
    const lastNode = nodes[nodes.length - 1];
    const height = lastNode
      ? Math.round(lastNode.top + ringSize + labelGap + labelHeight + bottomPadding)
      : 200;
    return {
      nodes,
      curves,
      width: pathWidth,
      height,
      nodeWidth,
      ringSize,
      strokeWidth,
      radius,
      circumference
    };
  }, [taskList, progressMap, mobilePythonPathCanvasWidth]);

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
    <div className="space-y-4 md:space-y-6 animate-fadeIn">
      <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-white via-purple-50/70 to-sky-50/70 p-4 md:p-6 shadow-[0_16px_34px_rgba(99,102,241,0.14)]">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-200/40 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -left-10 -bottom-12 h-40 w-40 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 md:gap-5">
          <div className="flex flex-col gap-3 md:gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2.5 md:space-y-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-gray-900">Изучение Python</h2>
                <p className="hidden md:block text-sm text-slate-600">Тестирования по темам курса и общий прогресс</p>
              </div>
              <div className="flex flex-wrap gap-1.5 md:gap-2 text-[11px] md:text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-white/90 px-2 py-1 md:px-2.5 text-purple-700">
                  <BarChart2 size={13} />
                  <span className="sm:hidden">{`Прогресс: ${totalMasteryLabel}%`}</span>
                  <span className="hidden sm:inline">{`Общий прогресс: ${totalMasteryLabel}%`}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/90 px-2 py-1 md:px-2.5 text-emerald-700">
                  <CheckCircle size={13} />
                  <span className="sm:hidden">{`Увер.: ${masteredTopicsCount}/${taskList.length}`}</span>
                  <span className="hidden sm:inline">{`Уверенно: ${masteredTopicsCount}/${taskList.length}`}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white/90 px-2 py-1 md:px-2.5 text-amber-700">
                  <RefreshCcw size={12} />
                  {`Подтянуть: ${needsPracticeTopicsCount}`}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderStudentPicker()}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-purple-200/80 bg-white/80 p-3 md:p-4 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-600 px-2.5 py-1 text-[10px] md:text-xs font-bold uppercase tracking-[0.14em] md:tracking-widest text-white">
                  Прогресс Python
                </div>
                <span className="hidden md:inline text-sm text-gray-500">Общий прогресс изучения</span>
              </div>
              <div className="text-2xl md:text-3xl font-extrabold text-purple-700 drop-shadow-sm">
                {totalMasteryLabel}%
              </div>
            </div>
            <div className="relative mt-2.5 md:mt-3 h-6 md:h-8 w-full overflow-hidden rounded-full border border-purple-100 bg-white/90">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_18px_rgba(168,85,247,0.45)] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, Number(totalMastery) || 0))}%` }}
              />
              <div
                key={`sheen-python-${totalMasteryRounded}`}
                className="absolute inset-0 pointer-events-none bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.6),transparent)] animate-sheen"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-gray-500">
              <span className="hidden sm:inline">Проходите темы последовательно</span>
              <span className="sm:hidden">Идите по темам по порядку</span>
              <span>0% — старт • 100% — уверенно</span>
            </div>
          </div>
        </div>
      </div>

      {(dataError || testsDbError) && (
        <div className="space-y-2">
          {dataError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-600">
              {dataError}
            </div>
          )}
          {testsDbError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-700">
              {testsDbError}
            </div>
          )}
        </div>
      )}

      {role === 'student' && (
        <div className="md:hidden">
          <div className="mobile-topic-path-card rounded-3xl border border-purple-200/80 bg-white/85 p-3 shadow-[0_10px_24px_rgba(99,102,241,0.12)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">Путь по темам Python</h3>
              <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-700">
                {`Средний: ${totalMasteryLabel}%`}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">Открывай темы по очереди и закрепляй прогресс.</div>
            <div className="mt-3">
              <div
                ref={mobilePythonPathCanvasRef}
                className="mobile-topic-path-canvas relative overflow-visible rounded-2xl border border-purple-100/80 bg-gradient-to-b from-white/95 via-purple-50/55 to-sky-50/45 px-1.5 py-2"
                style={{ height: `${mobilePythonPathLayout.height}px` }}
              >
                <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
                  <svg
                    className="h-full w-full"
                    viewBox={`0 0 ${mobilePythonPathLayout.width} ${mobilePythonPathLayout.height}`}
                    preserveAspectRatio="none"
                  >
                    {mobilePythonPathLayout.curves.map((curve, curveIdx) => (
                      <path
                        key={`mobile-python-curve-${curve.id}`}
                        d={curve.d}
                        fill="none"
                        stroke="var(--mobile-path-curve, rgba(168,85,247,0.44))"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeDasharray={curveIdx % 2 === 0 ? '7.5 6.4' : '6.8 6'}
                      />
                    ))}
                  </svg>
                </div>
                {mobilePythonPathLayout.nodes.map((node) => {
                  const dashOffset = mobilePythonPathLayout.circumference - (node.val / 100) * mobilePythonPathLayout.circumference;
                  const isSelected = String(activeTask?.id) === String(node.task.id);
                  const isMastered = node.val >= 85;
                  const isStable = node.val >= 60 && node.val < 85;
                  const isWarmingUp = node.val >= 40 && node.val < 60;
                  const ringGlow = isMastered
                    ? 'rgba(16,185,129,0.34)'
                    : (isStable ? 'rgba(139,92,246,0.34)' : (isWarmingUp ? 'rgba(245,158,11,0.34)' : 'rgba(148,163,184,0.26)'));
                  const progressAngle = Math.max(0, Math.min(360, Number(node.val || 0) * 3.6));
                  const statusLabel = isMastered
                    ? 'Сильная'
                    : (isStable ? 'В темпе' : (isWarmingUp ? 'Практика' : 'Фокус'));
                  const statusTone = isMastered
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : (isStable
                        ? 'border-purple-200 bg-purple-50 text-purple-700'
                        : (isWarmingUp
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'));
                  return (
                    <button
                      key={`mobile-python-path-${node.task.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQuestionIndex(null);
                        setActiveTask(node.task);
                      }}
                      className={`mobile-path-node group absolute z-10 rounded-2xl bg-transparent px-1 transition-transform ${
                        isSelected ? 'mobile-path-node--selected scale-[1.03]' : ''
                      }`}
                      style={{
                        left: `${node.centerX}px`,
                        top: `${node.top}px`,
                        width: `${mobilePythonPathLayout.nodeWidth}px`,
                        transform: isSelected ? 'translateX(-50%) scale(1.03)' : 'translateX(-50%)',
                        '--ring-accent': node.ringColor,
                        '--ring-glow': ringGlow,
                        '--progress-angle': `${progressAngle}deg`,
                        '--ring-size': `${mobilePythonPathLayout.ringSize}px`,
                        '--ring-stroke': `${mobilePythonPathLayout.strokeWidth}px`,
                        '--node-delay': `${Math.max(0, node.idx % 8) * 60}ms`
                      }}
                      aria-label={`Открыть тему ${node.task.title}`}
                    >
                      <div
                        className={`mobile-topic-ring-shell relative mx-auto ${
                          isSelected ? 'mobile-topic-ring-shell--selected' : ''
                        } ${isMastered ? 'mobile-topic-ring-shell--mastered' : ''}`}
                        style={{ height: `${mobilePythonPathLayout.ringSize}px`, width: `${mobilePythonPathLayout.ringSize}px` }}
                      >
                        <div className="mobile-topic-glow absolute inset-[-8px] rounded-full" />
                        <div className="mobile-topic-orbit" />
                        <div className="mobile-topic-conic" />
                        <svg
                          className="relative z-[4] h-full w-full -rotate-90"
                          viewBox={`0 0 ${mobilePythonPathLayout.ringSize} ${mobilePythonPathLayout.ringSize}`}
                          aria-hidden="true"
                        >
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke="var(--mobile-ring-track, #d7dee8)"
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                          />
                          <circle
                            cx={mobilePythonPathLayout.ringSize / 2}
                            cy={mobilePythonPathLayout.ringSize / 2}
                            r={mobilePythonPathLayout.radius}
                            fill="none"
                            stroke={node.ringColor}
                            strokeWidth={mobilePythonPathLayout.strokeWidth}
                            strokeLinecap="round"
                            strokeDasharray={mobilePythonPathLayout.circumference}
                            strokeDashoffset={dashOffset}
                            style={{ transition: 'stroke-dashoffset 420ms ease, stroke 220ms ease' }}
                          />
                        </svg>
                        {node.val > 2 && <span className="mobile-topic-marker" />}
                        <div className="mobile-topic-core absolute inset-[12px] z-[5] rounded-full border border-white/90 bg-gradient-to-br from-white to-purple-50 shadow-[0_12px_22px_rgba(15,23,42,0.18)]" />
                        <div className="absolute inset-0 z-[6] flex flex-col items-center justify-center px-2">
                          <div className="text-[22px] font-black leading-none text-slate-900">№{getTaskDisplayNumber(node.task)}</div>
                          <div className="mt-1 text-[14px] font-bold leading-tight text-slate-600">{`${node.val}%`}</div>
                        </div>
                        <div className="mobile-topic-shine" />
                        {isMastered && <span className="mobile-topic-sparkle" />}
                      </div>
                      <div className="mt-1.5 flex justify-center px-1">
                        <div className={`mobile-topic-label-card max-w-[148px] rounded-xl border border-white/80 bg-white/88 px-2.5 py-1 shadow-[0_7px_14px_rgba(148,163,184,0.22)] ${isSelected ? 'ring-2 ring-purple-200/80' : ''}`}>
                          <div className="text-center text-[12.5px] font-semibold leading-[1.05rem] text-slate-700 [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] overflow-hidden">
                            {node.title}
                          </div>
                          <div className="mt-1.5 flex justify-center">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${statusTone}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`${role === 'student' ? 'hidden md:grid' : 'grid'} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 stagger-children`}>
        {taskList.map((task, idx) => {
          const val = progressMap[task.id] || 0;
          const clickable = role === 'student' || role === 'teacher';
          const cardTone = val >= 85
            ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-50/50'
            : (val >= 60
                ? 'border-purple-200/90 bg-gradient-to-br from-purple-50/65 via-white to-fuchsia-50/45'
                : (val >= 40
                    ? 'border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-orange-50/35'
                    : 'border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-slate-100/70'));
          const statusLabel = val >= 85 ? 'Сильная тема' : (val >= 60 ? 'В работе' : (val >= 40 ? 'Нужна практика' : 'Зона внимания'));
          return (
            <Card
              key={task.id}
              style={{ '--i': idx }}
              className={`group relative p-3.5 md:p-4 ${cardTone}`}
              onClick={clickable ? () => {
                if (role === 'teacher') setReviewTask(task);
                else {
                  setActiveQuestionIndex(null);
                  setActiveTask(task);
                }
              } : undefined}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center rounded-lg border border-purple-200 bg-white/90 px-2 py-1 text-[11px] md:text-xs font-bold text-purple-700">
                  №{getTaskDisplayNumber(task)}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 px-2 py-1 text-[10px] md:text-xs font-semibold text-slate-600">
                  {statusLabel}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-[15px] md:text-base leading-snug text-gray-800">{task.title}</h3>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] md:text-xs text-slate-500">
                <span>
                  <span className="sm:hidden">Тема</span>
                  <span className="hidden sm:inline">Прогресс темы</span>
                </span>
                <span className="text-sm md:text-base font-bold text-slate-700">{val}%</span>
              </div>
              <ProgressBar value={val} />

              {clickable && (
                <div className="absolute inset-0 hidden md:flex bg-white/90 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center rounded-2xl cursor-pointer backdrop-blur-[2px]">
                  <div className="flex items-center gap-2 text-purple-600 font-bold bg-white px-4 py-2 rounded-full shadow-lg border border-purple-100">
                    <PlayCircle size={20} /> {role === 'teacher' ? 'Решения' : 'Решать'}
                  </div>
                </div>
              )}
              {clickable && (
                <div className="mt-3 md:hidden text-xs font-semibold text-purple-600">
                  {role === 'teacher' ? 'Смотреть решения' : 'Открыть тему'}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {role === 'teacher' && (
        <div className="md:hidden grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setShowTeacherTaskToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTheoryToolsMobile(false);
                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTaskToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTaskToolsMobile ? 'Скрыть задачи' : 'Задачи Python'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowTeacherTheoryToolsMobile((prev) => {
                const next = !prev;
                if (next) setShowTeacherTaskToolsMobile(false);
                return next;
              });
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
              showTeacherTheoryToolsMobile
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {showTeacherTheoryToolsMobile ? 'Скрыть теорию' : 'Теория'}
          </button>
        </div>
      )}

      {role === 'teacher' && (
        <Card className={`space-y-4 border-purple-200/60 bg-gradient-to-br from-white via-white to-purple-50/40 ${showTeacherTaskToolsMobile ? 'block' : 'hidden'} md:block`}>
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
              className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none text-sm"
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
              className="md:col-span-1 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
            <textarea
              value={newTaskPrompt}
              onChange={(e) => setNewTaskPrompt(e.target.value)}
              placeholder="Условие задачи"
              className="md:col-span-2 px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[80px]"
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase">Тесты</span>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
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
                    className="px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
                  />
                  <div className="relative">
                    <textarea
                      value={test.output}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewTests((prev) => prev.map((item, i) => (i === idx ? { ...item, output: value } : item)));
                      }}
                      placeholder="Ожидаемый вывод"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none min-h-[60px]"
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
            <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {editingQuestionId && (
                <Button variant="secondary" onClick={cancelEditPythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                  Отменить
                </Button>
              )}
              <Button onClick={handleSavePythonTask} disabled={questionSaving} className="w-full sm:w-auto">
                {questionSaving ? 'Сохранение...' : (editingQuestionId ? 'Сохранить' : 'Добавить задачу')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {manageQuestions.length === 0 ? (
              <div className="text-sm text-gray-500">Пока нет задач для выбранной темы.</div>
            ) : (
              manageQuestions.map((q, idx) => (
                <div key={q.id || idx} className="p-3 rounded-xl border border-purple-100 bg-white/85 flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{q.title || q.question || `Задача ${idx + 1}`}</p>
                    <p className="text-xs text-gray-500 mt-1">Тестов: {Array.isArray(q.tests) ? q.tests.length : (q.answer ? 1 : 0)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
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
        <Card className={`space-y-4 border-slate-200 bg-white/90 ${showTeacherTheoryToolsMobile ? 'block' : 'hidden'} md:block`}>
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
                    : 'bg-white text-gray-600 border-purple-100 hover:border-purple-300'
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
              className="w-full min-h-[160px] px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
            />
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={theoryUrl}
                onChange={(e) => setTheoryUrl(e.target.value)}
                placeholder="Вставьте ссылку на документ или iframe Google Docs"
                className="w-full px-4 py-2 rounded-xl bg-white border border-purple-100 focus:border-purple-500 outline-none"
              />
              <p className="hidden md:block text-xs text-gray-400">
                Используйте ссылку для встраивания из Google Docs (Файл → Опубликовать в интернете → Встроить).
              </p>
              <p className="text-[11px] text-gray-400">
                Подойдут и обычные ссылки на документ (view/edit) — они встроятся через preview. Для оглавления используйте «Открыть полностью».
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {theoryError && <span className="text-xs text-red-500">{theoryError}</span>}
            <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button variant="secondary" onClick={handleClearPythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
                Очистить
              </Button>
              <Button onClick={handleSavePythonTheory} disabled={theorySaving} className="w-full sm:w-auto">
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
          onXpGain={onXpGain}
          PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
          ensurePyodideReady={ensurePyodideReady}
          mergeRuntimeErrorText={mergeRuntimeErrorText}
          createPyodideWorker={createPyodideWorker}
          withStudentId={withStudentId}
          isGoogleDocEmbedUrl={isGoogleDocEmbedUrl}
          normalizeOutput={normalizeOutput}
          normalizeOutputForComparison={normalizeOutputForComparison}
          normalizeRuntimeErrorForCheck={normalizeRuntimeErrorForCheck}
          getLocalDayKey={getLocalDayKey}
          normalizeXpTotal={normalizeXpTotal}
          buildGoogleDocFullUrl={buildGoogleDocFullUrl}
          PYODIDE_RUN_TIMEOUT_MS={PYODIDE_RUN_TIMEOUT_MS}
          ALLOW_MAIN_THREAD_PYTHON_FALLBACK={ALLOW_MAIN_THREAD_PYTHON_FALLBACK}
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
          PYTHON_LEVEL_ID={PYTHON_LEVEL_ID}
          isGoogleDocEmbedUrl={isGoogleDocEmbedUrl}
          buildGoogleDocFullUrl={buildGoogleDocFullUrl}
        />
      )}
    </div>
  );
};



export default PythonSection;

