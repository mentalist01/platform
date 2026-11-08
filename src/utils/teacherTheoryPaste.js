import DOMPurify from 'dompurify';
import {teacherTheoryMarkdown} from './teacherTheoryMarkdown.js';
import {teacherTheoryTags,teacherTheoryStyles} from './teacherTheoryFormat.js';

export function cleanTeacherTheory(html){
  const fragment=DOMPurify.sanitize(html,{ALLOWED_TAGS:teacherTheoryTags,ALLOWED_ATTR:['href','title','style','colspan','rowspan','start','value','color','face','size'],ALLOW_DATA_ATTR:false,RETURN_DOM_FRAGMENT:true});
  for(const node of fragment.querySelectorAll('[style]')){
    const styles=[];
    for(const property of node.style){const value=node.style.getPropertyValue(property).trim();if(teacherTheoryStyles[property]?.some(rule=>rule.test(value)))styles.push(`${property}:${value}`);}
    if(styles.length)node.setAttribute('style',styles.join(';'));else node.removeAttribute('style');
  }
  const container=document.createElement('div');container.append(fragment);return container.innerHTML;
}
export function plainTeacherTheory(text){
  return cleanTeacherTheory(teacherTheoryMarkdown(text));
}
