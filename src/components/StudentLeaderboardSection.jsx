import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, LockKeyhole, Package2, RefreshCcw, Sparkles } from 'lucide-react';
import CoinGuideIcon from './CoinGuideTooltip';
import { api } from '../services/api';
import chestClosedImage from '../assets/mock-chest/chest-closed.png';
import chestOpenImage from '../assets/mock-chest/chest-open.png';
import MockChestOpeningOverlay from './MockChestOpeningOverlay';
import StudentArtifactAltar from './StudentArtifactAltar';
import StudentLeaderboardProfileModal from './StudentLeaderboardProfileModal';
import StudentSearchSelect from './StudentSearchSelect';

const BONUS_TONE_CLASSNAME = {
  xp: 'border-violet-200 bg-violet-50/90 text-violet-700',
  coins: 'border-amber-200 bg-amber-50/90 text-amber-700',
  instant: 'border-emerald-200 bg-emerald-50/90 text-emerald-700',
};
const LEADERBOARD_ALIAS_COIN_REWARD = 100;
const MOCK_TIMER_CHEST_DEFAULT_SLOT_COUNT = 8;
const MOCK_TIMER_CHEST_DEFAULT_OPEN_MS = 3 * 60 * 60 * 1000;

const normalizeOptionalWholeNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.floor(number));
};

const formatChestDuration = (value) => {
  const ms = Math.max(0, Math.ceil(Number(value) || 0));
  if (ms <= 0) return '0 м';
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ч ${minutes} м`;
  if (hours > 0) return `${hours} ч`;
  return `${minutes} м`;
};

const formatChestCountdown = (value) => {
  const totalSeconds = Math.max(0, Math.ceil((Number(value) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

const formatChestCountLabel = (count) => {
  const normalized = Math.max(0, Math.floor(Number(count) || 0));
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${normalized} сундуков`;
  if (last === 1) return `${normalized} сундук`;
  if (last >= 2 && last <= 4) return `${normalized} сундука`;
  return `${normalized} сундуков`;
};

const getClientChestState = (chest, nowMs) => {
  const readyAtMs = Date.parse(chest?.openReadyAt || '');
  if (Number.isFinite(readyAtMs)) {
    return readyAtMs <= nowMs ? 'ready' : 'opening';
  }
  const state = String(chest?.state || '').trim().toLowerCase();
  return ['closed', 'opening', 'ready'].includes(state) ? state : 'closed';
};

const LeaderboardAliasRewardChip = () => (
  <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-1.5 text-[11px] font-black leading-none text-amber-800 shadow-sm">
    <span>{`+${LEADERBOARD_ALIAS_COIN_REWARD}`}</span>
    <CoinGuideIcon className="h-3.5 w-3.5" />
  </span>
);

const getLeagueIconClassName = (leagueId, size = 'default') => {
  if (leagueId === 'blank') {
    return size === 'sm' ? 'h-8 w-8' : 'h-[2.35rem] w-[2.35rem]';
  }

  if (leagueId === 'celestial') {
    if (size === 'sm') return 'h-10 w-10 max-w-none scale-[1.12]';
    if (size === 'md') return 'h-[2.8rem] w-[2.8rem] max-w-none scale-[1.28]';
    return 'h-12 w-12 max-w-none scale-[1.34]';
  }

  if (size === 'sm') return 'h-10 w-10 max-w-none scale-[1.12]';
  if (size === 'md') return 'h-11 w-11 max-w-none scale-[1.16]';
  return 'h-12 w-12 max-w-none scale-[1.2]';
};

const StudentLeaderboardSection = ({
  role,
  userId,
  userName,
  normalizeXpTotal,
  getLeagueByXp,
  getLevelFromXp,
  getLevelProgressFromXp,
  formatStreakDate,
  BLANK_LEAGUE,
  LEAGUE_TIERS,
  getLeagueAuraStyle,
  isAbsoluteOrAboveLeague,
  ABSOLUTE_AURA_CROWN_STYLE,
  TOP_PLACE_NUMBER_DECOR,
  getTopPlaceNumberStyle,
  studentCoinsTotal = 0,
  onStudentCoinsChange,
  onStudentXpChange,
  students = [],
  activeStudentId = '',
  onSelectStudent,
  studentsLoading = false,
}) => {
  const [leaderboard, setLeaderboard] = useState({
    items: [],
    week: null,
    currentStudent: null,
    selectedStudent: null,
  });
  const [altar, setAltar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasError, setAliasError] = useState('');
  const [aliasSuccess, setAliasSuccess] = useState('');
  const [aliasMode, setAliasMode] = useState('choose');
  const [isLeagueRangesOpen, setIsLeagueRangesOpen] = useState(false);
  const [spinLoading, setSpinLoading] = useState(false);
  const [spinError, setSpinError] = useState('');
  const [chestActionId, setChestActionId] = useState('');
  const [chestError, setChestError] = useState('');
  const [chestNotice, setChestNotice] = useState(null);
  const [chestPressFeedback, setChestPressFeedback] = useState({ id: '', nonce: 0 });
  const [chestOpeningRewards, setChestOpeningRewards] = useState([]);
  const [chestTimerNow, setChestTimerNow] = useState(() => Date.now());
  const [studentProfileState, setStudentProfileState] = useState({
    open: false,
    studentId: '',
    row: null,
    data: null,
    loading: false,
    error: '',
  });
  const mountedRef = useRef(true);
  const studentProfileRequestIdRef = useRef(0);
  const chestPressTimerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (chestPressTimerRef.current) {
        window.clearTimeout(chestPressTimerRef.current);
        chestPressTimerRef.current = null;
      }
    };
  }, []);

  const loadLeaderboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const selectedStudentId = role === 'teacher' ? String(activeStudentId || '').trim() : '';
      const data = await api.getStudentsLeaderboard(
        selectedStudentId ? { studentId: selectedStudentId } : undefined
      );
      if (!mountedRef.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      const week = data?.week && typeof data.week === 'object' ? data.week : null;
      const currentStudent = data?.currentStudent && typeof data.currentStudent === 'object'
        ? data.currentStudent
        : null;
      const selectedStudent = data?.selectedStudent && typeof data.selectedStudent === 'object'
        ? data.selectedStudent
        : null;
      const nextAltar = data?.altar && typeof data.altar === 'object'
        ? data.altar
        : null;
      setLeaderboard({ items, week, currentStudent, selectedStudent });
      setAltar(nextAltar);
      setChestError('');
      if (role === 'student') {
        if (currentStudent?.hasAlias && typeof currentStudent.publicName === 'string') {
          setAliasInput(currentStudent.publicName);
          setAliasMode('choose');
        } else {
          setAliasInput('');
          setAliasMode('choose');
        }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Не удалось загрузить рейтинг.');
      setLeaderboard({ items: [], week: null, currentStudent: null, selectedStudent: null });
      setAltar(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeStudentId, role]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const teacherSelectedStudentId = role === 'teacher' ? String(activeStudentId || '').trim() : '';

  const rows = useMemo(() => {
    const list = Array.isArray(leaderboard.items) ? leaderboard.items : [];
    return list.map((entry, index) => {
      const studentId = String(entry?.studentId || `student-${index}`);
      const xpTotal = normalizeXpTotal(entry?.xpTotal);
      const weeklyXp = normalizeXpTotal(entry?.weeklyXp);
      const league = getLeagueByXp(xpTotal);
      const resolvedLevelRaw = Number(entry?.level);
      const level = Number.isFinite(resolvedLevelRaw) && resolvedLevelRaw > 0
        ? Math.floor(resolvedLevelRaw)
        : (typeof getLevelFromXp === 'function' ? getLevelFromXp(xpTotal) : 1);
      const displayNameRaw = typeof entry?.publicName === 'string' ? entry.publicName.trim() : '';
      const displayName = displayNameRaw || `Аноним ${index + 1}`;
      const hasAlias = Boolean(entry?.hasAlias);
      const mainName = typeof entry?.mainName === 'string' ? entry.mainName.trim() : '';
      const nickname = typeof entry?.nickname === 'string' ? entry.nickname.trim() : '';
      const isCurrent = role === 'student' && (
        Boolean(entry?.isCurrent) || (String(userId || '') === studentId)
      );
      const isSelected = role === 'teacher'
        && Boolean(teacherSelectedStudentId)
        && studentId === teacherSelectedStudentId;
      return {
        studentId,
        displayName,
        hasAlias,
        mainName,
        nickname,
        showTeacherIdentity: role === 'teacher',
        xpTotal,
        xpTotalLabel: xpTotal.toLocaleString('ru-RU'),
        weeklyXp,
        weeklyXpLabel: weeklyXp.toLocaleString('ru-RU'),
        level,
        league,
        isCurrent,
        isSelected,
      };
    });
  }, [leaderboard.items, role, teacherSelectedStudentId, userId]);

  const teacherStudentOptions = useMemo(() => {
    if (role !== 'teacher') return [];
    const sourceStudents = Array.isArray(students) ? students : [];
    const source = sourceStudents.length > 0
      ? sourceStudents.map((student) => {
          const id = String(student?.id || '').trim();
          if (!id) return null;
          const name = typeof student?.name === 'string' ? student.name.trim() : '';
          const nickname = typeof student?.nickname === 'string' ? student.nickname.trim() : '';
          return {
            id,
            name,
            nickname,
          };
        })
      : rows.map((row) => ({
          id: row.studentId,
          name: row.mainName,
          nickname: row.nickname || row.displayName,
        }));
    const seen = new Set();
    return source.filter((option) => {
      if (!option?.id || seen.has(option.id)) return false;
      seen.add(option.id);
      return true;
    });
  }, [role, rows, students]);

  const byLevel = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.xpTotal !== a.xpTotal) return b.xpTotal - a.xpTotal;
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [rows]);

  const byWeeklyXp = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      if (b.level !== a.level) return b.level - a.level;
      if (b.xpTotal !== a.xpTotal) return b.xpTotal - a.xpTotal;
      return a.displayName.localeCompare(b.displayName, 'ru');
    });
  }, [rows]);

  const weekRangeLabel = useMemo(() => {
    const week = leaderboard?.week && typeof leaderboard.week === 'object'
      ? leaderboard.week
      : null;
    const start = formatStreakDate(week?.startDay);
    const end = formatStreakDate(week?.endDay);
    if (start && end) return `${start} - ${end}`;
    return 'последние 7 дней';
  }, [leaderboard.week]);

  const leagueRangeRows = useMemo(() => {
    const orderedLeagues = [BLANK_LEAGUE, ...[...LEAGUE_TIERS].sort((a, b) => a.minXp - b.minXp)];
    return orderedLeagues.map((league, index) => {
      const nextLeague = orderedLeagues[index + 1];
      const minXp = normalizeXpTotal(league.minXp);
      const maxXp = nextLeague ? Math.max(minXp, normalizeXpTotal(nextLeague.minXp) - 1) : null;
      const minLabel = minXp.toLocaleString('ru-RU');
      const maxLabel = maxXp !== null ? maxXp.toLocaleString('ru-RU') : null;
      return {
        ...league,
        rangeLabel: maxLabel ? `${minLabel} - ${maxLabel} XP` : `${minLabel}+ XP`,
      };
    });
  }, []);

  const currentStudentRow = role === 'student'
    ? (rows.find((row) => row.isCurrent) || null)
    : null;
  const currentRatingPosition = role === 'student'
    ? (() => {
      const index = byLevel.findIndex((row) => row.isCurrent);
      return index >= 0 ? index + 1 : null;
    })()
    : null;
  const currentLeague = currentStudentRow?.league || BLANK_LEAGUE;
  const currentLeagueAuraStyle = getLeagueAuraStyle(currentLeague.id);
  const isCurrentLeagueAbsolute = isAbsoluteOrAboveLeague(currentLeague.id);
  const currentStudentMeta = role === 'student' && leaderboard?.currentStudent
    ? leaderboard.currentStudent
    : null;
  const currentChestPanel = currentStudentMeta?.mockTimerChests && typeof currentStudentMeta.mockTimerChests === 'object'
    ? currentStudentMeta.mockTimerChests
    : {
        slotCount: MOCK_TIMER_CHEST_DEFAULT_SLOT_COUNT,
        openDurationMs: MOCK_TIMER_CHEST_DEFAULT_OPEN_MS,
        chests: [],
        visibleChests: [],
        overflowCount: 0,
        canStartOpening: true,
      };
  const currentChestList = Array.isArray(currentChestPanel.chests)
    ? currentChestPanel.chests
    : (Array.isArray(currentChestPanel.visibleChests) ? currentChestPanel.visibleChests : []);
  const currentStudentMainName = (() => {
    const fromLeaderboard = typeof currentStudentMeta?.mainName === 'string'
      ? currentStudentMeta.mainName.trim()
      : '';
    if (fromLeaderboard) return fromLeaderboard;
    const fromProfile = typeof userName === 'string' ? userName.trim() : '';
    return fromProfile;
  })();
  const needsAliasPrompt = role === 'student' && currentStudentMeta && !currentStudentMeta.hasAlias;
  const hasAliasRewardAvailable = needsAliasPrompt && !currentStudentMeta?.leaderboardAliasRewardClaimed;
  const selectedTeacherRow = role === 'teacher' && teacherSelectedStudentId
    ? (rows.find((row) => row.studentId === teacherSelectedStudentId) || null)
    : null;
  const selectedTeacherMeta = role === 'teacher' && leaderboard?.selectedStudent
    ? leaderboard.selectedStudent
    : null;
  const hasLoadedSelectedTeacher = role === 'teacher'
    && Boolean(teacherSelectedStudentId)
    && String(selectedTeacherMeta?.studentId || '').trim() === teacherSelectedStudentId;
  const selectedTeacherName = selectedTeacherRow?.mainName
    || selectedTeacherMeta?.mainName
    || selectedTeacherRow?.displayName
    || selectedTeacherMeta?.publicName
    || '';
  const selectedTeacherSubtitle = selectedTeacherRow
    ? `${selectedTeacherRow.league.label} - Уровень ${selectedTeacherRow.level} - ${selectedTeacherRow.xpTotalLabel} XP`
    : '';
  const teacherBonusEntries = hasLoadedSelectedTeacher && Array.isArray(altar?.bonuses?.entries)
    ? altar.bonuses.entries.filter((entry) => entry && typeof entry === 'object')
    : [];
  const teacherArtifactTotalOwned = hasLoadedSelectedTeacher && Number.isFinite(Number(altar?.totalOwned))
    ? Math.max(0, Math.floor(Number(altar.totalOwned)))
    : 0;
  const teacherArtifactUniqueOwned = hasLoadedSelectedTeacher && Number.isFinite(Number(altar?.uniqueOwned))
    ? Math.max(0, Math.floor(Number(altar.uniqueOwned)))
    : 0;
  const teacherArtifactTotalPulls = hasLoadedSelectedTeacher && Number.isFinite(Number(altar?.totalPulls))
    ? Math.max(0, Math.floor(Number(altar.totalPulls)))
    : 0;
  const activeProfileStudentId = String(studentProfileState.studentId || '').trim();
  const activeProfileRow = activeProfileStudentId
    ? (rows.find((row) => row.studentId === activeProfileStudentId) || studentProfileState.row || null)
    : null;
  const activeProfileLevelPosition = activeProfileStudentId
    ? (() => {
        const index = byLevel.findIndex((row) => row.studentId === activeProfileStudentId);
        return index >= 0 ? index + 1 : null;
      })()
    : null;
  const activeProfileWeeklyPosition = activeProfileStudentId
    ? (() => {
        const index = byWeeklyXp.findIndex((row) => row.studentId === activeProfileStudentId);
        return index >= 0 ? index + 1 : null;
      })()
    : null;

  useEffect(() => {
    if (role !== 'student') return undefined;
    const hasOpeningChest = currentChestList.some((chest) => (
      getClientChestState(chest, chestTimerNow) === 'opening'
    ));
    if (!hasOpeningChest) return undefined;
    const timer = window.setInterval(() => {
      setChestTimerNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentChestList, chestTimerNow, role]);

  const handleSaveAlias = async () => {
    const normalized = String(aliasInput || '').trim();
    if (!/^[А-Яа-яЁё]{2,6}$/.test(normalized)) {
      setAliasError('Псевдоним: 2-6 символов, только русские буквы.');
      setAliasSuccess('');
      return;
    }
    setAliasSaving(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      const data = await api.setLeaderboardAlias(normalized);
      if (!mountedRef.current) return;
      const coinsGained = normalizeOptionalWholeNumber(data?.coinsGained) || 0;
      const nextCoinsTotal = normalizeOptionalWholeNumber(data?.coinsTotal);
      if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
        onStudentCoinsChange(nextCoinsTotal);
      }
      setAliasSuccess(coinsGained > 0
        ? `Псевдоним сохранён. +${coinsGained.toLocaleString('ru-RU')} монет!`
        : 'Псевдоним сохранён.');
      await loadLeaderboard({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      setAliasError(err?.message || 'Не удалось сохранить псевдоним.');
    } finally {
      if (mountedRef.current) {
        setAliasSaving(false);
      }
    }
  };

  const handleUseMainName = async () => {
    if (!currentStudentMainName) {
      setAliasError('Не удалось определить основное имя.');
      setAliasSuccess('');
      return;
    }
    setAliasSaving(true);
    setAliasError('');
    setAliasSuccess('');
    try {
      const data = await api.setLeaderboardAlias({ useMainName: true, alias: currentStudentMainName });
      if (!mountedRef.current) return;
      const coinsGained = normalizeOptionalWholeNumber(data?.coinsGained) || 0;
      const nextCoinsTotal = normalizeOptionalWholeNumber(data?.coinsTotal);
      if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
        onStudentCoinsChange(nextCoinsTotal);
      }
      setAliasSuccess(coinsGained > 0
        ? `Основное имя добавлено в рейтинг. +${coinsGained.toLocaleString('ru-RU')} монет!`
        : 'Основное имя добавлено в рейтинг.');
      await loadLeaderboard({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      setAliasError(err?.message || 'Не удалось добавить основное имя.');
    } finally {
      if (mountedRef.current) {
        setAliasSaving(false);
      }
    }
  };

  const handleSpinArtifact = useCallback(async () => {
    if (role !== 'student' || spinLoading) return;
    setSpinError('');
    setSpinLoading(true);
    try {
      const data = await api.spinArtifactAltar();
      if (!mountedRef.current) return;
      const nextCoinsTotal = normalizeOptionalWholeNumber(data?.coinsTotal);
      const nextXpTotal = normalizeOptionalWholeNumber(data?.xpTotal);
      if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
        onStudentCoinsChange(nextCoinsTotal);
      }
      if (typeof onStudentXpChange === 'function' && nextXpTotal !== null) {
        onStudentXpChange(nextXpTotal);
      }
      if (data?.altar && typeof data.altar === 'object') {
        setAltar(data.altar);
      }
      if (
        (Number(data?.xpGained) || 0) > 0
        || (Number(data?.coinsGained) || 0) > 0
        || !data?.altar
        || typeof data.altar !== 'object'
      ) {
        void loadLeaderboard({ silent: true });
      }
      return data;
    } catch (err) {
      if (!mountedRef.current) return;
      setSpinError(err?.message || 'Не удалось прокрутить алтарь.');
      throw err;
    } finally {
      if (mountedRef.current) {
        setSpinLoading(false);
      }
    }
  }, [loadLeaderboard, onStudentCoinsChange, onStudentXpChange, role, spinLoading]);

  const handleUpgradeArtifact = useCallback(async (artifactId) => {
    if (role !== 'student') return null;
    const data = await api.upgradeArtifact(artifactId);
    if (!mountedRef.current) return data;
    const nextCoinsTotal = normalizeOptionalWholeNumber(data?.coinsTotal);
    if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
      onStudentCoinsChange(nextCoinsTotal);
    }
    if (data?.altar && typeof data.altar === 'object') {
      setAltar(data.altar);
    } else {
      void loadLeaderboard({ silent: true });
    }
    return data;
  }, [loadLeaderboard, onStudentCoinsChange, role]);

  const applyMockTimerChestPanel = useCallback((panel) => {
    if (!panel || typeof panel !== 'object') return;
    setLeaderboard((prev) => ({
      ...prev,
      currentStudent: prev.currentStudent
        ? {
            ...prev.currentStudent,
            mockTimerChests: panel,
          }
        : prev.currentStudent,
    }));
    setChestTimerNow(Date.now());
  }, []);

  const triggerChestPressFeedback = useCallback((chestId) => {
    const normalizedChestId = String(chestId || '').trim();
    if (!normalizedChestId || typeof window === 'undefined') return;
    if (chestPressTimerRef.current) {
      window.clearTimeout(chestPressTimerRef.current);
      chestPressTimerRef.current = null;
    }
    setChestPressFeedback({ id: '', nonce: 0 });
    window.requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      setChestPressFeedback({ id: normalizedChestId, nonce: Date.now() });
      chestPressTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current) setChestPressFeedback({ id: '', nonce: 0 });
        chestPressTimerRef.current = null;
      }, 420);
    });
  }, []);

  const showChestNotice = useCallback((notice) => {
    setChestNotice({
      title: 'Сундук пока ждёт',
      message: 'Сейчас уже открывается другой сундук. Дождись таймера, потом можно будет поставить следующий.',
      chestId: '',
      ...notice,
    });
  }, []);

  const handleCloseChestNotice = useCallback(() => {
    setChestNotice(null);
  }, []);

  const handleStartChestOpening = useCallback(async (chestId) => {
    if (role !== 'student' || !chestId) return;
    const actionId = `start:${chestId}`;
    setChestActionId(actionId);
    setChestError('');
    setChestNotice(null);
    try {
      const data = await api.startMockTimerChestOpening(chestId);
      if (!mountedRef.current) return;
      if (data?.mockTimerChests) applyMockTimerChestPanel(data.mockTimerChests);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err?.message || 'Не удалось поставить сундук на открытие.';
      setChestError(message);
      showChestNotice({
        title: 'Этот сундук пока нельзя открыть',
        message,
      });
    } finally {
      if (mountedRef.current) {
        setChestActionId((current) => (current === actionId ? '' : current));
      }
    }
  }, [applyMockTimerChestPanel, role, showChestNotice]);

  const handleClaimChest = useCallback(async (chestId, options = {}) => {
    if (role !== 'student' || !chestId) return;
    const actionId = `claim:${chestId}`;
    const openNow = Boolean(options?.openNow);
    setChestActionId(actionId);
    setChestError('');
    setChestNotice(null);
    try {
      if (!openNow) {
        await new Promise((resolve) => window.setTimeout(resolve, 520));
        if (!mountedRef.current) return;
      }
      const data = await api.prepareMockTimerChestOpening(chestId, { openNow });
      if (!mountedRef.current) return;
      if (data?.mockTimerChests) applyMockTimerChestPanel(data.mockTimerChests);
      const rewards = Array.isArray(data?.mockChestRewards)
        ? data.mockChestRewards.filter((reward) => reward && typeof reward === 'object')
        : (data?.mockChestReward && typeof data.mockChestReward === 'object' ? [data.mockChestReward] : []);
      if (rewards.length > 0) {
        setChestOpeningRewards(rewards);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err?.message || 'Не удалось открыть сундук.';
      setChestError(message);
      showChestNotice({
        title: 'Не получилось открыть сундук',
        message,
      });
    } finally {
      if (mountedRef.current) {
        setChestActionId((current) => (current === actionId ? '' : current));
      }
    }
  }, [applyMockTimerChestPanel, role, showChestNotice]);

  const finalizePreparedChestRewards = useCallback(async (rewards) => {
    if (role !== 'student') return;
    const rewardIds = Array.from(new Set(
      (Array.isArray(rewards) ? rewards : [])
        .map((reward) => String(reward?.id || '').trim())
        .filter(Boolean)
    ));
    if (rewardIds.length <= 0) return;

    const actionId = rewardIds.length === 1 ? `claim:${rewardIds[0]}` : 'claim:prepared';
    setChestActionId(actionId);
    setChestError('');
    try {
      for (const rewardId of rewardIds) {
        const data = await api.claimMockTimerChest(rewardId);
        if (!mountedRef.current) return;
        const nextCoinsTotal = normalizeOptionalWholeNumber(data?.coinsTotal);
        const nextXpTotal = normalizeOptionalWholeNumber(data?.xpTotal);
        if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
          onStudentCoinsChange(nextCoinsTotal);
        }
        if (typeof onStudentXpChange === 'function' && nextXpTotal !== null) {
          onStudentXpChange(nextXpTotal);
        }
        if (data?.altar && typeof data.altar === 'object') {
          setAltar(data.altar);
        }
        if (data?.mockTimerChests) applyMockTimerChestPanel(data.mockTimerChests);
      }
      void loadLeaderboard({ silent: true });
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err?.message || 'Не удалось забрать награду сундука.';
      setChestError(message);
      showChestNotice({
        title: 'Награда не зафиксировалась',
        message,
      });
      void loadLeaderboard({ silent: true });
    } finally {
      if (mountedRef.current) {
        setChestActionId((current) => (current === actionId ? '' : current));
      }
    }
  }, [
    applyMockTimerChestPanel,
    loadLeaderboard,
    onStudentCoinsChange,
    onStudentXpChange,
    role,
    showChestNotice,
  ]);

  const handleChestOverlayClose = useCallback(() => {
    const rewards = chestOpeningRewards;
    setChestOpeningRewards([]);
    void finalizePreparedChestRewards(rewards);
  }, [chestOpeningRewards, finalizePreparedChestRewards]);

  const handleTeacherStudentSelect = useCallback((studentId) => {
    if (role !== 'teacher') return;
    const normalized = String(studentId || '').trim();
    if (!normalized) return;
    if (typeof onSelectStudent === 'function') onSelectStudent(normalized);
  }, [onSelectStudent, role]);

  const loadStudentProfile = useCallback(async (studentId, row = null) => {
    const normalizedStudentId = String(studentId || '').trim();
    if (!normalizedStudentId) return;
    const requestId = studentProfileRequestIdRef.current + 1;
    studentProfileRequestIdRef.current = requestId;
    setStudentProfileState((prev) => ({
      open: true,
      studentId: normalizedStudentId,
      row: row || prev.row,
      data: prev.studentId === normalizedStudentId ? prev.data : null,
      loading: true,
      error: '',
    }));
    try {
      const data = await api.getLeaderboardStudentProfile(normalizedStudentId);
      if (!mountedRef.current || studentProfileRequestIdRef.current !== requestId) return;
      setStudentProfileState((prev) => (
        prev.studentId === normalizedStudentId
          ? {
              ...prev,
              open: true,
              row: row || prev.row,
              data: data && typeof data === 'object' ? data : null,
              loading: false,
              error: '',
            }
          : prev
      ));
    } catch (err) {
      if (!mountedRef.current || studentProfileRequestIdRef.current !== requestId) return;
      setStudentProfileState((prev) => (
        prev.studentId === normalizedStudentId
          ? {
              ...prev,
              open: true,
              row: row || prev.row,
              loading: false,
              error: err?.message || 'Не удалось загрузить профиль ученика.',
            }
          : prev
      ));
    }
  }, []);

  const handleOpenStudentProfile = useCallback((row) => {
    if (role !== 'student') return;
    const normalizedStudentId = String(row?.studentId || '').trim();
    if (!normalizedStudentId) return;
    void loadStudentProfile(normalizedStudentId, row);
  }, [loadStudentProfile, role]);

  const handleCloseStudentProfile = useCallback(() => {
    studentProfileRequestIdRef.current += 1;
    setStudentProfileState((prev) => ({
      ...prev,
      open: false,
      loading: false,
      error: '',
    }));
  }, []);

  const handleRetryStudentProfile = useCallback(() => {
    const normalizedStudentId = String(studentProfileState.studentId || '').trim();
    if (!normalizedStudentId) return;
    void loadStudentProfile(normalizedStudentId, studentProfileState.row);
  }, [loadStudentProfile, studentProfileState.row, studentProfileState.studentId]);

  const renderTeacherStudentPicker = () => {
    if (role !== 'teacher') return null;
    return (
      <div className="inline-flex w-full items-center gap-2 rounded-2xl border border-purple-200/80 bg-white/90 px-3 py-2 shadow-sm shadow-purple-100/40 sm:w-auto">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-purple-500">Ученик</span>
        <StudentSearchSelect
          students={teacherStudentOptions}
          value={teacherSelectedStudentId}
          onChange={handleTeacherStudentSelect}
          disabled={studentsLoading || teacherStudentOptions.length === 0}
          className="w-full min-w-0 rounded-xl border border-purple-100 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-purple-500 disabled:opacity-70 sm:min-w-[180px]"
        />
      </div>
    );
  };

  const renderMockTimerChestPanel = () => {
    if (role !== 'student') return null;
    const slotCount = Math.max(
      MOCK_TIMER_CHEST_DEFAULT_SLOT_COUNT,
      Math.floor(Number(currentChestPanel?.slotCount) || MOCK_TIMER_CHEST_DEFAULT_SLOT_COUNT)
    );
    const chests = Array.isArray(currentChestPanel?.chests)
      ? currentChestPanel.chests
      : [];
    const openDurationLabel = formatChestDuration(currentChestPanel?.openDurationMs || MOCK_TIMER_CHEST_DEFAULT_OPEN_MS);
    const openDurationCountdown = formatChestCountdown(currentChestPanel?.openDurationMs || MOCK_TIMER_CHEST_DEFAULT_OPEN_MS);
    const hasOpeningChest = chests.some((chest) => getClientChestState(chest, chestTimerNow) === 'opening');
    const openingChest = chests.find((chest) => getClientChestState(chest, chestTimerNow) === 'opening') || null;
    const openingReadyAtMs = Date.parse(openingChest?.openReadyAt || '');
    const openingRemainingMs = Number.isFinite(openingReadyAtMs)
      ? Math.max(0, openingReadyAtMs - chestTimerNow)
      : 0;
    const visibleChests = chests.slice(0, slotCount);
    const slots = Array.from({ length: slotCount }, (_, index) => visibleChests[index] || null);
    const overflowCount = Math.max(
      Number(currentChestPanel?.overflowCount) || 0,
      Math.max(0, chests.length - slotCount)
    );
    const isChestVaultEmpty = chests.length <= 0;
    return (
      <div
        className={`mock-timer-chest-panel mt-3 ${isChestVaultEmpty ? 'mock-timer-chest-panel--empty' : ''}`}
        data-tour="rating-timer-chests"
      >
        <div className="mock-timer-chest-panel__top">
          <div>
            <div className="mock-timer-chest-panel__eyebrow">
              <LockKeyhole size={13} />
              Сундуки таймера
            </div>
            <div className="mock-timer-chest-panel__title">
              {chests.length > 0
                ? `${formatChestCountLabel(chests.length)} в хранилище`
                : 'Хранилище пустое'}
            </div>
          </div>
          <div className="mock-timer-chest-panel__duration">
            <Clock3 size={14} />
            {openDurationLabel}
          </div>
        </div>

        {isChestVaultEmpty ? (
          <div className="mock-timer-chest-panel__empty-state">
            <div className="mock-timer-chest-panel__empty-copy">
              <div className="mock-timer-chest-panel__empty-icon">
                <Package2 size={20} />
              </div>
              <div>
                <div className="mock-timer-chest-panel__empty-title">Слоты свободны</div>
                <div className="mock-timer-chest-panel__empty-text">Сундуки появятся здесь после таймерных пробников.</div>
              </div>
            </div>
            <div className="mock-timer-chest-panel__empty-slots" aria-hidden="true">
              {Array.from({ length: slotCount }).map((_, index) => (
                <span key={`empty-chest-preview-${index}`} />
              ))}
            </div>
          </div>
        ) : (
          <div className="mock-timer-chest-panel__slots">
            {slots.map((chest, index) => {
              if (!chest) {
                return (
                  <div key={`empty-chest-slot-${index}`} className="mock-timer-chest-slot mock-timer-chest-slot--empty">
                    <div className="mock-timer-chest-slot__status">Пусто</div>
                    <div className="mock-timer-chest-slot__ghost" />
                    <div className="mock-timer-chest-slot__action">Слот</div>
                  </div>
                );
              }
              const chestId = String(chest.id || '');
              const state = getClientChestState(chest, chestTimerNow);
              const readyAtMs = Date.parse(chest.openReadyAt || '');
              const remainingMs = Number.isFinite(readyAtMs) ? Math.max(0, readyAtMs - chestTimerNow) : 0;
              const isReady = state === 'ready';
              const isOpening = state === 'opening';
              const isClosed = state === 'closed';
              const actionId = isReady ? `claim:${chestId}` : `start:${chestId}`;
              const isBusy = chestActionId === actionId;
              const isStarting = chestActionId === `start:${chestId}`;
              const isClaiming = chestActionId === `claim:${chestId}`;
              const isSquishing = chestPressFeedback.id === chestId;
              const canStart = isClosed && !hasOpeningChest;
              const canPress = isReady || canStart;
              const statusLabel = isClaiming
                ? 'Открываем'
                : isStarting
                  ? 'Запуск'
                  : isReady
                    ? 'Готово'
                    : (isOpening ? 'Открывается' : 'Закрыто');
              const timeLabel = isReady
                ? '!'
                : (isOpening ? formatChestCountdown(remainingMs) : (isStarting ? openDurationCountdown : openDurationLabel));
              const actionLabel = isReady
                ? (isBusy ? 'Открываем...' : 'Открыть')
                : (isOpening ? 'Идёт таймер' : (isBusy ? 'Запуск...' : 'Начать'));
              const slotClassName = [
                'mock-timer-chest-slot',
                `mock-timer-chest-slot--${state}`,
                'mock-timer-chest-slot--interactive',
                canPress ? 'mock-timer-chest-slot--clickable' : '',
                isStarting ? 'mock-timer-chest-slot--starting' : '',
                isClaiming ? 'mock-timer-chest-slot--claiming' : '',
                isSquishing ? 'mock-timer-chest-slot--squish' : '',
                isClosed && hasOpeningChest ? 'mock-timer-chest-slot--blocked' : '',
              ].filter(Boolean).join(' ');
              return (
                <button
                  key={chestId || `chest-slot-${index}`}
                  type="button"
                  disabled={isBusy}
                  aria-disabled={!canPress && !isOpening ? 'true' : undefined}
                  onClick={() => {
                    triggerChestPressFeedback(chestId);
                    if (isReady) {
                      void handleClaimChest(chestId);
                      return;
                    }
                    if (isOpening) {
                      showChestNotice({
                        title: 'Этот сундук уже открывается',
                        message: 'Таймер запущен. Когда отсчёт дойдёт до нуля, сундук можно будет открыть.',
                        chestId,
                      });
                      return;
                    }
                    if (canStart) void handleStartChestOpening(chestId);
                    else if (isClosed && hasOpeningChest) {
                      showChestNotice({
                        title: 'Этот сундук пока нельзя открыть',
                        message: `Сейчас уже открывается другой сундук. Осталось ${formatChestCountdown(openingRemainingMs)}.`,
                        chestId: String(openingChest?.id || ''),
                      });
                    }
                  }}
                  className={slotClassName}
                >
                  <span className="mock-timer-chest-slot__aura" aria-hidden="true" />
                  <span className="mock-timer-chest-slot__burst" aria-hidden="true" />
                  <div className="mock-timer-chest-slot__status">
                    <span>{statusLabel}</span>
                    <strong>{timeLabel}</strong>
                  </div>
                  <img
                    src={isReady ? chestOpenImage : chestClosedImage}
                    alt=""
                    draggable="false"
                    className="mock-timer-chest-slot__image"
                  />
                  <div className="mock-timer-chest-slot__action">
                    {isReady && !isClaiming && <CheckCircle2 size={13} />}
                    {(isOpening || isStarting || isClaiming) && <Clock3 size={13} />}
                    <span>{actionLabel}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {(overflowCount > 0 || chestError) && (
          <div className="mock-timer-chest-panel__footer">
            {overflowCount > 0 && <span>{`Ещё ${overflowCount} в очереди`}</span>}
            {chestError && <strong>{chestError}</strong>}
          </div>
        )}
      </div>
    );
  };

  const renderChestNoticeModal = () => {
    if (!chestNotice) return null;
    const relatedChestId = String(chestNotice.chestId || '').trim();
    const relatedChest = relatedChestId
      ? currentChestList.find((chest) => String(chest?.id || '') === relatedChestId)
      : null;
    const readyAtMs = Date.parse(relatedChest?.openReadyAt || '');
    const remainingMs = Number.isFinite(readyAtMs)
      ? Math.max(0, readyAtMs - chestTimerNow)
      : null;
    const canTestOpenNow = Boolean(relatedChestId)
      && relatedChest
      && getClientChestState(relatedChest, chestTimerNow) === 'opening';
    const isTestOpeningNow = Boolean(relatedChestId) && chestActionId === `claim:${relatedChestId}`;
    const modal = (
      <div className="mock-timer-chest-modal" role="presentation" onMouseDown={handleCloseChestNotice}>
        <div
          className="mock-timer-chest-modal__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mock-timer-chest-modal-title"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mock-timer-chest-modal__glow" aria-hidden="true" />
          <div className="mock-timer-chest-modal__icon" aria-hidden="true">
            <img src={chestClosedImage} alt="" draggable="false" />
          </div>
          <div id="mock-timer-chest-modal-title" className="mock-timer-chest-modal__title">
            {chestNotice.title || 'Сундук пока ждёт'}
          </div>
          <div className="mock-timer-chest-modal__message">
            {chestNotice.message || 'Дождись открытия текущего сундука.'}
          </div>
          {remainingMs !== null && (
            <div className="mock-timer-chest-modal__timer">
              <Clock3 size={15} />
              <span>{formatChestCountdown(remainingMs)}</span>
            </div>
          )}
          <div className="mock-timer-chest-modal__actions">
            {canTestOpenNow && (
              <button
                type="button"
                className="mock-timer-chest-modal__button mock-timer-chest-modal__button--test"
                disabled={isTestOpeningNow}
                onClick={() => {
                  void handleClaimChest(relatedChestId, { openNow: true });
                }}
              >
                {isTestOpeningNow ? 'Открываем...' : 'Открыть сейчас'}
              </button>
            )}
            <button
              type="button"
              className="mock-timer-chest-modal__button"
              onClick={handleCloseChestNotice}
            >
              Понял
            </button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' && document.body
      ? createPortal(modal, document.body)
      : modal;
  };

  const renderTeacherArtifactBonuses = () => {
    if (role !== 'teacher') return null;
    const hasSelectedStudent = Boolean(teacherSelectedStudentId);
    const hasArtifacts = teacherArtifactTotalOwned > 0;
    const selectedStudentUnavailable = hasSelectedStudent
      && !hasLoadedSelectedTeacher
      && !selectedTeacherRow
      && !refreshing;
    const selectedLabel = selectedTeacherName || 'ученик';
    return (
      <div className="teacher-rating-artifact-bonuses rounded-3xl border border-violet-200/80 bg-white/90 p-4 text-sm text-slate-700 shadow-soft" data-tour="rating-artifact-bonuses">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="teacher-rating-artifact-bonuses__eyebrow flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-600">
              <Sparkles size={14} />
              Бонусы артефактов
            </div>
            <div className="teacher-rating-artifact-bonuses__name mt-1 text-base font-semibold text-slate-900">
              {hasSelectedStudent ? selectedLabel : 'Выберите ученика'}
            </div>
            <div className="teacher-rating-artifact-bonuses__subtitle mt-1 text-xs text-slate-500">
              {hasSelectedStudent
                ? (selectedTeacherSubtitle || 'Сводка по выбранному ученику')
                : 'После выбора здесь появятся все активные бонусы его артефактов.'}
            </div>
          </div>
          {hasSelectedStudent && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="teacher-rating-artifact-bonuses__stat inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                <Package2 size={14} />
                {`${teacherArtifactUniqueOwned} уник.`}
              </div>
              <div className="teacher-rating-artifact-bonuses__stat inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {`${teacherArtifactTotalOwned} всего`}
              </div>
              <div className="teacher-rating-artifact-bonuses__stat inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {`${teacherArtifactTotalPulls} круток`}
              </div>
            </div>
          )}
        </div>

        {!hasSelectedStudent ? (
          <div className="teacher-rating-artifact-bonuses__state mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-5 text-center text-sm text-violet-700">
            Выберите ученика вверху страницы или нажмите на строку в рейтинге.
          </div>
        ) : !hasLoadedSelectedTeacher ? (
          <div className="teacher-rating-artifact-bonuses__state mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-5 text-center text-sm text-violet-700">
            {selectedStudentUnavailable
              ? 'Выбранный ученик недоступен. Выберите другого ученика из списка.'
              : 'Загружаем бонусы выбранного ученика...'}
          </div>
        ) : teacherBonusEntries.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teacherBonusEntries.map((entry) => (
              <div
                key={String(entry.id || `${entry.label}-${entry.value}`)}
                className={`teacher-rating-artifact-bonuses__card rounded-2xl border px-3 py-2 shadow-sm ${BONUS_TONE_CLASSNAME[entry.tone] || 'border-slate-200 bg-slate-50/90 text-slate-700'}`}
                data-tone={String(entry.tone || 'default')}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0 truncate text-xs font-semibold">{entry.label || 'Бонус'}</div>
                  <div className="shrink-0 whitespace-nowrap text-base font-black">{entry.value || 'Активен'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="teacher-rating-artifact-bonuses__state mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center text-sm text-slate-500">
            {hasArtifacts
              ? 'У ученика есть артефакты, но активных бонусов от них пока нет.'
              : 'У ученика пока нет выбитых артефактов.'}
          </div>
        )}
      </div>
    );
  };

  const renderBoard = (items, type) => (
    <div
      className="rounded-3xl border border-purple-200/70 bg-white/90 p-4 shadow-soft"
      data-tour={type === 'level' ? 'rating-level-board' : 'rating-week-board'}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">
            {type === 'level' ? 'Рейтинг по уровню' : 'Рейтинг по XP за неделю'}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {type === 'level'
              ? 'Сортировка: уровень, общий XP'
              : `Период: ${weekRangeLabel}`}
          </div>
        </div>
        <div className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700">
          {`${items.length} учен.`}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((row, index) => {
          const topPlaceDecor = TOP_PLACE_NUMBER_DECOR[index];
          const leagueAuraStyle = getLeagueAuraStyle(row.league.id);
          const isAbsoluteLeague = isAbsoluteOrAboveLeague(row.league.id);
          const canSelectRow = role === 'teacher' && typeof onSelectStudent === 'function';
          const canOpenProfile = role === 'student';
          const isInteractiveRow = canSelectRow || canOpenProfile;
          const isProfileActive = canOpenProfile
            && studentProfileState.open
            && String(studentProfileState.studentId || '') === row.studentId;
          const rowStateClass = row.isSelected
            ? 'border-amber-300 bg-amber-50/80 ring-1 ring-amber-200'
            : isProfileActive
              ? 'border-sky-300 bg-sky-50/80 ring-1 ring-sky-200'
            : row.isCurrent
              ? 'border-purple-300 bg-purple-50/80'
              : 'border-purple-100 bg-white';
          const interactiveClassName = canSelectRow
            ? 'cursor-pointer hover:border-amber-300 hover:bg-amber-50/70 focus:outline-none focus:ring-2 focus:ring-amber-200'
            : canOpenProfile
              ? 'cursor-pointer hover:border-sky-300 hover:bg-sky-50/70 focus:outline-none focus:ring-2 focus:ring-sky-200'
              : '';
          const handleRowActivate = () => {
            if (canSelectRow) {
              handleTeacherStudentSelect(row.studentId);
              return;
            }
            if (canOpenProfile) {
              handleOpenStudentProfile(row);
            }
          };
          return (
            <div
              key={`${type}-${row.studentId}`}
              role={isInteractiveRow ? 'button' : undefined}
              tabIndex={isInteractiveRow ? 0 : undefined}
              aria-pressed={canSelectRow ? row.isSelected : undefined}
              aria-haspopup={canOpenProfile ? 'dialog' : undefined}
              aria-expanded={canOpenProfile ? isProfileActive : undefined}
              onClick={isInteractiveRow ? handleRowActivate : undefined}
              onKeyDown={isInteractiveRow ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleRowActivate();
                }
              } : undefined}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition ${rowStateClass} ${
                interactiveClassName
              }`}
            >
            <div
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                row.league.id === 'blank'
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-purple-200 bg-white'
              }`}
              title={row.league.label}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute z-0 rounded-full ${
                  isAbsoluteLeague ? 'inset-[-10px] blur-[9px]' : 'inset-[-9px] blur-[8px]'
                }`}
                style={leagueAuraStyle}
              />
              {isAbsoluteLeague && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-12px] z-0 rounded-full blur-[10px]"
                  style={ABSOLUTE_AURA_CROWN_STYLE}
                />
              )}
              {row.league.icon ? (
                <img
                  src={row.league.icon}
                  alt={row.league.label}
                  className={`relative z-[1] aspect-square object-contain ${getLeagueIconClassName(row.league.id)}`}
                  loading="lazy"
                />
              ) : (
                <span className="relative z-[1] h-5 w-5 rounded-full bg-slate-200" />
              )}
              {index < 3 ? (
                <span
                  className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none font-black leading-none ${topPlaceDecor?.textClass || 'text-lg'}`}
                  style={getTopPlaceNumberStyle(topPlaceDecor)}
                >
                  {index + 1}
                </span>
              ) : (
                <span
                  className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center select-none text-xs font-extrabold leading-none text-slate-500/70"
                  style={{
                    textShadow: '0 1px 1px rgba(255,255,255,0.7)',
                  }}
                >
                  {index + 1}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-900">{row.displayName}</div>
              {row.showTeacherIdentity && (
                <div className="truncate text-[11px] text-slate-500">{`Имя: ${row.mainName || '—'} • Имя2: ${row.nickname || '—'}`}</div>
              )}
              <div className="text-[11px] text-slate-500">{`${row.league.label} - Уровень ${row.level} - ${row.xpTotalLabel} XP`}</div>
            </div>
            <div className="text-right">
              {type === 'level' ? (
                <>
                  <div className="text-sm font-bold text-slate-900">{`Ур. ${row.level}`}</div>
                  <div className="text-[11px] font-semibold text-purple-600">{`${row.xpTotalLabel} XP`}</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-bold text-slate-900">{`${row.weeklyXpLabel} XP`}</div>
                  <div className="text-[11px] font-semibold text-purple-600">за 7 дней</div>
                </>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft" data-tour="rating-overview">
        Загрузка рейтинга...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-6 text-sm text-rose-700 shadow-soft" data-tour="rating-overview">
        <div>{error}</div>
        <button
          type="button"
          onClick={() => loadLeaderboard()}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          <RefreshCcw size={14} />
          Повторить
        </button>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft" data-tour="rating-overview">
        Учеников для рейтинга пока нет.
      </section>
    );
  }

  return (
    <section className="space-y-4" data-tour="rating-section">
      <div className="surface-panel rounded-3xl border border-purple-200/70 px-4 py-4 text-sm text-gray-700 shadow-soft" data-tour="rating-overview">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-purple-600">Рейтинг учеников</div>
            <div className="mt-1 text-base font-semibold text-gray-900">
              {role === 'student'
                ? `Твоя позиция в рейтинге: ${currentRatingPosition || '—'}`
                : 'Общий рейтинг по группе'}
            </div>
            <div className="mt-2 inline-flex items-center rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700">
              {`Период XP: ${weekRangeLabel}`}
            </div>
            {role === 'student' && (
              <div className="mt-2 text-xs text-slate-500">
                Нажмите на ученика в рейтинге, чтобы открыть его полный профиль.
              </div>
            )}
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {renderTeacherStudentPicker()}
            <button
              type="button"
              onClick={() => loadLeaderboard({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
            >
              <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Обновляем...' : 'Обновить'}
            </button>
          </div>
        </div>
        {role === 'student' && (
          <div className="mt-3 space-y-2">
            <div className="rounded-2xl border border-purple-200 bg-white px-3 py-2.5" data-tour="rating-league">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Ваша лига</div>
                <button
                  type="button"
                  onClick={() => setIsLeagueRangesOpen((prev) => !prev)}
                  data-tour="rating-league-ranges"
                  className="inline-flex items-center rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
                  aria-expanded={isLeagueRangesOpen}
                >
                  {isLeagueRangesOpen ? 'Скрыть лиги' : 'Все лиги'}
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                    currentLeague.id === 'blank'
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-purple-200 bg-white'
                  }`}
                  title={currentLeague.label}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute z-0 rounded-full ${
                      isCurrentLeagueAbsolute ? 'inset-[-10px] blur-[9px]' : 'inset-[-8px] blur-[7px]'
                    }`}
                    style={currentLeagueAuraStyle}
                  />
                  {isCurrentLeagueAbsolute && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-[-12px] z-0 rounded-full blur-[10px]"
                      style={ABSOLUTE_AURA_CROWN_STYLE}
                    />
                  )}
                  {currentLeague.icon ? (
                    <img
                      src={currentLeague.icon}
                      alt={currentLeague.label}
                      className={`relative z-[1] aspect-square object-contain ${getLeagueIconClassName(currentLeague.id, 'md')}`}
                      loading="lazy"
                    />
                  ) : (
                    <span className="relative z-[1] h-5 w-5 rounded-full bg-slate-200" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-slate-900">{currentLeague.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {`${currentStudentRow?.xpTotalLabel || '0'} XP${currentStudentRow ? ` - Уровень ${currentStudentRow.level}` : ''}`}
                  </div>
                </div>
              </div>
            </div>

            {renderMockTimerChestPanel()}

            {isLeagueRangesOpen && (
              <div className="rounded-2xl border border-purple-200 bg-white px-3 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Лиги и диапазоны XP</div>
                <div className="mt-1 text-[11px] text-slate-500">Сколько опыта нужно для каждой лиги</div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {leagueRangeRows.map((leagueItem) => {
                    const isCurrentLeagueItem = leagueItem.id === currentLeague.id;
                    const leagueItemAuraStyle = getLeagueAuraStyle(leagueItem.id);
                    const isAbsoluteLeagueItem = isAbsoluteOrAboveLeague(leagueItem.id);
                    return (
                      <div
                        key={`league-range-${leagueItem.id}`}
                        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                          isCurrentLeagueItem
                            ? 'border-purple-300 bg-purple-50/80'
                            : 'border-purple-100 bg-white'
                        }`}
                      >
                        <div
                          className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-visible rounded-full border ${
                            leagueItem.id === 'blank'
                              ? 'border-slate-200 bg-slate-50'
                              : 'border-purple-200 bg-white'
                          }`}
                          title={leagueItem.label}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute z-0 rounded-full ${
                              isAbsoluteLeagueItem ? 'inset-[-9px] blur-[8px]' : 'inset-[-7px] blur-[6px]'
                            }`}
                            style={leagueItemAuraStyle}
                          />
                          {isAbsoluteLeagueItem && (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-[-10px] z-0 rounded-full blur-[8px]"
                              style={ABSOLUTE_AURA_CROWN_STYLE}
                            />
                          )}
                          {leagueItem.icon ? (
                            <img
                              src={leagueItem.icon}
                              alt={leagueItem.label}
                              className={`relative z-[1] aspect-square object-contain ${getLeagueIconClassName(leagueItem.id, 'sm')}`}
                              loading="lazy"
                            />
                          ) : (
                            <span className="relative z-[1] h-4 w-4 rounded-full bg-slate-200" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className={`truncate text-xs font-bold ${isCurrentLeagueItem ? 'text-purple-700' : 'text-slate-900'}`}>
                            {leagueItem.label}
                          </div>
                          <div className="text-[11px] text-slate-500">{leagueItem.rangeLabel}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {renderTeacherArtifactBonuses()}

      {needsAliasPrompt && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-soft" data-tour="rating-name">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Имя в рейтинге</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            Сейчас вы отображаетесь как «{currentStudentMeta?.publicName || 'Аноним'}».
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Вы можете выбрать, как показываться в рейтинге: под основным именем или под псевдонимом.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleUseMainName}
              disabled={aliasSaving || !currentStudentMainName}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              {aliasSaving
                ? 'Сохраняем...'
                : (
                  <>
                    <span>Использовать имя</span>
                    {hasAliasRewardAvailable && <LeaderboardAliasRewardChip />}
                  </>
                )}
            </button>
            <button
              type="button"
              onClick={() => {
                setAliasMode('custom');
                setAliasInput('');
                setAliasError('');
                setAliasSuccess('');
              }}
              disabled={aliasSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              <span>Создать никнейм</span>
              {hasAliasRewardAvailable && <LeaderboardAliasRewardChip />}
            </button>
          </div>
          {aliasMode === 'custom' && (
            <>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={aliasInput}
                  onChange={(e) => {
                    const nextValue = String(e.target.value || '')
                      .replace(/[^А-Яа-яЁё]/g, '')
                      .slice(0, 6);
                    setAliasInput(nextValue);
                    setAliasError('');
                    setAliasSuccess('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveAlias();
                    }
                  }}
                  placeholder="Например: Вектор"
                  maxLength={6}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleSaveAlias}
                  disabled={aliasSaving}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                >
                  {aliasSaving ? 'Сохраняем...' : 'Сохранить псевдоним'}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Только русские буквы, 2-6 символов.</div>
            </>
          )}
          {aliasError && <div className="mt-2 text-xs text-rose-600">{aliasError}</div>}
          {aliasSuccess && <div className="mt-2 text-xs text-emerald-700">{aliasSuccess}</div>}
        </div>
      )}

      {role === 'student' && (
        <StudentArtifactAltar
          altar={altar}
          coinsTotal={studentCoinsTotal}
          onSpin={handleSpinArtifact}
          onUpgrade={handleUpgradeArtifact}
          spinning={spinLoading}
          spinError={spinError}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {renderBoard(byLevel, 'level')}
        {renderBoard(byWeeklyXp, 'week')}
      </div>

      {chestOpeningRewards.length > 0 && (
        <MockChestOpeningOverlay
          rewards={chestOpeningRewards}
          onClose={handleChestOverlayClose}
        />
      )}

      {renderChestNoticeModal()}

      <StudentLeaderboardProfileModal
        open={role === 'student' && studentProfileState.open}
        row={activeProfileRow}
        profile={studentProfileState.data}
        loading={studentProfileState.loading}
        error={studentProfileState.error}
        levelPosition={activeProfileLevelPosition}
        weeklyPosition={activeProfileWeeklyPosition}
        onClose={handleCloseStudentProfile}
        onRetry={handleRetryStudentProfile}
        getLeagueByXp={getLeagueByXp}
        getLeagueAuraStyle={getLeagueAuraStyle}
        isAbsoluteOrAboveLeague={isAbsoluteOrAboveLeague}
        ABSOLUTE_AURA_CROWN_STYLE={ABSOLUTE_AURA_CROWN_STYLE}
        getLevelFromXp={getLevelFromXp}
        getLevelProgressFromXp={getLevelProgressFromXp}
        formatStreakDate={formatStreakDate}
        getLeagueIconClassName={getLeagueIconClassName}
      />
    </section>
  );
};



export default StudentLeaderboardSection;

