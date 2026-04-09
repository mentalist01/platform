import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { api } from '../services/api';
import StudentArtifactAltar from './StudentArtifactAltar';
const StudentLeaderboardSection = ({
  role,
  userId,
  userName,
  normalizeXpTotal,
  getLeagueByXp,
  XP_PER_LEVEL,
  formatStreakDate,
  BLANK_LEAGUE,
  LEAGUE_TIERS,
  getLeagueAuraStyle,
  isAbsoluteOrAboveLeague,
  ABSOLUTE_AURA_CROWN_STYLE,
  isLeagueAboveAbsolute,
  TOP_PLACE_NUMBER_DECOR,
  getTopPlaceNumberStyle,
  studentCoinsTotal = 0,
  onStudentCoinsChange,
}) => {
  const [leaderboard, setLeaderboard] = useState({ items: [], week: null, currentStudent: null });
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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadLeaderboard = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const data = await api.getStudentsLeaderboard();
      if (!mountedRef.current) return;
      const items = Array.isArray(data?.items) ? data.items : [];
      const week = data?.week && typeof data.week === 'object' ? data.week : null;
      const currentStudent = data?.currentStudent && typeof data.currentStudent === 'object'
        ? data.currentStudent
        : null;
      const nextAltar = data?.altar && typeof data.altar === 'object'
        ? data.altar
        : null;
      setLeaderboard({ items, week, currentStudent });
      setAltar(nextAltar);
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
      setLeaderboard({ items: [], week: null, currentStudent: null });
      setAltar(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [role]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

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
        : (Math.floor(xpTotal / XP_PER_LEVEL) + 1);
      const displayNameRaw = typeof entry?.publicName === 'string' ? entry.publicName.trim() : '';
      const displayName = displayNameRaw || `Аноним ${index + 1}`;
      const hasAlias = Boolean(entry?.hasAlias);
      const mainName = typeof entry?.mainName === 'string' ? entry.mainName.trim() : '';
      const nickname = typeof entry?.nickname === 'string' ? entry.nickname.trim() : '';
      const isCurrent = role === 'student' && (
        Boolean(entry?.isCurrent) || (String(userId || '') === studentId)
      );
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
      };
    });
  }, [leaderboard.items, role, userId]);

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
  const currentStudentMainName = (() => {
    const fromLeaderboard = typeof currentStudentMeta?.mainName === 'string'
      ? currentStudentMeta.mainName.trim()
      : '';
    if (fromLeaderboard) return fromLeaderboard;
    const fromProfile = typeof userName === 'string' ? userName.trim() : '';
    return fromProfile;
  })();
  const needsAliasPrompt = role === 'student' && currentStudentMeta && !currentStudentMeta.hasAlias;

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
      await api.setLeaderboardAlias(normalized);
      if (!mountedRef.current) return;
      setAliasSuccess('Псевдоним сохранён.');
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
      await api.setLeaderboardAlias({ useMainName: true, alias: currentStudentMainName });
      if (!mountedRef.current) return;
      setAliasSuccess('Основное имя добавлено в рейтинг.');
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
      const nextCoinsTotal = Number.isFinite(Number(data?.coinsTotal))
        ? Math.max(0, Math.floor(Number(data.coinsTotal)))
        : null;
      if (typeof onStudentCoinsChange === 'function' && nextCoinsTotal !== null) {
        onStudentCoinsChange(nextCoinsTotal);
      }
      if (data?.altar && typeof data.altar === 'object') {
        setAltar(data.altar);
      } else {
        await loadLeaderboard({ silent: true });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setSpinError(err?.message || 'Не удалось прокрутить алтарь.');
    } finally {
      if (mountedRef.current) {
        setSpinLoading(false);
      }
    }
  }, [loadLeaderboard, onStudentCoinsChange, role, spinLoading]);

  const renderBoard = (items, type) => (
    <div className="rounded-3xl border border-purple-200/70 bg-white/90 p-4 shadow-soft">
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
          return (
            <div
              key={`${type}-${row.studentId}`}
              className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${
                row.isCurrent
                  ? 'border-purple-300 bg-purple-50/80'
                  : 'border-purple-100 bg-white'
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
                  className={`relative z-[1] object-contain ${
                    row.league.id === 'blank'
                      ? 'h-[2.35rem] w-[2.35rem]'
                      : isLeagueAboveAbsolute(row.league.id)
                        ? 'h-14 w-14 scale-[1.56]'
                        : 'h-14 w-14 scale-[1.45]'
                  }`}
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
                <div className="truncate text-[11px] text-slate-500">{`Имя: ${row.mainName || '—'} • Прозвище: ${row.nickname || '—'}`}</div>
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
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft">
        Загрузка рейтинга...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-6 text-sm text-rose-700 shadow-soft">
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
      <section className="rounded-3xl border border-purple-200/70 bg-white/90 p-6 text-sm text-gray-600 shadow-soft">
        Учеников для рейтинга пока нет.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="surface-panel rounded-3xl border border-purple-200/70 px-4 py-4 text-sm text-gray-700 shadow-soft">
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
          </div>
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
        {role === 'student' && (
          <div className="mt-3 space-y-2">
            <div className="rounded-2xl border border-purple-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">Ваша лига</div>
                <button
                  type="button"
                  onClick={() => setIsLeagueRangesOpen((prev) => !prev)}
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
                      className={`relative z-[1] object-contain ${
                        currentLeague.id === 'blank'
                          ? 'h-[2.35rem] w-[2.35rem]'
                          : isLeagueAboveAbsolute(currentLeague.id)
                            ? 'h-14 w-14 scale-[1.56]'
                            : 'h-14 w-14 scale-[1.45]'
                      }`}
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
                              className={`relative z-[1] object-contain ${
                                leagueItem.id === 'blank'
                                  ? 'h-8 w-8'
                                  : isLeagueAboveAbsolute(leagueItem.id)
                                    ? 'h-11 w-11 scale-[1.28]'
                                    : 'h-11 w-11 scale-[1.18]'
                              }`}
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

      {needsAliasPrompt && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/70 p-4 shadow-soft">
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
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              {aliasSaving ? 'Сохраняем...' : `Использовать имя: ${currentStudentMainName || 'моё имя'}`}
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
              className="inline-flex items-center justify-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
            >
              Создать псевдоним
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
          spinning={spinLoading}
          spinError={spinError}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {renderBoard(byLevel, 'level')}
        {renderBoard(byWeeklyXp, 'week')}
      </div>
    </section>
  );
};



export default StudentLeaderboardSection;

