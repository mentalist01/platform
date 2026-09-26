// stdin is data, including trailing spaces and empty final lines. Never trim it.
export const normalizePythonTestText = (value) => String(value ?? '').replace(/\r\n?/g, '\n');

export const preparePythonTests = (tests) => tests.map((item) => ({
  input: normalizePythonTestText(item?.input),
  output: normalizePythonTestText(item?.output),
})).filter((item) => item.input !== '' || item.output !== '');

const readField = (item, keys, index) => {
  const present = keys.filter((key) => Object.hasOwn(item, key));
  if (!present.length) throw new Error(`Тест ${index + 1}: отсутствует поле ${keys[0]}. Для пустого ввода укажите input: "".`);
  const values = present.map((key) => {
    if (typeof item[key] !== 'string') throw new Error(`Тест ${index + 1}: поле ${key} должно быть строкой.`);
    return normalizePythonTestText(item[key]);
  });
  if (values.some((value) => value !== values[0])) throw new Error(`Тест ${index + 1}: поля ${present.join(', ')} содержат разные значения.`);
  return values[0];
};

export function parseTestsFileContent(content) {
  const normalized = normalizePythonTestText(content);
  if (!normalized.trim()) return [];
  if (/^[\s\uFEFF]*[\[{]/.test(normalized)) {
    const data = JSON.parse(normalized.replace(/^\uFEFF/, ''));
    const list = Array.isArray(data) ? data : data?.tests;
    if (!Array.isArray(list)) throw new Error('Ожидается массив тестов или объект с полем tests.');
    return list.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Тест ${index + 1}: ожидается объект.`);
      return {
        input: readField(item, ['input', 'stdin'], index),
        output: readField(item, ['output', 'stdout', 'expectedOutput'], index),
      };
    });
  }
  return normalized.split(/\n-{3,}\n/).filter((block) => block.trim()).map((block, index) => {
    let section = '';
    const fields = {};
    // Preserve each data line's terminator. In particular, an empty input line
    // immediately before output: must remain a readable line for input().
    for (const line of block.match(/[^\n]*\n|[^\n]+$/g) || []) {
      const marker = line.trim().toLowerCase();
      if (['input:', 'in:', 'stdin:'].includes(marker)) section = 'input';
      else if (['output:', 'out:', 'stdout:'].includes(marker)) section = 'output';
      else {
        if (section) fields[section] += line;
        continue;
      }
      if (Object.hasOwn(fields, section)) throw new Error(`Тест ${index + 1}: повторный заголовок ${section}.`);
      fields[section] = '';
    }
    return { input: readField(fields, ['input'], index), output: readField(fields, ['output'], index) };
  });
}
