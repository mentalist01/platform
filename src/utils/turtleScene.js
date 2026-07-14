const TURTLE_SCENE_MAX_PRIMITIVES = 20_000;
const TURTLE_SCENE_MAX_POLYGON_POINTS = 20_000;
const TURTLE_SCENE_MAX_ABS_COORDINATE = 1_000_000_000;
const TURTLE_SCENE_MAX_SIZE = 100_000;

export const TURTLE_SCENE_MAX_JSON_CHARS = 4 * 1024 * 1024;

const normalizeTurtleSceneNumber = (value, limit = TURTLE_SCENE_MAX_ABS_COORDINATE) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(-limit, Math.min(limit, numeric));
};

const normalizeTurtleSceneColor = (value, fallback = 'black') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 128) : fallback;
};

export const normalizeTurtleScene = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.primitives)) return null;
  const rawPrimitives = value.primitives;
  const primitives = [];
  let polygonPointCount = 0;
  let truncated = value.truncated === true || rawPrimitives.length > TURTLE_SCENE_MAX_PRIMITIVES;

  for (let index = 0; index < Math.min(rawPrimitives.length, TURTLE_SCENE_MAX_PRIMITIVES); index += 1) {
    const primitive = rawPrimitives[index];
    if (!primitive || typeof primitive !== 'object') continue;
    if (primitive.type === 'line') {
      const x1 = normalizeTurtleSceneNumber(primitive.x1);
      const y1 = normalizeTurtleSceneNumber(primitive.y1);
      const x2 = normalizeTurtleSceneNumber(primitive.x2);
      const y2 = normalizeTurtleSceneNumber(primitive.y2);
      if ([x1, y1, x2, y2].some((entry) => entry === null)) continue;
      primitives.push({
        type: 'line',
        x1,
        y1,
        x2,
        y2,
        color: normalizeTurtleSceneColor(primitive.color),
        width: Math.max(0.1, Math.abs(normalizeTurtleSceneNumber(primitive.width, TURTLE_SCENE_MAX_SIZE) ?? 1)),
      });
      continue;
    }
    if (primitive.type === 'dot') {
      const x = normalizeTurtleSceneNumber(primitive.x);
      const y = normalizeTurtleSceneNumber(primitive.y);
      if (x === null || y === null) continue;
      primitives.push({
        type: 'dot',
        x,
        y,
        size: Math.max(0.1, Math.abs(normalizeTurtleSceneNumber(primitive.size, TURTLE_SCENE_MAX_SIZE) ?? 1)),
        color: normalizeTurtleSceneColor(primitive.color),
      });
      continue;
    }
    if (primitive.type === 'polygon' && Array.isArray(primitive.points)) {
      const points = [];
      const remainingPointBudget = TURTLE_SCENE_MAX_POLYGON_POINTS - polygonPointCount;
      for (let pointIndex = 0; pointIndex < Math.min(primitive.points.length, remainingPointBudget); pointIndex += 1) {
        const rawPoint = primitive.points[pointIndex];
        const x = normalizeTurtleSceneNumber(Array.isArray(rawPoint) ? rawPoint[0] : rawPoint?.x);
        const y = normalizeTurtleSceneNumber(Array.isArray(rawPoint) ? rawPoint[1] : rawPoint?.y);
        if (x !== null && y !== null) points.push([x, y]);
      }
      polygonPointCount += points.length;
      if (primitive.points.length > remainingPointBudget) truncated = true;
      if (points.length < 2) continue;
      primitives.push({
        type: 'polygon',
        points,
        fill: normalizeTurtleSceneColor(primitive.fill, ''),
        outline: normalizeTurtleSceneColor(primitive.outline, ''),
        width: Math.max(0.1, Math.abs(normalizeTurtleSceneNumber(primitive.width, TURTLE_SCENE_MAX_SIZE) ?? 1)),
      });
      continue;
    }
    if (primitive.type === 'text') {
      const x = normalizeTurtleSceneNumber(primitive.x);
      const y = normalizeTurtleSceneNumber(primitive.y);
      if (x === null || y === null) continue;
      primitives.push({
        type: 'text',
        x,
        y,
        text: String(primitive.text ?? '').slice(0, 500),
        color: normalizeTurtleSceneColor(primitive.color),
        align: ['left', 'center', 'right'].includes(primitive.align) ? primitive.align : 'left',
        font: Array.isArray(primitive.font)
          ? primitive.font.slice(0, 3).map((entry) => String(entry).slice(0, 128))
          : String(primitive.font || '').slice(0, 128),
      });
    }
  }

  const width = normalizeTurtleSceneNumber(value.width, TURTLE_SCENE_MAX_SIZE);
  const height = normalizeTurtleSceneNumber(value.height, TURTLE_SCENE_MAX_SIZE);
  const rawWorld = Array.isArray(value.world) ? value.world.slice(0, 4) : null;
  const world = rawWorld?.length === 4
    ? rawWorld.map((entry) => normalizeTurtleSceneNumber(entry))
    : null;
  return {
    version: 1,
    used: value.used === true || primitives.length > 0,
    width: Math.max(1, Math.abs(width ?? 800)),
    height: Math.max(1, Math.abs(height ?? 600)),
    background: normalizeTurtleSceneColor(value.background, 'white'),
    world: world?.every((entry) => entry !== null) ? world : null,
    primitives,
    truncated,
    limit: TURTLE_SCENE_MAX_PRIMITIVES,
  };
};

export const parseTurtleSceneJson = (value) => {
  if (typeof value !== 'string' || value.length > TURTLE_SCENE_MAX_JSON_CHARS) return null;
  try {
    return normalizeTurtleScene(JSON.parse(value));
  } catch {
    return null;
  }
};

export const serializeTurtleScene = (value) => {
  const scene = normalizeTurtleScene(value);
  if (!scene) return { scene: null, json: '' };
  try {
    const json = JSON.stringify(scene);
    if (json.length > TURTLE_SCENE_MAX_JSON_CHARS) return { scene: null, json: '' };
    return { scene, json };
  } catch {
    return { scene: null, json: '' };
  }
};
