import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isCurrentStudent } from '../utils/studentStudyStatus';
import { buildLearningGroupTargetValue } from '../utils/lessonTargets';

const normalizeSearchText = (value) => String(value || '').trim().toLowerCase();

const getStudentPrimaryName = (student) => (
  String(student?.name || student?.mainName || student?.studentName || '').trim()
);

const getStudentNickname = (student) => (
  String(student?.nickname || student?.studentNickname || '').trim()
);

const getStudentDisplayLabel = (student) => {
  const nickname = getStudentNickname(student);
  if (nickname) return nickname;
  return (
    String(student?.label || '').trim()
    || getStudentPrimaryName(student)
    || String(student?.displayName || student?.publicName || '').trim()
    || 'Ученик'
  );
};

const normalizeStudents = (students, { includeGraduates = false } = {}) => (
  (Array.isArray(students) ? students : [])
    .filter((student) => includeGraduates || isCurrentStudent(student))
    .map((student) => {
      const id = String(student?.id || student?.studentId || '').trim();
      if (!id) return null;
      const label = getStudentDisplayLabel(student);
      const primaryName = getStudentPrimaryName(student);
      const nickname = getStudentNickname(student);
      const fallbackLabel = String(student?.label || student?.displayName || student?.publicName || '').trim();
      return {
        id,
        kind: 'student',
        label,
        primaryName,
        nickname,
        searchText: [label, nickname, primaryName, fallbackLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      };
    })
    .filter(Boolean)
);

const normalizeGroups = (groups) => (
  (Array.isArray(groups) ? groups : [])
    .map((group) => {
      const groupId = String(group?.id || group?.groupId || '').trim();
      if (!groupId) return null;
      const label = String(group?.name || group?.title || group?.label || 'Мини-группа').trim();
      const secondaryLabel = String(group?.secondaryLabel || group?.metaLabel || '').trim();
      return {
        id: buildLearningGroupTargetValue(groupId),
        groupId,
        kind: 'group',
        label,
        secondaryLabel,
        primaryName: label,
        nickname: '',
        searchText: [label, secondaryLabel].filter(Boolean).join(' ').toLowerCase(),
      };
    })
    .filter(Boolean)
);

const getMatchRank = (student, query) => {
  if (!query) return 0;
  const label = normalizeSearchText(student.label);
  const nickname = normalizeSearchText(student.nickname);
  const primaryName = normalizeSearchText(student.primaryName);
  if (nickname.startsWith(query) || label.startsWith(query)) return 0;
  if (primaryName.startsWith(query)) return 1;
  if (nickname.includes(query) || label.includes(query)) return 2;
  if (primaryName.includes(query)) return 3;
  if (student.searchText.includes(query)) return 4;
  return Number.POSITIVE_INFINITY;
};

const StudentSearchSelect = ({
  id,
  students,
  groups = [],
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Выберите ученика',
  className = '',
  menuClassName = '',
  emptyText = 'Ничего не найдено',
  ariaLabel = 'Выберите ученика',
  dark = false,
  includeGraduates = false,
  onOpen,
}) => {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState(null);

  const studentOptions = useMemo(
    () => normalizeStudents(students, { includeGraduates }),
    [includeGraduates, students]
  );
  const groupOptions = useMemo(() => normalizeGroups(groups), [groups]);
  const options = useMemo(() => [...studentOptions, ...groupOptions], [groupOptions, studentOptions]);
  const selectedId = String(value || '').trim();
  const selectedOption = options.find((student) => student.id === selectedId) || null;
  const normalizedQuery = normalizeSearchText(query);
  const menuToneClassName = dark
    ? 'border-slate-700 bg-slate-950 text-slate-100 shadow-black/30'
    : 'border-slate-200 bg-white text-slate-800 shadow-slate-950/10';
  const activeOptionClassName = dark
    ? 'bg-violet-500/20 text-violet-100'
    : 'bg-violet-100 text-violet-900';
  const idleOptionClassName = dark
    ? 'hover:bg-white/10'
    : 'hover:bg-slate-100';
  const emptyClassName = dark ? 'text-slate-400' : 'text-slate-500';

  const filteredOptions = useMemo(() => {
    const filterAndSort = (items) => {
      if (!normalizedQuery) {
        return [...items].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
      }
      return items
        .map((student) => ({ student, rank: getMatchRank(student, normalizedQuery) }))
        .filter((entry) => Number.isFinite(entry.rank))
        .sort((left, right) => {
          if (left.rank !== right.rank) return left.rank - right.rank;
          return left.student.label.localeCompare(right.student.label, 'ru');
        })
        .map((entry) => entry.student);
    };

    return [
      ...filterAndSort(options.filter((option) => option.kind === 'student')),
      ...filterAndSort(options.filter((option) => option.kind === 'group')),
    ];
  }, [normalizedQuery, options]);

  useEffect(() => {
    if (!isOpen) setQuery(selectedOption?.label || '');
  }, [isOpen, selectedOption?.label]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery, selectedId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      const target = event.target;
      if (
        !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || disabled || typeof window === 'undefined') return undefined;

    const updateMenuPosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const margin = 8;
      const gap = 4;
      const left = Math.max(margin, Math.min(rect.left, viewportWidth - rect.width - margin));
      const availableBelow = Math.max(96, viewportHeight - rect.bottom - margin - gap);

      setMenuStyle({
        left: `${left}px`,
        top: `${rect.bottom + gap}px`,
        width: `${rect.width}px`,
        maxHeight: `${Math.min(256, availableBelow)}px`,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [disabled, isOpen]);

  const commitOption = (option) => {
    if (!option || disabled) return;
    onChange?.(option.id);
    setQuery(option.label);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => (
        filteredOptions.length ? Math.min(current + 1, filteredOptions.length - 1) : 0
      ));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (!isOpen) return;
      event.preventDefault();
      commitOption(filteredOptions[activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setQuery(selectedOption?.label || '');
      setIsOpen(false);
    }
  };

  const openMenu = () => {
    if (disabled) return;
    if (!isOpen) onOpen?.();
    setQuery('');
    setIsOpen(true);
    setActiveIndex(0);
  };

  const menuNode = isOpen && !disabled ? (
    <div
      ref={menuRef}
      className={`fixed z-[10000] overflow-y-auto rounded-xl border py-1 text-sm shadow-xl ${menuToneClassName} ${menuClassName}`}
      style={menuStyle || { visibility: 'hidden' }}
      role="listbox"
    >
      {filteredOptions.length > 0 ? (
        filteredOptions.map((student, index) => {
          const active = index === activeIndex;
          const previousKind = filteredOptions[index - 1]?.kind;
          const showSectionLabel = options.some((option) => option.kind === 'group')
            && previousKind !== student.kind;
          return (
            <React.Fragment key={student.id}>
              {showSectionLabel && (
                <div className={`px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] ${emptyClassName}`}>
                  {student.kind === 'group' ? 'Мини-группы' : 'Ученики'}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={student.id === selectedId}
                className={`block w-full px-3 py-2 text-left transition ${
                  active || student.id === selectedId
                    ? activeOptionClassName
                    : idleOptionClassName
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commitOption(student)}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{student.label}</span>
                  {student.kind === 'group' && (
                    <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">
                      группа
                    </span>
                  )}
                </span>
                {student.secondaryLabel && (
                  <span className={`mt-0.5 block truncate text-[11px] ${emptyClassName}`}>
                    {student.secondaryLabel}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })
      ) : (
        <div className={`px-3 py-2 ${emptyClassName}`}>{emptyText}</div>
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        onFocus={(event) => {
          openMenu();
          event.currentTarget.select();
        }}
        onMouseDown={() => {
          if (!isOpen && document.activeElement === inputRef.current) openMenu();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />

      {menuNode && typeof document !== 'undefined' ? createPortal(menuNode, document.body) : menuNode}
    </div>
  );
};

export default StudentSearchSelect;
