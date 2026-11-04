// Legacy prepared sets mounted every attachment under its original filename.
// An explicit false now keeps a handout downloadable without mounting it.
export function preparedRuntimeFiles(attachments = []) {
  const seen = new Set();
  return attachments.filter(file => file.runtime !== false).map(file => {
    const name = String(file.runtimeName || file.name || '').trim().normalize('NFC');
    if (!name || name.length > 180 || /[/\\]/u.test(name) || [...name].some(char => char.codePointAt(0) < 32) || ['.', '..'].includes(name)) {
      throw new Error('Укажите имя входного файла без папок и служебных символов, например 17.txt.');
    }
    const key = name.toLocaleLowerCase('en-US');
    if (seen.has(key)) throw new Error(`Два входных файла называются «${name}». Укажите разные имена для Python.`);
    seen.add(key);
    return { ...file, runtimeName: name };
  });
}

export const preparedFileOpenExample = name => `open(${JSON.stringify(name)})`;

export function preparedRuntimeCardForCode(run, selectedCardId, codeId, onBoardPage) {
  if (!onBoardPage || !run || !codeId) return null;
  const linked = run.cards.find(card => card.kind !== 'theory' && card.codeId === codeId);
  if (linked) return linked;
  // A regular code tab on the same page can be used to solve the selected task.
  // A removed or unsynced prepared tab must never inherit another task's files.
  if (run.mode !== 'prepared' || codeId.startsWith('prepared-')) return null;
  return run.cards.find(card => card.kind !== 'theory' && card.id === selectedCardId) || null;
}
