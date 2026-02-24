import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './ui';
import { normalizeHttpUrl, splitTextWithUrls } from '../utils/linkifyText';
const NewHomeworkModal = ({
  entry,
  open,
  onClose,
  onOpenSchedule,
  onOpenTask,
  testsDb,
  solvedByTask,
  normalizeTaskNumber,
  isPythonTaskNumber,
  PYTHON_LEVEL_ID,
  normalizeGoalType,
  GOAL_TYPE_MOCK,
  getPythonTaskInfo,
  MOCK_TASKS,
  formatTaskNumber,
  LEVELS,
  HOMEWORK_POPUP_BG,
}) => {
  if (!open || !entry) return null;
  const homeWorkText = typeof entry.homeWork === 'string' ? entry.homeWork.trim() : '';
  const lessonLink = typeof entry.lessonLink === 'string' ? entry.lessonLink.trim() : '';
  const boardLink = typeof entry.boardLink === 'string' ? entry.boardLink.trim() : '';
  const lessonHref = normalizeHttpUrl(lessonLink);
  const boardHref = normalizeHttpUrl(boardLink);
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
      const goalType = normalizeGoalType(goal);
      if (goalType === GOAL_TYPE_MOCK) {
        return { label: 'Пробник', progressLabel: '' };
      }
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
      const label = isPythonGoal
        ? `Python ${taskTitle || (taskDisplay ? `тема ${taskDisplay}` : 'тема')}`
        : (() => {
            const labelBase = taskTitle
              ? `${taskDisplay ? `${taskDisplay}. ` : ''}${taskTitle}`
              : (taskDisplay ? `Задание ${taskDisplay}` : 'Задание');
            return levelLabel ? `${labelBase} · ${levelLabel}` : labelBase;
          })();
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
  const renderLinkedText = (text, keyPrefix = 'homework') => {
    const parts = splitTextWithUrls(text);
    if (parts.length === 0) return String(text || '');
    return parts.map((part, index) => {
      if (part.type === 'link') {
        return (
          <a
            key={`${keyPrefix}-link-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 break-all hover:text-white"
          >
            {part.value}
          </a>
        );
      }
      return (
        <React.Fragment key={`${keyPrefix}-text-${index}`}>
          {part.value}
        </React.Fragment>
      );
    });
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
          <div className="flex-1 flex flex-col items-center text-purple-50/90">
            <div className="mt-3 text-[16px] font-semibold tracking-[0.35em] uppercase text-purple-50/90">{'\u0426\u0415\u041b\u042c'}</div>
            {headline && (
              <div className="mt-3 w-full max-w-[420px] text-[16px] leading-snug text-purple-50/95">
                {renderLinkedText(headline, 'headline')}
              </div>
            )}
            <div className="mt-4 w-full max-w-[420px] space-y-3 text-[16px] text-purple-50/90 mx-auto text-left">
              {listItems.length > 0 ? (
                listItems.map((item, idx) => {
                  const { title, level } = splitGoalLabel(item.label);
                  return (
                    <div key={`${idx}-${item.label.slice(0, 24)}`} className="grid grid-cols-[1fr_auto] items-start gap-4">
                      <div className="leading-snug">
                        <div>{renderLinkedText(title, `item-${idx}-title`)}</div>
                        {level && (
                          <div className="text-[15px] text-purple-100/80">
                            {renderLinkedText(level, `item-${idx}-level`)}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 pt-0.5">
                        {item.progressLabel && (
                          <span className="text-sm text-purple-100/70">[{item.progressLabel}]</span>
                        )}
                        <span className="inline-flex w-4 h-4 border border-purple-200/70 rounded-sm" />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-sm text-purple-100/70">
                  {'\u0414\u043e\u043c\u0430\u0448\u043a\u0430 \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430.'}
                </div>
              )}
            </div>
            <div className="mt-auto w-full flex flex-wrap items-center justify-between gap-3 text-[12px] text-purple-100/80">
              <div className="flex flex-wrap items-center gap-3">
                {Number.isFinite(entry.daysToComplete) && (
                  <span className="ml-2">
                    {'\u0421\u0440\u043e\u043a: '}{entry.daysToComplete}{' \u0434\u043d.'}
                  </span>
                )}
                {issuedLabel && (
                  <span>{'\u0412\u044b\u0434\u0430\u043d\u043e: '}{issuedLabel}</span>
                )}
                {lessonHref && (
                  <a href={lessonHref} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
                    {'\u0423\u0440\u043e\u043a'}
                  </a>
                )}
                {boardHref && (
                  <a href={boardHref} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
                    {'\u0414\u043e\u0441\u043a\u0430'}
                  </a>
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
                  className="bg-purple-500/80 hover:bg-purple-500 text-white"
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



export default NewHomeworkModal;

