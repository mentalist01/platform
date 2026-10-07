import { useId, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { getTeacherNavigationGroup, searchTeacherNavigation } from '../utils/teacherNavigation';
import './TeacherNavigation.css';

export default function TeacherNavigation({ groups, view, onNavigate, onPrefetch, renderBadge }) {
  const prefix = useId();
  const [query, setQuery] = useState('');
  const activeGroupId = getTeacherNavigationGroup(view);
  const activeGroup = groups.find(group => group.id === activeGroupId);
  const activeRoute = activeGroup?.routes?.find(item => item.id === view) || activeGroup?.children.find(item => item.id === view);
  const searching = Boolean(query.trim());
  const results = searchTeacherNavigation(groups, query);
  const navigate = id => {
    setQuery('');
    onNavigate(id);
  };
  return (
    <div className="teacher-navigation" aria-label="Разделы преподавателя">
      <div className="teacher-navigation__search" role="search" aria-label="Поиск по разделам">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          aria-label="Найти раздел"
          placeholder="Найти раздел"
          value={query}
          autoComplete="off"
          aria-controls={searching ? `${prefix}-results` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setQuery(''); }
            if (event.key === 'Enter' && results.length) { event.preventDefault(); navigate(results[0].id); }
          }}
        />
        {query && <button type="button" aria-label="Очистить поиск разделов" onClick={() => setQuery('')}><X size={16} /></button>}
      </div>
      {activeGroup && (
        <button
          type="button"
          className="teacher-navigation__location"
          title="Показать текущий раздел в меню"
          onClick={() => setQuery('')}
        >
          <span className="teacher-navigation__location-dot" aria-hidden="true" />
          <span>
            <span className="teacher-navigation__location-caption">Сейчас открыто</span>
            <span className="teacher-navigation__location-path">{activeGroup.label}{activeRoute && <><ChevronRight size={12} aria-hidden="true" /><strong>{activeRoute.label}</strong></>}</span>
          </span>
        </button>
      )}
      {searching ? (
        <div id={`${prefix}-results`} className="teacher-navigation__results" aria-label="Результаты поиска разделов">
          <p className="teacher-navigation__result-count" role="status">{results.length ? `Найдено: ${results.length}` : 'Раздел не найден'}</p>
          {results.map(item => {
            const Icon = item.icon;
            return <button
              type="button"
              key={item.id}
              className={`teacher-navigation__result ${view === item.id ? 'is-active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              data-tour={item.id === 'rating' ? 'rating-nav' : undefined}
              onClick={() => navigate(item.id)}
              onPointerEnter={() => onPrefetch(item.id)}
              onFocus={() => onPrefetch(item.id)}
            >
              {Icon && <span className="teacher-navigation__result-icon"><Icon size={18} /></span>}
              <span className="teacher-navigation__result-text"><strong>{item.label}</strong><span>{item.groupLabel}</span></span>
              {renderBadge(item.id, 'teacher-link')}
              <ChevronRight size={15} aria-hidden="true" />
            </button>;
          })}
          {!results.length && <p className="teacher-navigation__empty">Попробуйте «записи», «ученики» или «финансы».</p>}
        </div>
      ) : groups.map(group => {
        const Icon = group.icon;
        const isLesson = group.id === 'lesson';
        const Heading = isLesson ? 'button' : 'div';
        const selected = activeGroupId === group.id;
        const headingId = `${prefix}-${group.id}-heading`;
        return (
          <div className={`teacher-navigation__group ${selected ? 'is-current' : ''}`} key={group.id} role="group" aria-labelledby={headingId}>
            <Heading
              id={headingId}
              type={isLesson ? 'button' : undefined}
              className={`teacher-navigation__heading ${isLesson ? 'teacher-navigation__heading--lesson' : ''}`}
              aria-current={isLesson && selected ? 'page' : undefined}
              onClick={isLesson ? () => navigate('lesson') : undefined}
              onPointerEnter={isLesson ? () => onPrefetch('lesson') : undefined}
              onFocus={isLesson ? () => onPrefetch('lesson') : undefined}
            >
              <span className="teacher-navigation__icon"><Icon size={20} /></span>
              <span className="teacher-navigation__heading-text"><span className="teacher-navigation__label">{group.label}</span><span className="teacher-navigation__description">{group.description}</span></span>
              {renderBadge(group.id, 'teacher-group')}
            </Heading>
            {!isLesson && (
              <div className="teacher-navigation__children">
                {group.children.map(item => {
                  const ItemIcon = item.icon;
                  return <button
                    type="button"
                    key={item.id}
                    className={`teacher-navigation__link ${view === item.id ? 'is-active' : ''}`}
                    aria-current={view === item.id ? 'page' : undefined}
                    data-tour={item.id === 'rating' ? 'rating-nav' : undefined}
                    onClick={() => navigate(item.id)}
                    onPointerEnter={() => onPrefetch(item.id)}
                    onFocus={() => onPrefetch(item.id)}
                  >
                    {ItemIcon && <ItemIcon size={16} aria-hidden="true" />}
                    <span className="teacher-navigation__link-label">{item.label}</span>
                    {renderBadge(item.id, 'teacher-link')}
                    {view === item.id && <span className="teacher-navigation__active-dot" aria-hidden="true" />}
                  </button>;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
