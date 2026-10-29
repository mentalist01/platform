import {isPreparedTaskAnchor} from './preparedInk.js';

// Embedded tasks and files have explicit removal controls. The eraser only
// removes annotations, including annotations painted over prepared conditions.
export function findBoardEraserHit(items, hitTest) {
  for (let index=items.length-1;index>=0;index--) {
    const raw=typeof items.get==='function'?items.get(index):items[index];
    const item=raw&&typeof raw.toJSON==='function'?raw.toJSON():raw;
    if (!item||isPreparedTaskAnchor(item)||!['stroke','line','arrow','shape','text'].includes(item.type)) continue;
    if (hitTest(item)) return index;
  }
  return -1;
}
