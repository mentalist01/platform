import {AVAILABILITY_DAY_NAMES, clockTime} from './groupAvailability.js';
import {groupAvailabilityShareCards} from './groupAvailabilityShare.js';

const font = 'system-ui, -apple-system, Segoe UI, sans-serif';
const dateLabel = day => day ? new Date(`${day}T12:00:00Z`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'}) : '';
function roundRect(ctx,x,y,w,h,r=14) {ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function fitText(ctx,text,max) {let fitted=String(text || '');if(ctx.measureText(fitted).width<=max)return fitted;while(fitted && ctx.measureText(fitted+'…').width>max)fitted=fitted.slice(0,-1);return fitted+'…';}

export async function renderGroupAvailabilitySharePng(data, mode='all') {
  if (mode==='free' && data.calendarError) throw Error(data.calendarError);
  const days=groupAvailabilityShareCards(data.groups,mode), maxRows=8;
  const partial=data.groups.some(group=>(group.excludedMemberCount || 0)>0);
  const pageCount=Math.max(1,Math.ceil(Math.max(...days.map(day=>day.length))/maxRows));
  const images=[];
  try {
    for(let page=0;page<pageCount;page++) {
      const rows=Math.max(1,...days.map(day=>day.slice(page*maxRows,(page+1)*maxRows).length));
      const width=2100, margin=32,gap=12,column=(width-margin*2-gap*6)/7,top=partial?220:190,header=56,row=partial?196:168;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=top+header+rows*row+120;
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('Не удалось подготовить картинку.');
      ctx.fillStyle='#f5f3ff';ctx.fillRect(0,0,width,canvas.height);
      ctx.fillStyle='#172033';ctx.font=`700 38px ${font}`;ctx.fillText('Время для занятий в мини-группах',margin,55);
      ctx.fillStyle='#5b21b6';ctx.font=`600 24px ${font}`;
      const audience=partial?'Выбранные участники могут':'Все участники могут';
      ctx.fillText(`${audience} · ${mode==='free'?'преподаватель свободен':'включая занятое время преподавателя'}`,margin,98);
      ctx.fillStyle='#64748b';ctx.font=`500 20px ${font}`;
      ctx.fillText(`Москва · UTC+3. Учитываем «Удобно» и «Могу подстроиться». Проверено ${dateLabel(data.fromDate)}.`,margin,134);
      if(partial)ctx.fillText('Расчёт для части группы: количество учтённых участников указано на карточках.',margin,165);
      ctx.fillText(data.calendarError?'Занятость преподавателя не проверена.':mode==='free'?'Занятое время преподавателя исключено.':'Синие карточки — время занято у преподавателя другими занятиями.',margin,partial?195:165);
      for(let day=0;day<7;day++) {
        const x=margin+day*(column+gap),cards=days[day].slice(page*maxRows,(page+1)*maxRows);
        ctx.fillStyle='#ede9fe';roundRect(ctx,x,top,column,header+rows*row);
        ctx.fillStyle='#5b21b6';ctx.font=`700 23px ${font}`;ctx.textAlign='center';ctx.fillText(AVAILABILITY_DAY_NAMES[day],x+column/2,top+36);ctx.textAlign='left';
        if(!cards.length){ctx.fillStyle='#64748b';ctx.font=`500 18px ${font}`;ctx.textAlign='center';ctx.fillText(page?'Нет других вариантов':'Нет совпадений',x+column/2,top+94);ctx.textAlign='left';}
        cards.forEach((card,index)=>{
          const y=top+header+index*row+5;
          ctx.fillStyle=card.busy?'#2563eb':'#ffffff';roundRect(ctx,x+6,y,column-12,row-12);
          ctx.fillStyle=card.busy?'#ffffff':'#5b21b6';ctx.font=`700 21px ${font}`;ctx.fillText(fitText(ctx,card.groupName,column-36),x+18,y+29);
          const shift=partial?24:0;
          if(partial){ctx.font=`600 17px ${font}`;ctx.fillText(`Учитываем ${card.includedMemberCount} из ${card.memberCount} участников`,x+18,y+51);}
          ctx.fillStyle=card.busy?'#ffffff':'#172033';ctx.font=`700 24px ${font}`;
          ctx.fillText(`${clockTime(card.firstStart)}–${clockTime(card.firstStart+card.durationMinutes)}`,x+18,y+66+shift);
          ctx.font=`500 18px ${font}`;
          ctx.fillText(`Занятие ${card.durationMinutes} мин`,x+18,y+95+shift);
          ctx.fillText(card.busy?'Занято у преподавателя':data.calendarError?'Занятость не проверена':'Можно заниматься',x+18,y+120+shift);
          ctx.font=`500 16px ${font}`;ctx.fillStyle=card.busy?'#dbeafe':'#64748b';ctx.fillText(`С ${dateLabel(card.startDate)} · ${card.weeks} недель`,x+18,y+143+shift);
        });
      }
      ctx.fillStyle='#64748b';ctx.font=`500 18px ${font}`;
      const footer=top+header+rows*row+38;
      ctx.fillText('Каждая карточка — отдельный вариант времени занятия, от начала до конца. Выберите два дня в одной группе.',margin,footer);
      ctx.fillText(mode==='free'?'Занятое время исключено. Занятия самой группы не считаются конфликтом.':'Синий вариант потребует переноса других занятий преподавателя. Время ещё предстоит согласовать.',margin,footer+29);
      ctx.textAlign='right';ctx.fillText(`${page+1} / ${pageCount}`,width-margin,canvas.height-16);ctx.textAlign='left';
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Не удалось сохранить PNG.')),'image/png'));
      images.push({blob,url:URL.createObjectURL(blob),width:canvas.width,height:canvas.height});
    }
    return images;
  }catch(error){for(const image of images)URL.revokeObjectURL(image.url);throw error;}
}
