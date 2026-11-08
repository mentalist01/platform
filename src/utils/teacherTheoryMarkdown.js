import {Marked} from 'marked';

const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const markdown=new Marked({gfm:true,breaks:true,renderer:{html:token=>escape(token.text)}});

// ChatGPT's message-copy button can provide Markdown instead of rich HTML.
// Escape raw HTML; the browser paste path sanitizes the generated HTML again.
export function teacherTheoryMarkdown(text){
  return markdown.parse(String(text),{async:false});
}
