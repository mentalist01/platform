const SECTIONS = [
  { id: 'nav-schedule', label: 'Расписание', views: ['schedule', 'teacher-calendar', 'groups', 'meetings'] },
  { id: 'lesson', label: 'Урок', views: ['call', 'board', 'collab'] },
  { id: 'nav-students', label: 'Ученики', views: ['teacher-students', 'progress', 'rating', 'teacher-comms'] },
  { id: 'nav-materials', label: 'Материалы', views: ['python', 'teacher', 'notes', 'recording'] },
  { id: 'nav-management', label: 'Управление', views: ['finance', 'teacher-settings'] },
];

export const getTeacherNavigationGroup = view => SECTIONS.find(section => section.views.includes(view))?.id;

export const buildTeacherNavigation = nav => SECTIONS.map(section => ({
  id: section.id,
  label: section.label,
  children: section.id === 'lesson' ? [] : section.views.map(id => nav.find(item => item.id === id)).filter(Boolean),
}));
