export const BOARD_FILE_MAX_BYTES = 64 * 1024 * 1024;
export const BOARD_FILE_WIDTH = 360;
export const BOARD_FILE_HEIGHT = 112;

export const normalizeBoardFileName = value => String(value || 'Файл')
  // eslint-disable-next-line no-control-regex -- Download names cannot contain control characters.
  .split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240) || 'Файл';

export const normalizeBoardFileFields = value => {
  let assetUrl = '';
  try {
    const url = new URL(String(value?.assetUrl || ''), 'https://board.local');
    if (/^\/uploads\/board-asset-[a-f0-9]{64}\.bin$/i.test(url.pathname)) assetUrl = url.pathname;
  } catch { /* Only registered board uploads are accepted. */ }
  if (!assetUrl) return null;
  return {
    assetUrl,
    assetId: String(value.assetId || '').slice(0, 160),
    name: normalizeBoardFileName(value.name),
    sizeBytes: Math.max(0, Math.min(BOARD_FILE_MAX_BYTES, Math.floor(Number(value.sizeBytes) || 0))),
  };
};

export const formatBoardFileSize = size => {
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${Number((size / 1024).toFixed(1))} КБ`;
  return `${Number((size / (1024 * 1024)).toFixed(1))} МБ`;
};

// The same card is used by the live canvas, minimap and exported board images.
export const drawBoardFileCard = (ctx, item) => {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.scale(item.width / BOARD_FILE_WIDTH, item.height / BOARD_FILE_HEIGHT);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#d9ccfc'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(1, 1, 358, 110, 16); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f0e9ff'; ctx.beginPath(); ctx.roundRect(16, 16, 44, 48, 10); ctx.fill();
  ctx.fillStyle = '#7c3aed'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
  const extension = item.name.includes('.') ? item.name.split('.').pop().slice(0, 5).toUpperCase() : 'ФАЙЛ';
  ctx.fillText(extension, 38, 45);
  ctx.textAlign = 'left'; ctx.fillStyle = '#28233c'; ctx.font = '600 15px system-ui';
  let name = item.name;
  while (ctx.measureText(name).width > 260 && name.length > 1) name = name.slice(0, -1);
  if (name !== item.name) name = `${name.slice(0, -1)}…`;
  ctx.fillText(name, 74, 35);
  ctx.fillStyle = '#80768f'; ctx.font = '12px system-ui';
  ctx.fillText(formatBoardFileSize(item.sizeBytes), 74, 56);
  ctx.fillText('Файл к занятию', 16, 91);
  ctx.fillStyle = '#7c3aed'; ctx.beginPath(); ctx.roundRect(240, 72, 104, 28, 8); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('↓  Скачать', 292, 90);
  ctx.restore();
};
