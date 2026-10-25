import {preparedAnswerIndices} from './preparedAnswerTable.js';

export const splitPastedAnswerValues = (rawText) => String(rawText ?? '')
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .flatMap((line) => line.trim().split(/\s+/).filter(Boolean));

export const getAnswerPasteOrder = (answerCount, startIndex = 0) => {
  const count = Math.max(0, Number(answerCount) || 0);
  const start = Number(startIndex);
  if (!Number.isInteger(start) || start < 0 || start >= count) return [];

  if (count === 20) {
    const visualOrder = Array.from({ length: 10 }, (_, rowIdx) => [rowIdx, rowIdx + 10]).flat();
    const startPosition = visualOrder.indexOf(start);
    return visualOrder.slice(startPosition >= 0 ? startPosition : 0);
  }

  return Array.from({ length: count - start }, (_, idx) => start + idx);
};

export const getPreparedAnswerPasteOrder = (answerCount, startIndex = 0, mode = 'combined', answerTable) => {
  const count = Number(answerCount), start = Number(startIndex);
  if (!Number.isInteger(count) || !Number.isInteger(start) || start < 0 || start >= count) return [];
  const order = preparedAnswerIndices({answerCount: count, answerMode: mode, answerTable});
  return order.slice(order.indexOf(start));
};
