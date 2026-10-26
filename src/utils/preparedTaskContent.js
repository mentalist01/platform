export const preparedCheckingChanged=(before,after)=>
  (before.answerMode||'combined')!==(after.answerMode||'combined')||before.format!==after.format||
  JSON.stringify(before.answers)!==JSON.stringify(after.answers)||
  JSON.stringify(before.answerTable||null)!==JSON.stringify(after.answerTable||null);

export const preparedTaskContentChanged=(before,after)=>
  before.title!==after.title||Boolean(before.difficult)!==Boolean(after.difficult)||
  JSON.stringify(before.images)!==JSON.stringify(after.images)||preparedCheckingChanged(before,after);
