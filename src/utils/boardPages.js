export const FIRST_BOARD_PAGE_ID = 'main';
export const MAX_BOARD_PAGES = 300;
const PAGE_ID = /^[a-zA-Z0-9_-]{8,80}$/;

export function boardPageInitialState(savedPageId) {
  const pageId=typeof savedPageId==='string' && PAGE_ID.test(savedPageId) ? savedPageId : FIRST_BOARD_PAGE_ID;
  const pages=boardPagesList(null);
  if(pageId!==FIRST_BOARD_PAGE_ID)pages.push({id:pageId,title:'Страница',createdAt:0});
  return {pageId,pages};
}

export function parseBoardPageRoom(roomId) {
  if (typeof roomId !== 'string' || !roomId.startsWith('board-') || roomId.length > 760) return null;
  if (roomId.endsWith('~pages')) {
    const baseRoomId = roomId.slice(0,-6);
    return baseRoomId.includes('~page~') || baseRoomId.includes('~pages') || baseRoomId.includes('~student~')
      ? null : {baseRoomId,book:true,pageId:''};
  }
  const parts = roomId.split('~page~');
  if (parts.length !== 2 || !PAGE_ID.test(parts[1]) || parts[0].includes('~pages')) return null;
  return {baseRoomId:parts[0],book:false,pageId:parts[1]};
}
export const boardPageRoom = (baseRoomId,pageId=FIRST_BOARD_PAGE_ID,studentId='') => baseRoomId
  ? `${baseRoomId}${studentId ? `~student~${studentId}` : ''}${pageId === FIRST_BOARD_PAGE_ID ? '' : `~page~${pageId}`}` : null;
export const boardPageBookRoom = baseRoomId => baseRoomId ? `${baseRoomId}~pages` : null;
export function boardPagesList(map) {
  const values = map ? Array.from(map.entries()) : [];
  return [{id:FIRST_BOARD_PAGE_ID,title:String(map?.get(FIRST_BOARD_PAGE_ID)?.title || 'Страница 1').slice(0,80),createdAt:0},
    ...values.filter(([id,page])=>id!==FIRST_BOARD_PAGE_ID && PAGE_ID.test(id) && page && typeof page==='object')
      .map(([id,page])=>({id,title:String(page.title || 'Страница').slice(0,80),createdAt:Number(page.createdAt)||0}))
      .sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id)).slice(0,MAX_BOARD_PAGES-1)];
}
export function boardPageSummonTarget(command,userId,pages,now=Date.now()) {
  if (!command?.id || !Number.isFinite(command.ts) || now-command.ts>15000 || command.ts>now+5000
    || !pages.some(p=>p.id===command.pageId)) return null;
  const studentId=String(command.studentId || '');
  if (studentId && studentId!==userId) return null;
  const zoom=Number(command.zoom),x=Number(command.offset?.x),y=Number(command.offset?.y);
  if (![zoom,x,y].every(Number.isFinite) || zoom<=0 || Math.abs(x)>1000000 || Math.abs(y)>1000000) return null;
  return {id:command.id,pageId:command.pageId,studentId,zoom,offset:{x,y}};
}
