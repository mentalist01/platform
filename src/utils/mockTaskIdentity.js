// Personal mocks keep their original question-bank identity even when the
// exam slot changes. Game theory is expanded into three separate mock tasks.
export const getMockTaskRuleNumber = (slotNumber, question) => {
  const source = Number(question?.sourceTaskNumber);
  return Number.isInteger(source) && source > 0 && source < 100 && source !== 19
    ? source
    : Number(slotNumber);
};
