import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { getTeacherNavigationGroup } from '../utils/teacherNavigation';
import './TeacherNavigation.css';

export default function TeacherNavigation({ groups, view, expandedGroup, onExpand, onNavigate, onPrefetch, renderBadge }) {
  const prefix = useId();
  const activeGroup = getTeacherNavigationGroup(view);
  return (
    <div className="teacher-navigation" aria-label="Разделы преподавателя">
      {groups.map(group => {
        const Icon = group.icon;
        const expanded = expandedGroup === group.id;
        const isLesson = group.id === 'lesson';
        const selected = activeGroup === group.id;
        const panelId = `${prefix}-${group.id}`;
        return (
          <div className={`teacher-navigation__group ${selected ? 'is-current' : ''}`} key={group.id}>
            <button
              type="button"
              className={`teacher-navigation__heading ${isLesson ? 'teacher-navigation__heading--lesson' : ''}`}
              aria-expanded={isLesson ? undefined : expanded}
              aria-controls={isLesson ? undefined : panelId}
              aria-current={isLesson && selected ? 'page' : undefined}
              onClick={() => isLesson ? onNavigate('lesson') : onExpand(expanded ? null : group.id)}
              onPointerEnter={() => isLesson && onPrefetch('lesson')}
              onFocus={() => isLesson && onPrefetch('lesson')}
            >
              <span className="teacher-navigation__icon"><Icon size={20} /></span>
              <span className="teacher-navigation__label">{group.label}</span>
              {renderBadge(group.id, 'teacher-group')}
              {!isLesson && <ChevronDown size={16} className={expanded ? 'is-expanded' : ''} />}
            </button>
            {!isLesson && (
              <div id={panelId} className="teacher-navigation__children" hidden={!expanded}>
                {group.children.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={`teacher-navigation__link ${view === item.id ? 'is-active' : ''}`}
                    aria-current={view === item.id ? 'page' : undefined}
                    data-tour={item.id === 'rating' ? 'rating-nav' : undefined}
                    onClick={() => onNavigate(item.id)}
                    onPointerEnter={() => onPrefetch(item.id)}
                    onFocus={() => onPrefetch(item.id)}
                  >
                    <span>{item.label}</span>
                    {renderBadge(item.id, 'teacher-link')}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
