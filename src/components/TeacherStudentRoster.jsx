import React, { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { api } from '../services/api';
import { normalizeLearningGroupList } from '../utils/learningGroups';
import { studentRosterGroups } from '../utils/studentRosterGroups';
import './TeacherStudentRoster.css';

const pupilCount = count => {
  const last = count % 10;
  const hundred = count % 100;
  return `${count} ${hundred >= 11 && hundred <= 14 ? 'учеников' : last === 1 ? 'ученик' : last >= 2 && last <= 4 ? 'ученика' : 'учеников'}`;
};

export default function TeacherStudentRoster({ students, teacherId, activeStudentId, renderStudent }) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState({});
  const panelId = useId();
  useEffect(() => {
    let disposed = false;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const payload = await api.getLearningGroups({ teacherId });
        if (!disposed) setResult({ teacherId, groups: normalizeLearningGroupList(payload) });
      } catch {
        if (!disposed) setResult(previous => ({ teacherId, groups: previous?.teacherId === teacherId ? previous.groups : [], error: true }));
      } finally { pending = false; }
    };
    const refresh = () => { if (document.visibilityState !== 'hidden') void load(); };
    void load();
    window.addEventListener('learning-groups-changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      disposed = true;
      window.removeEventListener('learning-groups-changed', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [teacherId, revision]);
  const current = result?.teacherId === teacherId ? result : null;
  const { entries, memberships } = useMemo(() => studentRosterGroups(students, current?.groups || []), [students, current?.groups]);
  return <div className="teacher-student-roster">
    {!current && <p className="teacher-student-roster__notice" role="status">Уточняем состав мини-групп…</p>}
    {current?.error && <p className="teacher-student-roster__notice" role="status">Не удалось обновить состав мини-групп. <button type="button" onClick={() => setRevision(value => value + 1)}>Повторить</button></p>}
    {entries.map(entry => {
      if (entry.student) return <React.Fragment key={`student:${entry.student.id}`}>{renderStudent(entry.student, [])}</React.Fragment>;
      const group = entry.group;
      const selected = group.students.some(student => String(student.id) === String(activeStudentId));
      const open = expanded[group.id] ?? selected;
      const contentId = `${panelId}-${group.id}`;
      return <section key={`group:${group.id}`} className={`teacher-student-group ${selected ? 'teacher-student-group--active' : ''}`} aria-label={`Мини-группа: ${group.name}`}>
        <button type="button" className="teacher-student-group__toggle" aria-expanded={open} aria-controls={contentId}
          onClick={() => setExpanded(previous => ({ ...previous, [group.id]: !open }))}>
          <span className="teacher-student-group__icon"><Users size={22} aria-hidden="true" /></span>
          <span className="teacher-student-group__summary">
            <span className="teacher-student-group__heading"><strong>{group.name}</strong><span className="teacher-student-group__count">{pupilCount(group.students.length)}</span></span>
            <span className="teacher-student-group__members">{group.students.map(student => student.name).join(', ')}</span>
            {group.totalMembers > group.students.length && <span className="teacher-student-group__filtered">Показаны {group.students.length} из {group.totalMembers} участников по выбранному фильтру</span>}
          </span>
          <span className="teacher-student-group__action"><span>{open ? 'Скрыть' : 'Участники'}</span>{open ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</span>
        </button>
        <div id={contentId} className="teacher-student-group__body" hidden={!open}>
          {open && group.students.map(student => <React.Fragment key={student.id}>{renderStudent(student, memberships.get(String(student.id)) || [])}</React.Fragment>)}
        </div>
      </section>;
    })}
  </div>;
}
