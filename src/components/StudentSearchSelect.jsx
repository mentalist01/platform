import React, { useEffect, useMemo, useRef, useState } from 'react';

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

const normalizeStudents = (students) => (
  (Array.isArray(students) ? students : [])
    .map((student) => {
      const id = String(student?.id || student?.studentId || '').trim();
      if (!id) return null;
      const label = getStudentDisplayLabel(student);
      const primaryName = getStudentPrimaryName(student);
      const nickname = getStudentNickname(student);
      const fallbackLabel = String(student?.label || student?.displayName || student?.publicName || '').trim();
      return {
        id,
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
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Выберите ученика',
  className = '',
  menuClassName = '',
  emptyText = 'Ничего не найдено',
  ariaLabel = 'Выберите ученика',
  dark = false,
}) => {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(() => normalizeStudents(students), [students]);
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
    if (!normalizedQuery) {
      return [...options].sort((left, right) => left.label.localeCompare(right.label, 'ru'));
    }

    return options
      .map((student) => ({ student, rank: getMatchRank(student, normalizedQuery) }))
      .filter((entry) => Number.isFinite(entry.rank))
      .sort((left, right) => {
        if (left.rank !== right.rank) return left.rank - right.rank;
        return left.student.label.localeCompare(right.student.label, 'ru');
      })
      .map((entry) => entry.student);
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
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

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
          setIsOpen(true);
          event.currentTarget.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />

      {isOpen && !disabled && (
        <div
          className={`absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border py-1 text-sm shadow-xl ${menuToneClassName} ${menuClassName}`}
          role="listbox"
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((student, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={student.id}
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
                  <span className="block truncate">{student.label}</span>
                </button>
              );
            })
          ) : (
            <div className={`px-3 py-2 ${emptyClassName}`}>{emptyText}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentSearchSelect;
