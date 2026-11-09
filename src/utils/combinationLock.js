export const COMBINATION_LOCK_CARD = 'python-combination-lock-v1';
export const LOCK_CODE_LIMIT = 4000;
const fail = message => { throw Error(message); };
const identifier = /^[\p{L}_][\p{L}\p{N}_]*$/u;

// This reads the small declarative loop model; it never evaluates Python or JS.
function withoutComment(line) {
  let quote = '', escaped = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '#') return line.slice(0, i);
  }
  return line;
}
function stringLiteral(token) {
  const quote = token[0];
  if (!['"', "'"].includes(quote) || token.at(-1) !== quote) return null;
  let result = '';
  for (let i = 1; i < token.length - 1; i++) {
    const char = token[i];
    if (char === quote || char === '\n' || char === '\r') return null;
    if (char === '\\') {
      const next = token[++i];
      if (![quote, '\\'].includes(next) || i >= token.length - 1) return null;
      result += next;
    } else result += char;
  }
  return result;
}
function splitLiterals(text) {
  const values = []; let start = 0, quote = '', escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (quote && char === '\\') { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === ',') { values.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (quote) fail('Закройте кавычки в наборе символов.');
  const tail = text.slice(start).trim();
  if (tail) values.push(tail);
  return values;
}
function sequence(expression, variables) {
  const text = expression.trim();
  if (variables.has(text)) return [...variables.get(text)];
  const literal = stringLiteral(text);
  let symbols;
  if (literal !== null) symbols = [...literal];
  else if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('(') && text.endsWith(')')) || (text.includes(',') && !text.startsWith('range('))) {
    const items = splitLiterals(text.startsWith('[') || text.startsWith('(') ? text.slice(1, -1) : text);
    symbols = items.map(item => stringLiteral(item) ?? (/^\d$/.test(item) ? item : fail('В списке нужны отдельные буквы в кавычках или цифры от 0 до 9.')));
  } else if (/^range\(.*\)$/.test(text)) {
    const args = text.slice(6, -1).split(',').map(value => value.trim());
    if (!args.length || args.length > 3 || args.some(value => !/^-?\d{1,3}$/.test(value))) fail('Для range укажите целые числа: например, range(3) или range(1, 4).');
    const numbers = args.map(Number), start = args.length === 1 ? 0 : numbers[0], end = numbers.at(args.length === 3 ? 1 : -1), step = args.length === 3 ? numbers[2] : 1;
    if (!step) fail('Шаг range не может быть нулевым.');
    symbols = [];
    for (let value = start; step > 0 ? value < end : value > end; value += step) {
      if (symbols.length >= 10 || value < 0 || value > 9) fail('Для колёсика range должен давать не больше 10 цифр от 0 до 9.');
      symbols.push(String(value));
    }
  } else fail(identifier.test(text) ? `Сначала задайте ${text}, например: ${text} = "АБВ".` : 'После in укажите строку, список символов или range.');
  if (!symbols.length || symbols.length > 10 || symbols.some(value => [...value].length !== 1 || !/^[\p{L}\p{N}]$/u.test(value))) fail('На колёсике может быть от 1 до 10 отдельных букв или цифр.');
  if (new Set(symbols).size !== symbols.length) fail('Символы на одном колёсике должны быть разными.');
  return symbols;
}

export function lockExample(count = 2) {
  return Array.from({ length: count }, (_, i) => `${'    '.repeat(i)}for x${i + 1} in "АБ":`).join('\n')
    + `\n${'    '.repeat(count)}print(${Array.from({ length: count }, (_, i) => `x${i + 1}`).join(' + ')})`;
}
export function parseCombinationLock(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > LOCK_CODE_LIMIT) fail('Введите цепочку из 1–3 вложенных циклов for.');
  const variables = new Map(), wheels = [];
  let previousIndent = -1, body = false, filter = null, filterIndent = -1;
  for (const raw of code.replace(/\r\n?/g, '\n').split('\n')) {
    const line = withoutComment(raw.replace(/\t/g, '    ')).trimEnd();
    if (!line.trim()) continue;
    const text = line.trim(), indent = line.length - line.trimStart().length;
    const assignment = /^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u.exec(text);
    if (!wheels.length && !indent && assignment) { variables.set(assignment[1], sequence(assignment[2], variables)); continue; }
    const loop = /^for\s+([\p{L}_][\p{L}\p{N}_]*)\s+in\s+(.+):$/u.exec(text);
    if (loop) {
      if (body || filter || (wheels.length ? indent <= previousIndent : indent !== 0)) fail('Каждый следующий for должен находиться внутри предыдущего: добавьте отступ.');
      if (wheels.length >= 3) fail('В этой модели можно показать до 3 вложенных циклов.');
      if (wheels.some(wheel => wheel.name === loop[1])) fail('Назовите переменные циклов по-разному: например, x1, x2, x3.');
      wheels.push({ name: loop[1], symbols: sequence(loop[2], variables) }); variables.delete(loop[1]); previousIndent = indent;
    } else if (wheels.length && !body && !filter && /^if\s/.test(text)) {
      const condition = /^if\s+\(([^)]+)\)\.count\(("[^"\n]"|'[^'\n]')\)\s*==\s*([0-3]):$/u.exec(text);
      if (!condition || indent <= previousIndent || condition[1].split('+').map(value => value.trim()).join('+') !== wheels.map(wheel => wheel.name).join('+')) fail('Для условия используйте, например: if (x1 + x2).count("А") == 1:');
      filter = { symbol: stringLiteral(condition[2]), count: Number(condition[3]) }; filterIndent = indent;
    } else if (wheels.length && indent > Math.max(previousIndent, filterIndent) && (text === 'pass' || /^print\s*\(.*\)$/.test(text))) body = true;
    else fail('Нужна цепочка вложенных for, затем print(...) или условие count(...) == число и print(...).');
  }
  if (!wheels.length || !body) fail('Завершите циклы: внутри последнего напишите print(...) или pass.');
  return { code: code.trimEnd(), wheels, total: wheels.reduce((total, wheel) => total * wheel.symbols.length, 1), ...(filter ? { filter } : {}) };
}
export function normalizeLockParams(input = {}) {
  if (input.code === undefined || input.code === '') return { code: '', wheelCount: [1, 2, 3].includes(input.wheelCount) ? input.wheelCount : 1 };
  return { code: parseCombinationLock(input.code).code };
}
export function combinationLockModel(state) {
  return parseCombinationLock(state.code || lockExample([1, 2, 3].includes(state.wheelCount) ? state.wheelCount : 1));
}
export function lockCommands(wheelCount, mission = 'enumerate') {
  return [...Array.from({ length: wheelCount }, (_, index) => `for:${index}`), ...(mission === 'single-a' ? ['if'] : []), 'print'];
}
export function lockProgram(state) {
  const model = combinationLockModel(state), expressions = model.wheels.map(wheel => wheel.name).join(' + ');
  let code = model.wheels.map((wheel, index) => `${'    '.repeat(index)}for ${wheel.name} in "${wheel.symbols.join('')}":`).join('\n');
  const condition = model.filter || (state.mission === 'single-a' ? { symbol: model.wheels.some(wheel => wheel.symbols.includes('А')) ? 'А' : 'A', count: 1 } : null);
  if (condition) code += `\n${'    '.repeat(model.wheels.length)}if (${expressions}).count("${condition.symbol}") == ${condition.count}:`;
  return code + `\n${'    '.repeat(model.wheels.length + (condition ? 1 : 0))}print(${expressions})`;
}
export function lockMatches(model, index, mission = 'enumerate') {
  const filter = model.filter || (mission === 'single-a' ? { symbol: model.wheels.some(wheel => wheel.symbols.includes('А')) ? 'А' : 'A', count: 1 } : null);
  return !filter || [...lockWord(model, index)].filter(symbol => symbol === filter.symbol).length === filter.count;
}
export function normalizeLockState(input, params = {}) {
  let base;
  try { base = normalizeLockParams(typeof input?.code === 'string' ? input : params); }
  catch { base = normalizeLockParams(params); }
  const model = combinationLockModel(base), mission = model.filter || input?.mission === 'single-a' ? 'single-a' : 'enumerate';
  const index = Number.isInteger(input?.index) && input.index >= 0 && input.index < model.total ? input.index : 0;
  const visited = [...new Set((Array.isArray(input?.visited) ? input.visited.slice(0, 1000) : []).filter(value => Number.isInteger(value) && value >= 0 && value < model.total))].sort((a, b) => a - b);
  const commands = lockCommands(model.wheels.length, mission), order = input?.commandOrder;
  return { code: base.code, wheelCount: model.wheels.length, index, visited, codeVisible: input?.codeVisible === true, direction: input?.direction === -1 ? -1 : 1,
    previousIndex: Number.isInteger(input?.previousIndex) && input.previousIndex >= 0 && input.previousIndex < model.total ? input.previousIndex : index,
    codeMode: input?.codeMode === 'python' ? 'python' : 'commands', formulaVisible: input?.formulaVisible === true, mission,
    commandOrder: Array.isArray(order) && order.length === commands.length && new Set(order).size === commands.length && commands.every(id => order.includes(id)) ? order : commands };
}
export function lockDigits(model, index) {
  const digits = [];
  for (let i = model.wheels.length - 1; i >= 0; i--) { const base = model.wheels[i].symbols.length; digits.unshift(index % base); index = Math.floor(index / base); }
  return digits;
}
export const lockWord = (model, index) => lockDigits(model, index).map((digit, i) => model.wheels[i].symbols[digit]).join('');
export function visitLockIndex(state, index) {
  const model = combinationLockModel(state), target = Math.max(0, Math.min(model.total - 1, index));
  return normalizeLockState({ ...state, index: target, visited: [...state.visited, target], previousIndex: state.index, direction: index < state.index ? -1 : 1 }, state);
}
export function turnLockWheel(state, wheelIndex, delta) {
  const model = combinationLockModel(state), digits = lockDigits(model, state.index);
  if (!model.wheels[wheelIndex]) return state;
  const base = model.wheels[wheelIndex].symbols.length, next = (digits[wheelIndex] + delta % base + base) % base;
  const weight = model.wheels.slice(wheelIndex + 1).reduce((value, wheel) => value * wheel.symbols.length, 1);
  return { ...visitLockIndex(state, state.index + (next - digits[wheelIndex]) * weight), direction: delta < 0 ? -1 : 1 };
}
