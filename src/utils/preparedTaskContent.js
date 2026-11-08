export const preparedCheckingChanged=(before,after)=>
  (before.answerMode||'combined')!==(after.answerMode||'combined')||before.format!==after.format||
  JSON.stringify(before.answers)!==JSON.stringify(after.answers)||
  JSON.stringify(before.answerTable||null)!==JSON.stringify(after.answerTable||null)||
  JSON.stringify(before.answerGroups||null)!==JSON.stringify(after.answerGroups||null);

export const preparedTaskContentChanged=(before,after)=>
  JSON.stringify(before.interactive||null)!==JSON.stringify(after.interactive||null)||
  before.title!==after.title||Boolean(before.difficult)!==Boolean(after.difficult)||
  JSON.stringify(before.images)!==JSON.stringify(after.images)||
  JSON.stringify(before.theoryStep||null)!==JSON.stringify(after.theoryStep||null)||
  JSON.stringify(before.theoryDisplay||null)!==JSON.stringify(after.theoryDisplay||null)||
  JSON.stringify(before.boardDisplay||null)!==JSON.stringify(after.boardDisplay||null)||
  JSON.stringify(before.referenceSolutions||[])!==JSON.stringify(after.referenceSolutions||[])||preparedCheckingChanged(before,after);
