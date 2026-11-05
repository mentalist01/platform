import {normalizePreparedTheoryDisplay, preparedTheoryFrame} from './preparedTheoryDisplay.js';
import {preparedNextPoint, preparedTheorySheetPoint} from './preparedTheoryLayout.js';

export const preparedLayoutKey = card => card.kind === 'theory' ? `theory:${card.images[0]}` : `task:${card.id}`;

export function normalizePreparedSetLayout(sequence, layout) {
  const earlier = new Set();
  const result = {};
  for (const card of sequence) {
    const key = preparedLayoutKey(card);
    const input = layout?.[key];
    let setting = normalizePreparedTheoryDisplay(input);
    if (setting?.relativeTo && !earlier.has(setting.relativeTo)) {
      const {relativeTo, offset, ...rest} = setting;
      setting = normalizePreparedTheoryDisplay(rest);
    }
    if (setting) result[key] = setting;
    earlier.add(key);
  }
  return result;
}

export function remapPreparedSetLayout(layout, tasks, assets) {
  const remap = key => key.startsWith('theory:')
    ? assets.has(key.slice(7)) && `theory:${assets.get(key.slice(7))}`
    : tasks.has(key.slice(5)) && `task:${tasks.get(key.slice(5))}`;
  return Object.fromEntries(Object.entries(layout || {}).flatMap(([key, setting]) => {
    const next = remap(key);
    if (!next) return [];
    const {relativeTo, ...rest} = setting;
    const reference = relativeTo && remap(relativeTo);
    return [[next, {...rest, ...(reference ? {relativeTo: reference} : {})}]];
  }));
}

export function preparedCardGeometry(card, assets, answerRows, existing) {
  const theory = card.kind === 'theory';
  const height = (theory ? 16 : 124) + Math.max(0, answerRows - 1) * (card.answerGroups ? 70 : 44)
    + card.images.reduce((sum, id) => {
      const image = assets[id];
      return sum + Math.min(900, Math.max(60, image?.width ? 600 * image.height / image.width : 400)) + 12;
    }, 0) + card.attachments.length * 230;
  const scale = existing ? existing.spawnScale || 1
    : 1.3 * (card.boardDisplay?.scalePercent ?? (card.theoryStep ? card.theoryDisplay?.scalePercent : null) ?? 100) / 100;
  return {width: existing?.width || 640, height: existing?.height || height, scale};
}

// The builder, live placement and the teacher's preview share these rules.
export function preparedPlacementRecipe(card, priorCards, previousCard, lastCard, start) {
  const display = card.boardDisplay;
  const previousTask = card.kind !== 'theory' && priorCards.findLast(row => row.card.kind !== 'theory');
  const preceding = previousTask || priorCards.at(-1);
  const reference = display && (display.relativeTo ? priorCards.find(row => row.key === display.relativeTo) : preceding);
  const earlierSheets = card.theoryStep ? priorCards.filter(row =>
    row.card.theoryStep && (row.card.theoryBefore || '') === (card.theoryBefore || '')
    && row.card.theoryStep.index < card.theoryStep.index) : [];
  const sheet = earlierSheets.find(row => row.card.images.includes(card.theoryDisplay?.relativeTo)) || earlierSheets.at(-1);
  const previousBlock = card.kind !== 'theory' && !previousTask && previousCard?.theoryStep ? priorCards.filter(row =>
    row.card.theoryStep && (row.card.theoryBefore || '') === (previousCard.theoryBefore || '')) : [];
  return {start, lastId: preceding?.anchorId || lastCard?.anchorId, referenceId: reference?.anchorId, sheetId: sheet?.anchorId,
    blockIds: previousBlock.map(row => row.anchorId), display, legacyDisplay: card.theoryDisplay,
    sheetCount: card.theoryStep?.blockCount || card.theoryStep?.count, theory: card.kind === 'theory'};
}

export function placePreparedCard(items, recipe, size) {
  const {start, lastId, referenceId, sheetId, blockIds, display, legacyDisplay, sheetCount, theory} = recipe;
  const reference = referenceId && items.find(item => item.id === referenceId);
  if (reference && (display.placement !== 'auto' || display.relativeTo)) {
    const placement = display.placement === 'auto' ? 'below' : display.placement;
    return preparedTheorySheetPoint(items, reference, size, {...display, placement});
  }
  const sheet = sheetId && items.find(item => item.id === sheetId);
  if (sheet) return preparedTheorySheetPoint(items, sheet, size, legacyDisplay, sheetCount);
  if (blockIds.length) {
    const block = items.filter(item => blockIds.includes(item.id)).reduce((box, item) => preparedTheoryFrame(box, item) || item, null);
    if (block) return preparedNextPoint(items, block);
  }
  const last = lastId && items.find(item => item.id === lastId);
  return last ? preparedNextPoint(items, last, theory ? Math.max(last.width, size.width) : undefined) : start;
}

export function preparedFocusReference(recipe) {
  return recipe.display?.focus === 'pair' ? recipe.referenceId || recipe.sheetId
    : !recipe.display && recipe.legacyDisplay?.focus === 'pair' ? recipe.sheetId : undefined;
}
