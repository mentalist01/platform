export const isGroupAvailabilityNotification = note => note?.source === 'group-availability';
export const groupAvailabilityNotificationSummary = note => (
  `${String(note?.groupName || 'Мини-группа')} · Удобно: ${Number(note?.convenientCount) || 0} · Могу подстроиться: ${Number(note?.flexibleCount) || 0}`
);
export const teacherNotificationActionLabel = note => isGroupAvailabilityNotification(note)
  ? 'Посмотреть выбранное время' : 'Посмотреть сделанную домашку';
