export const TEACHER_THEORY_LIMIT = 600000;
export const teacherTheoryTags = ['p','div','span','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','strike','ul','ol','li','blockquote','pre','code','hr','table','thead','tbody','tfoot','tr','th','td','a','sub','sup','mark','font'];
export const teacherTheoryStyles = {
  'color': [/^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{1,25})$/i],
  'background-color': [/^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{1,25})$/i],
  'font-weight': [/^(?:normal|bold|[1-9]00)$/],
  'font-style': [/^(?:normal|italic)$/],
  'font-family': [/^[\w\s,'"-]{1,120}$/],
  'font-size': [/^(?:[1-9]\d?(?:\.\d+)?(?:px|pt)|[1-3](?:\.\d+)?em)$/],
  'text-align': [/^(?:left|right|center|justify)$/],
  'text-decoration': [/^(?:none|underline|line-through)$/],
  'white-space': [/^(?:pre|pre-wrap|normal)$/],
};
export function teacherTheoryUrl(setId, origin=window.location.origin) {
  return new URL('/teacher-theory?set='+encodeURIComponent(setId),origin).href;
}
