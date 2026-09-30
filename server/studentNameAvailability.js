export const studentNameKey = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

export function studentNameAvailability(students, name, nickname = '', excludedId = '') {
  name = typeof name === 'string' ? name.trim() : '';
  nickname = typeof nickname === 'string' ? nickname.trim() : '';
  const error = !name ? 'Введите имя ученика' : name.length > 60 ? 'Имя слишком длинное'
    : nickname.length > 60 ? 'Имя 2 слишком длинное' : /[/\\]/.test(name + nickname) ? 'Недопустимые символы' : '';
  // Deleted accounts keep their names reserved while they can be restored.
  const occupied = new Set(students.filter(student => student.id !== excludedId)
    .flatMap(student => [studentNameKey(student.name), studentNameKey(student.nickname)]).filter(Boolean));
  const nameTaken = !!name && occupied.has(studentNameKey(name));
  const nicknameTaken = !!nickname && occupied.has(studentNameKey(nickname));
  const canCreate = !error && (!nameTaken || !!nickname) && !nicknameTaken;
  const message = error || (nicknameTaken ? 'Имя 2 уже занято. Введите другое, свободное имя 2.'
    : nameTaken && !nickname ? 'Такое основное имя уже занято. Введите свободное имя 2.'
      : nameTaken ? 'Основное имя занято. Имя 2 свободно — ученика можно добавить.' : 'Основное имя свободно.');
  return { nameTaken, nicknameTaken, nicknameRequired: nameTaken, canCreate, message };
}

export function assertStudentNamesAvailable(students, name, nickname, excludedId = '') {
  const result = studentNameAvailability(students, name, nickname, excludedId);
  if (!result.canCreate) throw Object.assign(new Error(result.message), { status: 409, code: 'student_name_conflict' });
  return result;
}
