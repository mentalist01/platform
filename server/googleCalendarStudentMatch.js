export const normalizeCalendarEventText = (value) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^0-9a-zа-я]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

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

const pickUniqueGoogleCalendarStudentMatch = (matches = []) => {
  const normalizedMatches = (Array.isArray(matches) ? matches : [])
    .filter((item) => item?.student?.id && item?.name)
    .sort((left, right) => right.name.length - left.name.length);
  if (normalizedMatches.length === 0) return null;
  const topLength = normalizedMatches[0].name.length;
  const topMatches = normalizedMatches.filter((item) => item.name.length === topLength);
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
        getGoogleCalendarStudentMatchNames(student).map((name) => ({ student, name }))
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

export const googleCalendarTitleMatchesStudent = (title, student) => {
  const normalizedTitle = normalizeCalendarEventText(stripCalendarEventParentheticalText(title));
  if (!normalizedTitle) return false;
  return getGoogleCalendarStudentMatchNames(student).some((name) => normalizedTitle === name);
};
