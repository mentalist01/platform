// Only memoize context-free text normalization, never a roster match. Roster
// edits and ambiguous names must still be resolved against the current pupils.
const calendarTextCache = new Map();
export const normalizeCalendarEventText = (value) => {
  const text = String(value || '');
  if (calendarTextCache.has(text)) return calendarTextCache.get(text);
  const normalized = text.toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zа-я]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 512) {
    if (calendarTextCache.size >= 2048) calendarTextCache.delete(calendarTextCache.keys().next().value);
    calendarTextCache.set(text, normalized);
  }
  return normalized;
};

export const stripCalendarEventParentheticalText = (value) => {
  let depth = 0;
  let result = '';

  for (const character of String(value || '')) {
    if (character === '(' || character === '（') {
      depth += 1;
      if (depth === 1) result += ' ';
      continue;
    }
    if (character === ')' || character === '）') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0) result += ' ';
        continue;
      }
    }
    if (depth === 0) result += character;
  }

  return result.replace(/\s+/g, ' ').trim();
};

const calendarEventTextIncludesName = (haystack, name) => {
  const normalizedHaystack = normalizeCalendarEventText(haystack);
  const normalizedName = normalizeCalendarEventText(name);
  if (!normalizedHaystack || normalizedName.length < 2) return false;
  if (normalizedHaystack === normalizedName) return true;
  return ` ${normalizedHaystack} `.includes(` ${normalizedName} `);
};

const getGoogleCalendarStudentMatchNames = (student) => Array.from(new Set(
  [
    student?.name,
    student?.mainName,
    student?.studentName,
    student?.nickname,
    student?.studentNickname,
  ]
    .map((value) => normalizeCalendarEventText(value))
    .filter((value) => value.length >= 2)
));

const getGoogleCalendarStudentMatchPriority = (student, matchedName) => {
  const primaryName = normalizeCalendarEventText(student?.name);
  const explicitAliases = [
    student?.mainName,
    student?.studentName,
    student?.nickname,
    student?.studentNickname,
  ]
    .map((value) => normalizeCalendarEventText(value))
    .filter((value) => value.length >= 2 && value !== primaryName);
  if (explicitAliases.includes(matchedName)) return 3;
  if (matchedName === primaryName && explicitAliases.length === 0) return 2;
  return 1;
};

const pickUniqueGoogleCalendarStudentMatch = (matches = []) => {
  const normalizedMatches = (Array.isArray(matches) ? matches : [])
    .filter((item) => item?.student?.id && item?.name)
    .sort((left, right) => (
      (Number(right.priority) || 0) - (Number(left.priority) || 0)
      || right.name.length - left.name.length
    ));
  if (normalizedMatches.length === 0) return null;
  const topPriority = Number(normalizedMatches[0].priority) || 0;
  const priorityMatches = normalizedMatches.filter((item) => (Number(item.priority) || 0) === topPriority);
  const topLength = priorityMatches[0].name.length;
  const topMatches = priorityMatches.filter((item) => item.name.length === topLength);
  const uniqueStudentIds = new Set(
    topMatches.map((item) => String(item.student.id || '').trim()).filter(Boolean)
  );
  return uniqueStudentIds.size === 1 ? topMatches[0].student : null;
};

const getGoogleCalendarStudentMatchCandidates = (title, students = []) => {
  const normalizedTitle = normalizeCalendarEventText(title);
  if (!normalizedTitle) return [];
  return Array.from(new Set(
    (Array.isArray(students) ? students : [])
      .flatMap((student) => (
        getGoogleCalendarStudentMatchNames(student).map((name) => ({
          student,
          name,
          priority: getGoogleCalendarStudentMatchPriority(student, name),
        }))
      ))
      .filter((item) => calendarEventTextIncludesName(normalizedTitle, item.name))
  ));
};

export const resolveGoogleCalendarStudentMatch = (event, students = []) => {
  const primaryTitle = stripCalendarEventParentheticalText(event?.summary);
  const summary = normalizeCalendarEventText(primaryTitle);
  if (!summary) return null;
  const candidates = getGoogleCalendarStudentMatchCandidates(summary, students);
  const exactMatches = candidates.filter((item) => summary === item.name);
  return pickUniqueGoogleCalendarStudentMatch(exactMatches.length > 0 ? exactMatches : candidates);
};

export const attachGoogleCalendarEntryStudentMatch = (entry, students = []) => {
  if (!entry || typeof entry !== 'object') return entry;
  if (String(entry.studentId || '').trim()) return entry;
  if (entry.isLearningGroupEvent || String(entry.groupId || '').trim()) return entry;
  const matchedStudent = resolveGoogleCalendarStudentMatch(
    { summary: entry.subject || entry.studentName },
    students,
  );
  const studentId = String(matchedStudent?.id || '').trim();
  if (!studentId) return entry;
  return {
    ...entry,
    studentId,
    studentName: String(
      matchedStudent?.name
      || matchedStudent?.mainName
      || matchedStudent?.studentName
      || matchedStudent?.nickname
      || entry.studentName
      || 'Ученик'
    ).trim(),
    isTeacherSlot: false,
  };
};

// Resolve a calendar event against the whole teacher roster, rather than
// matching the same primary name independently for every namesake.
export const googleCalendarEntryMatchesStudent = (entry, student, students = []) => {
  const studentId = String(student?.id || '').trim();
  if (!studentId || entry?.isLearningGroupEvent || String(entry?.groupId || '').trim()) return false;
  const ownerId = String(entry?.studentId || '').trim();
  if (ownerId) return ownerId === studentId;
  const owner = resolveGoogleCalendarStudentMatch(
    { summary: entry?.subject || entry?.summary || entry?.studentName },
    students,
  );
  return String(owner?.id || '').trim() === studentId;
};

export const googleCalendarTitleMatchesStudent = (title, student) => {
  const normalizedTitle = normalizeCalendarEventText(stripCalendarEventParentheticalText(title));
  if (!normalizedTitle) return false;
  return getGoogleCalendarStudentMatchNames(student).some((name) => normalizedTitle === name);
};
