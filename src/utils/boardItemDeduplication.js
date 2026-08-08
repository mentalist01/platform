const getBoardItemId = (value) => {
  const item = value && typeof value.toJSON === 'function' ? value.toJSON() : value;
  if (!item || typeof item !== 'object') return '';
  return String(item.id || '').trim();
};

export const findDuplicateBoardItemIndexes = (items) => {
  const source = Array.isArray(items) ? items : [];
  const seenIds = new Set();
  const duplicateIndexes = [];

  // The last occurrence is the topmost/current board version. Keeping it also
  // makes every client choose the same winner after Yjs has converged on order.
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const id = getBoardItemId(source[index]);
    if (!id) continue;
    if (seenIds.has(id)) duplicateIndexes.push(index);
    else seenIds.add(id);
  }

  return duplicateIndexes;
};

export const repairDuplicateBoardItems = (yItems, { doc, origin } = {}) => {
  if (
    !yItems
    || typeof yItems.get !== 'function'
    || typeof yItems.delete !== 'function'
  ) return 0;

  const itemCount = Math.max(0, Number(yItems.length) || 0);
  const items = Array.from({ length: itemCount }, (_, index) => yItems.get(index));
  const duplicateIndexes = findDuplicateBoardItemIndexes(items);
  if (duplicateIndexes.length === 0) return 0;

  const removeDuplicates = () => {
    duplicateIndexes.forEach((index) => yItems.delete(index, 1));
  };
  const ownerDoc = doc || yItems.doc;
  if (ownerDoc && typeof ownerDoc.transact === 'function') {
    ownerDoc.transact(removeDuplicates, origin);
  } else {
    removeDuplicates();
  }

  return duplicateIndexes.length;
};
