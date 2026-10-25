// Numbering and topics follow the FIPI draft for 2027. 19–21 form one study block.
export const STUDY_PLAN_SOURCE = 'https://fipi.ru/ege/demoversii-specifikacii-kodifikatory';
export const STUDY_PLAN_TOPICS = {
  '1': 'Таблицы и графы', '2': 'Таблицы истинности', '3': 'Базы данных',
  '4': 'Кодирование и декодирование', '5': 'Анализ алгоритмов', '6': 'Исполнитель «Черепаха»',
  '7': 'Изображение и звук', '8': 'Комбинаторика', '9': 'Электронные таблицы',
  '10': 'IP-адреса и маски', '11': 'Количество информации', '12': 'Машина Тьюринга',
  '13': 'Подсчёт программ', '14': 'Системы счисления', '15': 'Логические выражения',
  '16': 'Рекурсия', '17': 'Последовательности и файлы', '18': 'Робот в таблице',
  '19–21': 'Теория игр', '22': 'Параллельные процессы', '23': 'Алгоритмы на графах',
  '24': 'Обработка строк', '25': 'Делители и числа', '26': 'Сортировка и отбор', '27': 'Анализ данных',
};
export const STUDY_PLAN_IDS = Object.keys(STUDY_PLAN_TOPICS);
export const ORIGINAL_STUDY_ORDER = ['4','7','11','3','18','9','22','5','8','14','16','13','17','19–21','25','27','24','26'];
export const COMPLETE_STUDY_ORDER = ['4','7','11','1','3','18','9','22','2','5','6','8','14','10','12','15','16','13','17','23','19–21','25','27','24','26'];
export const STUDY_CARD = { width: 284, height: 164, pitchX: 324, pitchY: 220, margin: 60, columns: 4 };
const parts = {
  '7': ['Изображение · часть 1','Изображение · часть 2','Звук'],
  '9': ['Часть 1','Часть 2'], '22': ['Часть 1','Часть 2'],
  '19–21': ['Задание 19','Задание 20','Задание 21'],
  '26': Array.from({length:8}, (_,i) => `Часть ${i+1}`),
};
export const arrangeStudyPlan = plan => {
  const blocks = structuredClone(plan.blocks);
  plan.order.forEach((id,i) => {
    const row = Math.floor(i / STUDY_CARD.columns), col = i % STUDY_CARD.columns;
    blocks[id].x = STUDY_CARD.margin + (row % 2 ? STUDY_CARD.columns - 1 - col : col) * STUDY_CARD.pitchX;
    blocks[id].y = STUDY_CARD.margin + row * STUDY_CARD.pitchY;
  });
  return {...plan, blocks};
};
export function createStudyPlan() {
  return arrangeStudyPlan({year:2027, title:'План подготовки к ЕГЭ', order:[...ORIGINAL_STUDY_ORDER],
    blocks:Object.fromEntries(STUDY_PLAN_IDS.map(id => [id,{title:STUDY_PLAN_TOPICS[id],parts:parts[id] || [],note:'',x:60,y:60}]))});
}
export const countStudyTasks = order => order.reduce((total,id) => total + (id === '19–21' ? 3 : 1),0);
export const studyPlanFingerprint = plan => JSON.stringify({year:plan.year,title:plan.title,order:plan.order,blocks:plan.blocks});
export const isStudyPlanDraft = value => value?.year===2027 && typeof value.title==='string'
  && Array.isArray(value.order) && new Set(value.order).size===value.order.length && value.order.every(id=>STUDY_PLAN_IDS.includes(id))
  && STUDY_PLAN_IDS.every(id=>{
    const block=value.blocks?.[id];
    return block && typeof block.title==='string' && Array.isArray(block.parts) && block.parts.length<=16
      && block.parts.every(part=>typeof part==='string') && typeof block.note==='string'
      && Number.isFinite(block.x) && Number.isFinite(block.y) && block.x>=0 && block.y>=0 && block.x<=15000 && block.y<=15000;
  });
export function moveStudyBlock(plan,id,offset) {
  const order = [...plan.order], index = order.indexOf(id), next = index + offset;
  if(index < 0 || next < 0 || next >= order.length) return plan;
  [order[index],order[next]] = [order[next],order[index]];
  return arrangeStudyPlan({...plan,order});
}
export function addStudyBlock(plan,id) {
  if(!STUDY_PLAN_IDS.includes(id) || plan.order.includes(id)) return plan;
  return arrangeStudyPlan({...plan,order:[...plan.order,id]});
}
export function dropStudyBlock(plan,id,position) {
  const center={x:position.x+STUDY_CARD.width/2,y:position.y+STUDY_CARD.height/2};
  const target=plan.order.find(other=>other!==id && center.x>=plan.blocks[other].x && center.x<=plan.blocks[other].x+STUDY_CARD.width
    && center.y>=plan.blocks[other].y && center.y<=plan.blocks[other].y+STUDY_CARD.height);
  if(target) {
    const order=plan.order.filter(other=>other!==id),index=order.indexOf(target);
    order.splice(index+(plan.order.indexOf(id)<plan.order.indexOf(target)?1:0),0,id);
    return arrangeStudyPlan({...plan,order});
  }
  return {...plan,blocks:{...plan.blocks,[id]:{...plan.blocks[id],...position}}};
}
export function completeStudyPlan(plan) {
  // Keep an edited sequence; place missing topics near their suggested predecessor.
  const order = [...plan.order];
  COMPLETE_STUDY_ORDER.forEach((id,i) => {
    if(order.includes(id)) return;
    const previous = COMPLETE_STUDY_ORDER.slice(0,i).reverse().find(item => order.includes(item));
    order.splice(previous ? order.indexOf(previous)+1 : 0,0,id);
  });
  return arrangeStudyPlan({...plan,order});
}
export function studyPlanBounds(plan) {
  return {width:Math.max(700,...plan.order.map(id => plan.blocks[id].x + STUDY_CARD.width + 60)),
    height:Math.max(400,...plan.order.map(id => plan.blocks[id].y + STUDY_CARD.height + 60))};
}
export function studyPlanConnector(a,b) {
  const w=STUDY_CARD.width,h=STUDY_CARD.height;
  if(Math.abs(a.y-b.y)<h/2) {
    const right=b.x>a.x, x1=a.x+(right?w:0), x2=b.x+(right?0:w), y1=a.y+h/2,y2=b.y+h/2;
    return `M ${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}`;
  }
  const down=b.y>a.y, y1=a.y+(down?h:0), y2=b.y+(down?0:h), x1=a.x+w/2,x2=b.x+w/2;
  return `M ${x1} ${y1} C ${x1} ${(y1+y2)/2}, ${x2} ${(y1+y2)/2}, ${x2} ${y2}`;
}
