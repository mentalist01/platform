import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui';
import {
  BookOpen,
  Bot,
  BrainCircuit,
  Castle,
  CheckCircle2,
  ChevronRight,
  Coins,
  Crown,
  Eye,
  Hammer,
  Home,
  Map as MapIcon,
  Pickaxe,
  Play,
  RotateCcw,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  Users,
  Wheat,
} from 'lucide-react';

const GAME_VERSION = 4;
const STORAGE_KEY = 'mobile-strategy-game-save-v4';
const PREFS_KEY = 'mobile-strategy-game-prefs-v4';
const GRID_SIZE = 6;
const BOARD_SIZE = GRID_SIZE * GRID_SIZE;
const PLAYER_CAPITAL_ID = 7;
const ENEMY_CAPITAL_ID = BOARD_SIZE - 1 - PLAYER_CAPITAL_ID;
const TURN_COMMAND_POINTS = 2;
const MAX_LOG_ENTRIES = 10;
const MAX_LEVEL = 3;
const MAX_RESOURCE = 999;
const DEFAULT_DIFFICULTY = 'tactician';

const SIDE_PLAYER = 'player';
const SIDE_ENEMY = 'enemy';

const DIFFICULTY_SETTINGS = {
  commander: {
    id: 'commander',
    label: 'Командир',
    description: 'Ошибка врага прощается чаще, а глубина поиска меньше.',
    searchDepth: 2,
    beamWidth: 5,
    startingGold: 92,
    startingFood: 80,
    enemyOpeningBonusGold: 0,
    enemyOpeningBonusFood: 0,
  },
  tactician: {
    id: 'tactician',
    label: 'Тактик',
    description: 'Сбалансированный режим с сильным, но честным ИИ.',
    searchDepth: 3,
    beamWidth: 6,
    startingGold: 96,
    startingFood: 82,
    enemyOpeningBonusGold: 4,
    enemyOpeningBonusFood: 4,
  },
  warlord: {
    id: 'warlord',
    label: 'Воевода',
    description: 'ИИ просчитывает дальше и агрессивнее давит на столицу.',
    searchDepth: 3,
    beamWidth: 8,
    startingGold: 100,
    startingFood: 84,
    enemyOpeningBonusGold: 10,
    enemyOpeningBonusFood: 8,
  },
};

const TERRAIN_STATS = {
  plains: {
    id: 'plains',
    label: 'Равнина',
    emoji: '🌾',
    gold: 2,
    food: 4,
    defense: 1,
    farmBonus: 3,
    mineBonus: 0,
    claimCost: 12,
    palette: 'from-emerald-400/35 via-lime-300/25 to-yellow-200/20',
  },
  forest: {
    id: 'forest',
    label: 'Лес',
    emoji: '🌲',
    gold: 2,
    food: 3,
    defense: 2,
    farmBonus: 1,
    mineBonus: 1,
    claimCost: 13,
    palette: 'from-emerald-700/45 via-teal-700/35 to-slate-900/25',
  },
  highland: {
    id: 'highland',
    label: 'Высота',
    emoji: '⛰️',
    gold: 2,
    food: 1,
    defense: 3,
    farmBonus: 0,
    mineBonus: 2,
    claimCost: 14,
    palette: 'from-slate-500/45 via-stone-400/30 to-zinc-900/20',
  },
  village: {
    id: 'village',
    label: 'Поселение',
    emoji: '🏘️',
    gold: 4,
    food: 4,
    defense: 2,
    farmBonus: 2,
    mineBonus: 1,
    claimCost: 13,
    palette: 'from-orange-300/35 via-amber-200/30 to-lime-200/25',
  },
  ruins: {
    id: 'ruins',
    label: 'Руины',
    emoji: '🏛️',
    gold: 5,
    food: 1,
    defense: 1,
    farmBonus: 0,
    mineBonus: 3,
    claimCost: 15,
    palette: 'from-stone-400/40 via-slate-400/25 to-zinc-900/20',
  },
  river: {
    id: 'river',
    label: 'Река',
    emoji: '🌊',
    gold: 1,
    food: 5,
    defense: 1,
    farmBonus: 4,
    mineBonus: 0,
    claimCost: 12,
    palette: 'from-cyan-400/35 via-sky-300/30 to-blue-200/20',
  },
};

const BUILDING_STATS = {
  capital: { id: 'capital', label: 'Столица', emoji: '👑', defense: 8, gold: 6, food: 5, revealRadius: 2, baseCost: 0, growthCost: 0 },
  farm: { id: 'farm', label: 'Ферма', emoji: '🌾', defense: 1, gold: 0, food: 5, revealRadius: 0, baseCost: 18, growthCost: 8 },
  mine: { id: 'mine', label: 'Шахта', emoji: '⛏️', defense: 1, gold: 5, food: 0, revealRadius: 0, baseCost: 20, growthCost: 9 },
  fort: { id: 'fort', label: 'Форт', emoji: '🛡️', defense: 6, gold: 1, food: 0, revealRadius: 0, baseCost: 24, growthCost: 10 },
  watchtower: { id: 'watchtower', label: 'Башня', emoji: '🗼', defense: 2, gold: 1, food: 0, revealRadius: 2, baseCost: 16, growthCost: 7 },
};

const UNIT_STATS = {
  militia: { id: 'militia', label: 'Ополчение', emoji: '🛡️', attack: 2, defense: 3, upkeep: 1, goldCost: 10, foodCost: 4, recruitAmount: 2 },
  archers: { id: 'archers', label: 'Лучники', emoji: '🏹', attack: 4, defense: 2, upkeep: 1, goldCost: 16, foodCost: 6, recruitAmount: 1 },
  knights: { id: 'knights', label: 'Рыцари', emoji: '🐎', attack: 6, defense: 4, upkeep: 2, goldCost: 24, foodCost: 10, recruitAmount: 1 },
};

const COMMAND_GROUPS = [
  { id: 'orders', label: 'Фронт', actions: ['expand', 'assault', 'scout'] },
  { id: 'economy', label: 'Экономика', actions: ['farm', 'mine', 'fort', 'watchtower'] },
  { id: 'army', label: 'Армия', actions: ['militia', 'archers', 'knights'] },
];

const ACTIONS = {
  expand: { id: 'expand', label: 'Захват', description: 'Колонизирует соседнюю нейтральную клетку.', group: 'orders', icon: Crown },
  assault: { id: 'assault', label: 'Штурм', description: 'Атакует соседнюю вражескую клетку общей силой приграничных гарнизонов.', group: 'orders', icon: Swords },
  scout: { id: 'scout', label: 'Разведка', description: 'Открывает туман войны вокруг выбранной клетки.', group: 'orders', icon: Eye },
  farm: { id: 'farm', label: 'Ферма', description: 'Дает больше еды. Лучше всего работает на равнинах, в деревнях и у реки.', group: 'economy', icon: Wheat, structure: 'farm' },
  mine: { id: 'mine', label: 'Шахта', description: 'Дает больше золота. Особенно сильна в руинах и на высоте.', group: 'economy', icon: Pickaxe, structure: 'mine' },
  fort: { id: 'fort', label: 'Форт', description: 'Укрепляет фронт и резко увеличивает защиту гарнизона.', group: 'economy', icon: Shield, structure: 'fort' },
  watchtower: { id: 'watchtower', label: 'Башня', description: 'Раскрывает карту и лучше удерживает фланг.', group: 'economy', icon: MapIcon, structure: 'watchtower' },
  militia: { id: 'militia', label: 'Ополчение', description: 'Дешевый гарнизон, хорошо держит линию.', group: 'army', icon: Users, unit: 'militia' },
  archers: { id: 'archers', label: 'Лучники', description: 'Сильнее в штурме и прорыве.', group: 'army', icon: Target, unit: 'archers' },
  knights: { id: 'knights', label: 'Рыцари', description: 'Самый дорогой и самый пробивной отряд.', group: 'army', icon: Hammer, unit: 'knights' },
};

const GUIDE_STEPS = [
  { title: 'Как играть', text: 'Сначала выбери приказ, потом тапни по клетке. На ход у тебя два приказа, поэтому можно делать комбинации.' },
  { title: 'Экономика решает темп', text: 'Фермы и шахты дают долгий разгон. Если рано отстать по экономике, ИИ быстро начнет переигрывать по темпу.' },
  { title: 'Штурм без случайного куба', text: 'Бой детерминированный: сила штурма считается по соседним гарнизонам, а ИИ заранее оценивает выгодные линии.' },
  { title: 'Разведка теперь полезна', text: 'Башни и разведка помогают не идти вслепую. На этой карте туман войны действительно влияет на решения.' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const getOpponent = (side) => (side === SIDE_PLAYER ? SIDE_ENEMY : SIDE_PLAYER);
const emptyUnits = () => ({ militia: 0, archers: 0, knights: 0 });
const cloneUnits = (units) => ({ militia: Number(units?.militia || 0), archers: Number(units?.archers || 0), knights: Number(units?.knights || 0) });
const cloneCell = (cell) => ({ ...cell, units: cloneUnits(cell.units) });
const cloneBoard = (board) => board.map(cloneCell);
const countUnits = (units) => Object.values(units).reduce((sum, value) => sum + Number(value || 0), 0);
const isEmptyUnits = (units) => countUnits(units) <= 0;

function createRng(seed) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function chooseWeighted(rng, entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const roll = rng() * total;
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.id;
  }
  return entries[entries.length - 1]?.id || 'plains';
}

function indexToPoint(index) {
  return {
    row: Math.floor(index / GRID_SIZE),
    col: index % GRID_SIZE,
  };
}

function pointToIndex(row, col) {
  return row * GRID_SIZE + col;
}

function mirrorIndex(index) {
  return BOARD_SIZE - 1 - index;
}

function manhattanDistance(a, b) {
  const pointA = indexToPoint(a);
  const pointB = indexToPoint(b);
  return Math.abs(pointA.row - pointB.row) + Math.abs(pointA.col - pointB.col);
}

function getNeighbors(index) {
  const { row, col } = indexToPoint(index);
  const result = [];
  if (row > 0) result.push(pointToIndex(row - 1, col));
  if (row < GRID_SIZE - 1) result.push(pointToIndex(row + 1, col));
  if (col > 0) result.push(pointToIndex(row, col - 1));
  if (col < GRID_SIZE - 1) result.push(pointToIndex(row, col + 1));
  return result;
}

function getIndicesInRadius(index, radius) {
  const { row, col } = indexToPoint(index);
  const result = [];
  for (let targetRow = 0; targetRow < GRID_SIZE; targetRow += 1) {
    for (let targetCol = 0; targetCol < GRID_SIZE; targetCol += 1) {
      if (Math.abs(targetRow - row) + Math.abs(targetCol - col) <= radius) {
        result.push(pointToIndex(targetRow, targetCol));
      }
    }
  }
  return result;
}

function getUnitAttackPower(units) {
  return Object.entries(units).reduce(
    (sum, [unitId, count]) => sum + (UNIT_STATS[unitId]?.attack || 0) * count,
    0,
  );
}

function getUnitDefensePower(units) {
  return Object.entries(units).reduce(
    (sum, [unitId, count]) => sum + (UNIT_STATS[unitId]?.defense || 0) * count,
    0,
  );
}

function getUnitUpkeep(units) {
  return Object.entries(units).reduce(
    (sum, [unitId, count]) => sum + (UNIT_STATS[unitId]?.upkeep || 0) * count,
    0,
  );
}

function applyUnitPowerLoss(units, powerLoss, mode = 'defense') {
  const nextUnits = cloneUnits(units);
  let remaining = Math.max(0, Math.round(powerLoss));
  const order = ['militia', 'archers', 'knights'];

  for (const unitId of order) {
    const stat = UNIT_STATS[unitId];
    if (!stat) continue;
    const perUnit = mode === 'attack' ? stat.attack : stat.defense;
    while (nextUnits[unitId] > 0 && remaining > 0) {
      nextUnits[unitId] -= 1;
      remaining -= perUnit;
    }
  }

  return nextUnits;
}

function transferOccupationForce(board, attackerIds) {
  const nextBoard = cloneBoard(board);
  const occupation = emptyUnits();
  let moved = 0;
  const priorities = ['militia', 'archers', 'knights'];
  const orderedAttackers = [...attackerIds].sort(
    (leftId, rightId) => countUnits(nextBoard[rightId].units) - countUnits(nextBoard[leftId].units),
  );

  for (const attackerId of orderedAttackers) {
    const source = nextBoard[attackerId];
    for (const unitId of priorities) {
      while (source.units[unitId] > 0 && moved < 3 && countUnits(source.units) > 1) {
        source.units[unitId] -= 1;
        occupation[unitId] += 1;
        moved += 1;
      }
    }
    if (moved >= 3) break;
  }

  if (moved <= 0) occupation.militia = 1;

  return {
    board: nextBoard,
    occupation,
  };
}

function getTerrainScore(cell) {
  const terrain = TERRAIN_STATS[cell.terrain];
  if (!terrain) return 0;
  return terrain.gold * 2 + terrain.food * 2 + terrain.defense * 3;
}

function getStructureDefenseBonus(cell) {
  if (!cell.structure) return 0;
  const building = BUILDING_STATS[cell.structure];
  if (!building) return 0;
  if (cell.structure === 'capital') return building.defense;
  return building.defense + Math.max(0, cell.level - 1) * 2;
}

function getStructureYield(cell) {
  if (!cell.structure) return { gold: 0, food: 0 };
  const terrain = TERRAIN_STATS[cell.terrain];
  const levelBonus = Math.max(0, cell.level - 1);

  if (cell.structure === 'capital') {
    return {
      gold: BUILDING_STATS.capital.gold + levelBonus,
      food: BUILDING_STATS.capital.food + levelBonus,
    };
  }
  if (cell.structure === 'farm') {
    return { gold: 0, food: BUILDING_STATS.farm.food + terrain.farmBonus + levelBonus * 2 };
  }
  if (cell.structure === 'mine') {
    return { gold: BUILDING_STATS.mine.gold + terrain.mineBonus + levelBonus * 2, food: 0 };
  }
  if (cell.structure === 'fort') {
    return { gold: BUILDING_STATS.fort.gold + Math.floor(levelBonus / 2), food: 0 };
  }
  if (cell.structure === 'watchtower') {
    return { gold: BUILDING_STATS.watchtower.gold + Math.floor(levelBonus / 2), food: 0 };
  }
  return { gold: 0, food: 0 };
}

function getCellVisionRadius(cell) {
  const buildingReveal = cell.structure ? BUILDING_STATS[cell.structure]?.revealRadius || 0 : 0;
  const terrainReveal = cell.terrain === 'highland' ? 1 : 0;
  return 1 + buildingReveal + terrainReveal;
}

function getAttackSupportFromCell(cell) {
  let power = getUnitAttackPower(cell.units);
  if (cell.structure === 'fort') power += cell.level;
  if (cell.structure === 'watchtower') power += Math.max(0, cell.level - 1);
  return power;
}

function getDefensePower(cell) {
  const terrain = TERRAIN_STATS[cell.terrain];
  return getUnitDefensePower(cell.units) + terrain.defense * 2 + getStructureDefenseBonus(cell);
}

function getAssaultContext(state, side, targetId) {
  const board = state.board;
  const target = board[targetId];
  const enemySide = getOpponent(side);
  const attackerIds = getNeighbors(targetId).filter((neighborId) => {
    const neighbor = board[neighborId];
    return neighbor.owner === side && countUnits(neighbor.units) > 0;
  });
  const attackPower = attackerIds.reduce(
    (sum, attackerId) => sum + getAttackSupportFromCell(board[attackerId]),
    0,
  );
  const defensePower = getDefensePower(target);
  const capitalDamage = target.structure === 'capital'
    ? Math.max(0, Math.round(attackPower * 0.32 - defensePower * 0.1))
    : 0;

  return {
    target,
    enemySide,
    attackerIds,
    attackPower,
    defensePower,
    attackerLossPower: Math.max(1, Math.round(defensePower * (attackPower >= defensePower ? 0.38 : 0.62))),
    defenderLossPower: Math.max(1, Math.round(attackPower * (attackPower >= defensePower ? 0.92 : 0.48))),
    canBreakLine: attackPower >= defensePower,
    capitalDamage,
  };
}

function getVisibleCellIds(board, side) {
  const visible = new Set();
  board.forEach((cell, cellId) => {
    if (cell.owner !== side) return;
    const radius = getCellVisionRadius(cell);
    getIndicesInRadius(cellId, radius).forEach((targetId) => visible.add(targetId));
  });
  return visible;
}

function revealForPlayer(state, extraIds = []) {
  const nextState = {
    ...state,
    board: cloneBoard(state.board),
  };
  const visible = getVisibleCellIds(nextState.board, SIDE_PLAYER);
  extraIds.forEach((cellId) => visible.add(cellId));
  visible.forEach((cellId) => {
    nextState.board[cellId].seenByPlayer = true;
  });
  return nextState;
}

function revealAllForPlayer(state) {
  const nextState = {
    ...state,
    board: cloneBoard(state.board),
  };
  nextState.board.forEach((cell) => {
    cell.seenByPlayer = true;
  });
  return nextState;
}

function getCellIncome(board, side) {
  let goldIncome = 0;
  let foodIncome = 0;
  let upkeep = 0;
  board.forEach((cell) => {
    if (cell.owner !== side) return;
    const terrain = TERRAIN_STATS[cell.terrain];
    goldIncome += terrain.gold;
    foodIncome += terrain.food;
    const structureYield = getStructureYield(cell);
    goldIncome += structureYield.gold;
    foodIncome += structureYield.food;
    upkeep += getUnitUpkeep(cell.units);
  });
  return {
    goldIncome,
    foodIncome,
    upkeep,
    netFood: foodIncome - upkeep,
  };
}

function getCapitalId(board, side) {
  const found = board.find((cell) => cell.owner === side && cell.structure === 'capital');
  return found ? found.id : null;
}

function getFrontierIds(board, side) {
  return board
    .filter((cell) => cell.owner === side)
    .map((cell) => cell.id)
    .filter((cellId) => getNeighbors(cellId).some((neighborId) => board[neighborId].owner !== side));
}

function getExpandCost(cell) {
  return {
    gold: TERRAIN_STATS[cell.terrain].claimCost,
    food: 0,
  };
}

function getAssaultCost() {
  return { gold: 8, food: 2 };
}

function getBuildCost(cell, structureId) {
  const building = BUILDING_STATS[structureId];
  const currentLevel = cell.structure === structureId ? cell.level : 0;
  return {
    gold: building.baseCost + currentLevel * building.growthCost,
    food: 0,
  };
}

function getRecruitCost(unitId) {
  const unit = UNIT_STATS[unitId];
  return { gold: unit.goldCost, food: unit.foodCost };
}

function getScoutCost() {
  return { gold: 10, food: 0 };
}

function canAfford(sideState, cost) {
  return sideState.gold >= cost.gold && sideState.food >= cost.food && sideState.command > 0;
}

function spendCost(sideState, cost) {
  sideState.gold = clamp(sideState.gold - cost.gold, 0, MAX_RESOURCE);
  sideState.food = clamp(sideState.food - cost.food, 0, MAX_RESOURCE);
  sideState.command = Math.max(0, sideState.command - 1);
}

function getClaimGarrison(cell) {
  if (cell.terrain === 'village') return { militia: 2, archers: 0, knights: 0 };
  if (cell.terrain === 'ruins') return { militia: 1, archers: 1, knights: 0 };
  return { militia: 1, archers: 0, knights: 0 };
}

function getNeutralGuard(terrainId, distanceFromCenter) {
  if (terrainId === 'village') return { militia: 2 + (distanceFromCenter <= 2 ? 1 : 0), archers: distanceFromCenter <= 2 ? 1 : 0, knights: 0 };
  if (terrainId === 'ruins') return { militia: 1, archers: 1 + (distanceFromCenter <= 2 ? 1 : 0), knights: 0 };
  if (terrainId === 'highland') return { militia: 1 + (distanceFromCenter <= 2 ? 1 : 0), archers: 1, knights: 0 };
  if (terrainId === 'forest') return { militia: 2, archers: distanceFromCenter <= 2 ? 1 : 0, knights: 0 };
  if (terrainId === 'river') return { militia: 1, archers: 0, knights: 0 };
  return { militia: 1 + (distanceFromCenter <= 2 ? 1 : 0), archers: 0, knights: 0 };
}

function createBaseCell(id, terrain) {
  return {
    id,
    terrain,
    owner: null,
    structure: null,
    level: 0,
    units: emptyUnits(),
    seenByPlayer: false,
  };
}

function generateBoard(seed) {
  const rng = createRng(seed);
  const terrainPool = [
    { id: 'plains', weight: 3 },
    { id: 'forest', weight: 2 },
    { id: 'highland', weight: 1.5 },
    { id: 'village', weight: 1.8 },
    { id: 'ruins', weight: 1.2 },
    { id: 'river', weight: 2 },
  ];
  const board = Array.from({ length: BOARD_SIZE }, (_, id) => createBaseCell(id, 'plains'));

  for (let id = 0; id < BOARD_SIZE; id += 1) {
    const mirror = mirrorIndex(id);
    if (id > mirror) continue;
    const terrainId = chooseWeighted(rng, terrainPool);
    board[id].terrain = terrainId;
    board[mirror].terrain = terrainId;
  }

  const forcedTerrain = new Map([
    [PLAYER_CAPITAL_ID, 'plains'],
    [ENEMY_CAPITAL_ID, 'plains'],
    [6, 'village'],
    [mirrorIndex(6), 'village'],
    [13, 'ruins'],
    [mirrorIndex(13), 'ruins'],
    [8, 'forest'],
    [mirrorIndex(8), 'forest'],
    [14, 'river'],
    [mirrorIndex(14), 'river'],
    [20, 'highland'],
    [mirrorIndex(20), 'highland'],
  ]);

  forcedTerrain.forEach((terrainId, id) => {
    board[id].terrain = terrainId;
  });

  board.forEach((cell) => {
    if (cell.id === PLAYER_CAPITAL_ID || cell.id === ENEMY_CAPITAL_ID) return;
    const distanceFromCenter = manhattanDistance(cell.id, 17) + manhattanDistance(cell.id, 18);
    cell.units = getNeutralGuard(cell.terrain, distanceFromCenter);
  });

  board[PLAYER_CAPITAL_ID] = {
    ...board[PLAYER_CAPITAL_ID],
    owner: SIDE_PLAYER,
    structure: 'capital',
    level: 1,
    units: { militia: 3, archers: 1, knights: 0 },
    seenByPlayer: true,
  };
  board[6] = {
    ...board[6],
    owner: SIDE_PLAYER,
    structure: 'farm',
    level: 1,
    units: { militia: 2, archers: 0, knights: 0 },
    seenByPlayer: true,
  };
  board[13] = {
    ...board[13],
    owner: SIDE_PLAYER,
    structure: 'mine',
    level: 1,
    units: { militia: 1, archers: 1, knights: 0 },
    seenByPlayer: true,
  };
  board[ENEMY_CAPITAL_ID] = {
    ...board[ENEMY_CAPITAL_ID],
    owner: SIDE_ENEMY,
    structure: 'capital',
    level: 1,
    units: { militia: 3, archers: 1, knights: 0 },
  };
  board[mirrorIndex(6)] = {
    ...board[mirrorIndex(6)],
    owner: SIDE_ENEMY,
    structure: 'farm',
    level: 1,
    units: { militia: 2, archers: 0, knights: 0 },
  };
  board[mirrorIndex(13)] = {
    ...board[mirrorIndex(13)],
    owner: SIDE_ENEMY,
    structure: 'mine',
    level: 1,
    units: { militia: 1, archers: 1, knights: 0 },
  };

  return board;
}

function buildInitialState(difficultyId = DEFAULT_DIFFICULTY, seed = 1) {
  const difficulty = DIFFICULTY_SETTINGS[difficultyId] || DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY];
  const board = generateBoard(seed);
  const initialState = {
    version: GAME_VERSION,
    seed,
    difficulty: difficulty.id,
    turn: 1,
    currentSide: SIDE_PLAYER,
    winner: null,
    gameOverReason: '',
    tutorialOpen: true,
    tutorialIndex: 0,
    player: { gold: difficulty.startingGold, food: difficulty.startingFood, hp: 40, command: TURN_COMMAND_POINTS },
    enemy: { gold: difficulty.startingGold + difficulty.enemyOpeningBonusGold, food: difficulty.startingFood + difficulty.enemyOpeningBonusFood, hp: 40, command: 0 },
    board,
    log: [
      'Новая кампания началась. На ход доступно два приказа.',
      'Цель кампании: сломить столицу врага раньше, чем он прорвется к твоей.',
    ],
    enemyReport: [],
    turnReport: 'Ход 1. Сначала расширяйся и поднимай экономику.',
  };
  return revealForPlayer(initialState);
}

function normalizeSavedGame(rawState) {
  if (!rawState || typeof rawState !== 'object') return null;
  if (rawState.version !== GAME_VERSION) return null;
  if (!Array.isArray(rawState.board) || rawState.board.length !== BOARD_SIZE) return null;
  return rawState;
}

function loadSavedGame() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeSavedGame(JSON.parse(raw));
  } catch {
    return null;
  }
}

function loadPrefs() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { tutorialSeen: false, preferredDifficulty: DEFAULT_DIFFICULTY };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { tutorialSeen: false, preferredDifficulty: DEFAULT_DIFFICULTY };
    const parsed = JSON.parse(raw);
    return {
      tutorialSeen: Boolean(parsed?.tutorialSeen),
      preferredDifficulty: DIFFICULTY_SETTINGS[parsed?.preferredDifficulty]
        ? parsed.preferredDifficulty
        : DEFAULT_DIFFICULTY,
    };
  } catch {
    return { tutorialSeen: false, preferredDifficulty: DEFAULT_DIFFICULTY };
  }
}

function appendLog(log, entries) {
  const nextEntries = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  return [...nextEntries.reverse(), ...log].slice(0, MAX_LOG_ENTRIES);
}

function getOwnedCells(board, side) {
  return board.filter((cell) => cell.owner === side);
}

function getActionSpec(actionId, targetId) {
  const meta = ACTIONS[actionId];
  if (!meta) return null;
  if (meta.structure) return { type: 'build', structure: meta.structure, targetId };
  if (meta.unit) return { type: 'recruit', unit: meta.unit, targetId };
  if (actionId === 'expand') return { type: 'expand', targetId };
  if (actionId === 'assault') return { type: 'assault', targetId };
  if (actionId === 'scout') return { type: 'scout', targetId };
  return null;
}

function isSideDefeated(state, side) {
  return state[side].hp <= 0;
}

function createVictoryState(state, side, reason) {
  const nextState = {
    ...state,
    winner: side,
    currentSide: side,
    gameOverReason: reason,
    player: { ...state.player, command: 0 },
    enemy: { ...state.enemy, command: 0 },
  };
  return revealAllForPlayer(nextState);
}

function beginTurn(state, side, { incrementTurn = false } = {}) {
  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
    currentSide: side,
  };

  if (incrementTurn && side === SIDE_PLAYER) nextState.turn += 1;

  const sideState = nextState[side];
  const economy = getCellIncome(nextState.board, side);
  sideState.gold = clamp(sideState.gold + economy.goldIncome, 0, MAX_RESOURCE);
  const projectedFood = sideState.food + economy.foodIncome - economy.upkeep;
  let hungerDamage = 0;

  if (projectedFood < 0) {
    hungerDamage = 2 + Math.ceil(Math.abs(projectedFood) / 4);
    sideState.food = 0;
    sideState.hp = Math.max(0, sideState.hp - hungerDamage);
  } else {
    sideState.food = clamp(projectedFood, 0, MAX_RESOURCE);
  }

  sideState.command = TURN_COMMAND_POINTS;

  const sideLabel = side === SIDE_PLAYER ? 'Твой ход' : 'Ход соперника';
  const incomeLine = hungerDamage > 0
    ? `${sideLabel}: +${economy.goldIncome} золота, +${economy.foodIncome} еды, содержание ${economy.upkeep}. Голод наносит ${hungerDamage} урона столице.`
    : `${sideLabel}: +${economy.goldIncome} золота, +${economy.foodIncome} еды, содержание ${economy.upkeep}.`;
  nextState.log = appendLog(state.log, incomeLine);
  nextState.turnReport = incomeLine;

  if (isSideDefeated(nextState, side)) {
    return createVictoryState(
      nextState,
      getOpponent(side),
      hungerDamage > 0
        ? `Столица ${side === SIDE_PLAYER ? 'игрока' : 'соперника'} пала из-за истощения.`
        : `Столица ${side === SIDE_PLAYER ? 'игрока' : 'соперника'} разрушена.`,
    );
  }

  return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
}

function executeExpand(state, side, action) {
  const target = state.board[action.targetId];
  if (!target || target.owner !== null) return null;
  if (!getNeighbors(action.targetId).some((neighborId) => state.board[neighborId].owner === side)) return null;

  const cost = getExpandCost(target);
  if (!canAfford(state[side], cost)) return null;

  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
  };
  spendCost(nextState[side], cost);
  const nextTarget = nextState.board[action.targetId];
  nextTarget.owner = side;
  nextTarget.structure = null;
  nextTarget.level = 0;
  nextTarget.units = getClaimGarrison(nextTarget);

  const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} закреп${side === SIDE_PLAYER ? 'ился' : 'ился'} в ${TERRAIN_STATS[nextTarget.terrain].label.toLowerCase()}.`;
  nextState.log = appendLog(state.log, description);
  nextState.turnReport = description;
  return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
}

function executeBuild(state, side, action) {
  const target = state.board[action.targetId];
  if (!target || target.owner !== side) return null;
  if (target.structure === 'capital') return null;
  if (target.structure && target.structure !== action.structure) return null;
  if (target.structure === action.structure && target.level >= MAX_LEVEL) return null;

  const cost = getBuildCost(target, action.structure);
  if (!canAfford(state[side], cost)) return null;

  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
  };
  spendCost(nextState[side], cost);
  const nextTarget = nextState.board[action.targetId];
  if (nextTarget.structure === action.structure) {
    nextTarget.level += 1;
  } else {
    nextTarget.structure = action.structure;
    nextTarget.level = 1;
  }

  const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} ${nextTarget.level > 1 ? 'улучшил' : 'построил'} ${BUILDING_STATS[action.structure].label.toLowerCase()}.`;
  nextState.log = appendLog(state.log, description);
  nextState.turnReport = description;
  return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
}

function executeRecruit(state, side, action) {
  const target = state.board[action.targetId];
  if (!target || target.owner !== side) return null;

  const cost = getRecruitCost(action.unit);
  if (!canAfford(state[side], cost)) return null;

  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
  };
  spendCost(nextState[side], cost);
  nextState.board[action.targetId].units[action.unit] += UNIT_STATS[action.unit].recruitAmount;

  const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} пополнил гарнизон: ${UNIT_STATS[action.unit].label.toLowerCase()}.`;
  nextState.log = appendLog(state.log, description);
  nextState.turnReport = description;
  return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
}

function executeScout(state, side, action) {
  if (side !== SIDE_PLAYER) return null;
  const target = state.board[action.targetId];
  if (!target || target.owner !== side) return null;

  const cost = getScoutCost();
  if (!canAfford(state[side], cost)) return null;

  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
  };
  spendCost(nextState[side], cost);
  const radius = 2 + (target.structure === 'watchtower' ? target.level : 0) + (target.terrain === 'highland' ? 1 : 0);
  const revealIds = getIndicesInRadius(action.targetId, radius);
  revealIds.forEach((cellId) => {
    nextState.board[cellId].seenByPlayer = true;
  });
  const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} провел разведку и раскрыл новые подходы.`;
  nextState.log = appendLog(state.log, description);
  nextState.turnReport = description;
  return side === SIDE_PLAYER ? revealForPlayer(nextState, revealIds) : nextState;
}

function executeAssault(state, side, action) {
  const target = state.board[action.targetId];
  const enemySide = getOpponent(side);
  if (!target || target.owner !== enemySide) return null;
  if (!canAfford(state[side], getAssaultCost())) return null;

  const context = getAssaultContext(state, side, action.targetId);
  if (context.attackerIds.length <= 0 || context.attackPower <= 0) return null;

  const nextState = {
    ...state,
    board: cloneBoard(state.board),
    player: { ...state.player },
    enemy: { ...state.enemy },
  };
  spendCost(nextState[side], getAssaultCost());

  const batteredBoard = cloneBoard(nextState.board);
  const totalAttackPower = Math.max(1, context.attackPower);
  context.attackerIds.forEach((attackerId) => {
    const share = getAttackSupportFromCell(state.board[attackerId]) / totalAttackPower;
    const lossPower = Math.max(1, Math.round(context.attackerLossPower * share));
    batteredBoard[attackerId].units = applyUnitPowerLoss(batteredBoard[attackerId].units, lossPower, 'attack');
  });
  batteredBoard[action.targetId].units = applyUnitPowerLoss(
    batteredBoard[action.targetId].units,
    context.defenderLossPower,
    'defense',
  );
  nextState.board = batteredBoard;

  const nextTarget = nextState.board[action.targetId];
  if (nextTarget.structure === 'capital') {
    if (context.capitalDamage > 0) {
      nextState[enemySide].hp = Math.max(0, nextState[enemySide].hp - context.capitalDamage);
    }
    const description = context.capitalDamage > 0
      ? `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} нанес ${context.capitalDamage} урона столице противника.`
      : `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} попытался продавить столицу, но укрепления выдержали удар.`;
    nextState.log = appendLog(state.log, description);
    nextState.turnReport = description;

    if (nextState[enemySide].hp <= 0) {
      return createVictoryState(
        nextState,
        side,
        `Столица ${enemySide === SIDE_PLAYER ? 'игрока' : 'соперника'} уничтожена.`,
      );
    }
    return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
  }

  if (!isEmptyUnits(nextTarget.units) || !context.canBreakLine) {
    const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} провел штурм, но линия обороны пока держится.`;
    nextState.log = appendLog(state.log, description);
    nextState.turnReport = description;
    return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
  }

  const occupied = transferOccupationForce(nextState.board, context.attackerIds);
  nextState.board = occupied.board;
  const captured = nextState.board[action.targetId];
  captured.owner = side;
  if (captured.structure && captured.structure !== 'capital') {
    captured.level = Math.max(1, captured.level - 1);
  }
  captured.units = occupied.occupation;

  const description = `${side === SIDE_PLAYER ? 'Ты' : 'Враг'} захватил ${TERRAIN_STATS[captured.terrain].label.toLowerCase()}.`;
  nextState.log = appendLog(state.log, description);
  nextState.turnReport = description;
  return side === SIDE_PLAYER ? revealForPlayer(nextState) : nextState;
}

function executeAction(state, side, action) {
  if (!state || state.winner || state.currentSide !== side || state[side].command <= 0) return null;
  if (action.type === 'expand') return executeExpand(state, side, action);
  if (action.type === 'build') return executeBuild(state, side, action);
  if (action.type === 'recruit') return executeRecruit(state, side, action);
  if (action.type === 'scout') return executeScout(state, side, action);
  if (action.type === 'assault') return executeAssault(state, side, action);
  return null;
}

function getVisibleTargetsForSide(state, side) {
  if (side === SIDE_ENEMY) return new Set(state.board.map((cell) => cell.id));
  return getVisibleCellIds(state.board, SIDE_PLAYER);
}

function getLegalActions(state, side) {
  if (!state || state.winner || state.currentSide !== side || state[side].command <= 0) return [];
  const legal = [];
  const visibleIds = getVisibleTargetsForSide(state, side);
  const sideState = state[side];
  const enemySide = getOpponent(side);
  const frontierIds = getFrontierIds(state.board, side);
  const frontierSet = new Set(frontierIds);
  const capitalId = getCapitalId(state.board, side);

  state.board.forEach((cell) => {
    if (side === SIDE_PLAYER && !visibleIds.has(cell.id) && cell.owner !== SIDE_PLAYER) return;

    if (cell.owner === null) {
      if (getNeighbors(cell.id).some((neighborId) => state.board[neighborId].owner === side) && canAfford(sideState, getExpandCost(cell))) {
        legal.push({ type: 'expand', targetId: cell.id });
      }
      return;
    }

    if (cell.owner === enemySide) {
      const context = getAssaultContext(state, side, cell.id);
      if (context.attackerIds.length > 0 && canAfford(sideState, getAssaultCost())) {
        legal.push({ type: 'assault', targetId: cell.id });
      }
      return;
    }

    if (cell.structure !== 'capital') {
      ['farm', 'mine', 'fort', 'watchtower'].forEach((structureId) => {
        if (cell.structure && cell.structure !== structureId) return;
        if (cell.structure === structureId && cell.level >= MAX_LEVEL) return;
        if (canAfford(sideState, getBuildCost(cell, structureId))) {
          legal.push({ type: 'build', structure: structureId, targetId: cell.id });
        }
      });
    }

    const isRecruitHub = cell.id === capitalId || frontierSet.has(cell.id) || cell.structure === 'fort' || cell.structure === 'watchtower';
    if (isRecruitHub) {
      ['militia', 'archers', 'knights'].forEach((unitId) => {
        if (canAfford(sideState, getRecruitCost(unitId))) {
          legal.push({ type: 'recruit', unit: unitId, targetId: cell.id });
        }
      });
    }

    if (side === SIDE_PLAYER && canAfford(sideState, getScoutCost())) {
      const scoutIds = getIndicesInRadius(cell.id, 2 + (cell.structure === 'watchtower' ? cell.level : 0));
      if (scoutIds.some((targetId) => !state.board[targetId].seenByPlayer)) {
        legal.push({ type: 'scout', targetId: cell.id });
      }
    }
  });

  return legal;
}

function getEconomicStrength(board, side) {
  const economy = getCellIncome(board, side);
  return economy.goldIncome * 1.6 + economy.foodIncome * 1.2 - economy.upkeep * 1.4;
}

function getUnitStrength(board, side) {
  return board.reduce((sum, cell) => {
    if (cell.owner !== side) return sum;
    return sum + getUnitAttackPower(cell.units) * 1.2 + getUnitDefensePower(cell.units);
  }, 0);
}

function getStructureStrength(board, side) {
  return board.reduce((sum, cell) => {
    if (cell.owner !== side || !cell.structure) return sum;
    return sum + BUILDING_STATS[cell.structure].defense + cell.level * 3 + getTerrainScore(cell);
  }, 0);
}

function getCapitalPressure(board, side) {
  const enemyCapitalId = getCapitalId(board, getOpponent(side));
  if (enemyCapitalId === null) return 0;
  const context = getAssaultContext({ board }, side, enemyCapitalId);
  return context.attackPower - context.defensePower * 0.6 + context.capitalDamage * 6;
}

function getTerritoryProgress(board, side) {
  const enemyCapitalId = getCapitalId(board, getOpponent(side));
  return board.reduce((sum, cell) => {
    if (cell.owner !== side) return sum;
    const approach = enemyCapitalId === null ? 0 : Math.max(0, 8 - manhattanDistance(cell.id, enemyCapitalId));
    return sum + getTerrainScore(cell) + approach;
  }, 0);
}

function evaluateState(state) {
  if (state.winner === SIDE_ENEMY) return 100000 - state.turn * 50;
  if (state.winner === SIDE_PLAYER) return -100000 + state.turn * 50;

  const enemyTerritory = getOwnedCells(state.board, SIDE_ENEMY).length;
  const playerTerritory = getOwnedCells(state.board, SIDE_PLAYER).length;
  const enemyEconomy = getEconomicStrength(state.board, SIDE_ENEMY);
  const playerEconomy = getEconomicStrength(state.board, SIDE_PLAYER);
  const enemyUnits = getUnitStrength(state.board, SIDE_ENEMY);
  const playerUnits = getUnitStrength(state.board, SIDE_PLAYER);
  const enemyStructures = getStructureStrength(state.board, SIDE_ENEMY);
  const playerStructures = getStructureStrength(state.board, SIDE_PLAYER);
  const enemyPressure = getCapitalPressure(state.board, SIDE_ENEMY);
  const playerPressure = getCapitalPressure(state.board, SIDE_PLAYER);
  const enemyProgress = getTerritoryProgress(state.board, SIDE_ENEMY);
  const playerProgress = getTerritoryProgress(state.board, SIDE_PLAYER);

  let score = 0;
  score += (state.enemy.hp - state.player.hp) * 32;
  score += (enemyTerritory - playerTerritory) * 9;
  score += (enemyEconomy - playerEconomy) * 2.8;
  score += (enemyUnits - playerUnits) * 1.6;
  score += (enemyStructures - playerStructures) * 1.15;
  score += (enemyPressure - playerPressure) * 1.9;
  score += (enemyProgress - playerProgress) * 0.35;
  score += (state.enemy.gold - state.player.gold) * 0.28;
  score += (state.enemy.food - state.player.food) * 0.18;
  return score;
}

function describeAction(action) {
  if (action.type === 'expand') return 'захват региона';
  if (action.type === 'assault') return 'штурм';
  if (action.type === 'scout') return 'разведка';
  if (action.type === 'build') return BUILDING_STATS[action.structure]?.label.toLowerCase() || 'постройка';
  if (action.type === 'recruit') return UNIT_STATS[action.unit]?.label.toLowerCase() || 'вербовка';
  return 'маневр';
}

function rankActions(state, side, actions) {
  const baseline = evaluateState(state);
  return actions
    .map((action) => {
      const executed = executeAction(state, side, action);
      if (!executed) return null;
      const delta = evaluateState(executed) - baseline;
      let bonus = 0;

      if (action.type === 'assault') {
        const target = state.board[action.targetId];
        bonus += 18 + getTerrainScore(target);
        if (target.structure === 'capital') bonus += 80;
        if (target.structure === 'fort') bonus += 20;
      }

      if (action.type === 'expand') {
        bonus += 10 + getTerrainScore(state.board[action.targetId]);
      }

      if (action.type === 'build') {
        const target = state.board[action.targetId];
        if (action.structure === 'farm') bonus += TERRAIN_STATS[target.terrain].farmBonus * 6;
        if (action.structure === 'mine') bonus += TERRAIN_STATS[target.terrain].mineBonus * 6;
        if (action.structure === 'fort' && getNeighbors(target.id).some((neighborId) => state.board[neighborId].owner === getOpponent(side))) {
          bonus += 18;
        }
        if (action.structure === 'watchtower') bonus += 12;
      }

      if (action.type === 'recruit') {
        const frontier = getFrontierIds(state.board, side);
        if (frontier.includes(action.targetId)) bonus += 16;
        if (action.targetId === getCapitalId(state.board, side)) bonus += 8;
      }

      if (action.type === 'scout') {
        bonus += 6;
      }

      return {
        action,
        score: delta + bonus,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);
}

function applySequence(state, side, actions) {
  let nextState = state;
  for (const action of actions) {
    const executed = executeAction(nextState, side, action);
    if (!executed) return null;
    nextState = executed;
    if (nextState.winner || nextState[side].command <= 0) break;
  }
  return nextState;
}

function enumerateSequences(state, side, beamWidth) {
  const legal = rankActions(state, side, getLegalActions(state, side)).slice(0, beamWidth);
  const sequences = [[]];

  legal.forEach(({ action }) => {
    sequences.push([action]);
    const afterFirst = applySequence(state, side, [action]);
    if (!afterFirst || afterFirst.winner || afterFirst[side].command <= 0) return;
    const secondLegal = rankActions(afterFirst, side, getLegalActions(afterFirst, side)).slice(0, Math.max(3, beamWidth - 2));
    secondLegal.forEach(({ action: secondAction }) => {
      sequences.push([action, secondAction]);
    });
  });

  const unique = new Map();
  sequences.forEach((sequence) => {
    const key = sequence.map((action) => `${action.type}:${action.targetId}:${action.structure || action.unit || ''}`).join('|');
    if (!unique.has(key)) unique.set(key, sequence);
  });
  return Array.from(unique.values());
}

function searchTurn(state, side, depth, beamWidth) {
  if (depth <= 0 || state.winner) {
    return { score: evaluateState(state), sequence: [] };
  }

  const sequences = enumerateSequences(state, side, beamWidth);
  const maximizing = side === SIDE_ENEMY;
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestSequence = [];

  sequences.forEach((sequence) => {
    const afterSequence = applySequence(state, side, sequence);
    if (!afterSequence) return;

    let candidateScore;
    if (afterSequence.winner) {
      candidateScore = evaluateState(afterSequence);
    } else {
      const nextSide = getOpponent(side);
      const started = beginTurn(afterSequence, nextSide, { incrementTurn: nextSide === SIDE_PLAYER });
      candidateScore = searchTurn(started, nextSide, depth - 1, beamWidth).score;
    }

    if (maximizing ? candidateScore > bestScore : candidateScore < bestScore) {
      bestScore = candidateScore;
      bestSequence = sequence;
    }
  });

  if (!Number.isFinite(bestScore)) {
    return { score: evaluateState(state), sequence: [] };
  }

  return { score: bestScore, sequence: bestSequence };
}

function resolveEnemyTurn(state) {
  const difficulty = DIFFICULTY_SETTINGS[state.difficulty] || DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY];
  let nextState = beginTurn(state, SIDE_ENEMY);
  if (nextState.winner) return nextState;

  const searchResult = searchTurn(nextState, SIDE_ENEMY, difficulty.searchDepth, difficulty.beamWidth);
  const enemyReport = [];

  searchResult.sequence.forEach((action) => {
    if (nextState.winner || nextState.enemy.command <= 0) return;
    const executed = executeAction(nextState, SIDE_ENEMY, action);
    if (!executed) return;
    nextState = executed;
    enemyReport.push(describeAction(action));
  });

  if (enemyReport.length <= 0) {
    nextState.log = appendLog(nextState.log, 'Враг завершил ход без сильного размена и копит силу.');
    nextState.turnReport = 'Враг завершил ход осторожно.';
  }

  nextState.enemyReport = enemyReport.length > 0
    ? enemyReport.map((item, index) => `${index + 1}. ${item}`)
    : ['1. осторожный розыгрыш'];

  if (nextState.winner) return nextState;

  nextState = beginTurn(nextState, SIDE_PLAYER, { incrementTurn: true });
  return revealForPlayer(nextState);
}

function getActionPreview(state, actionId, targetId) {
  if (!state) return null;
  const actionSpec = getActionSpec(actionId, targetId);
  const cell = state.board[targetId];
  if (!cell || !actionSpec) return null;

  if (actionSpec.type === 'expand') {
    const cost = getExpandCost(cell);
    return {
      title: 'Захват региона',
      valid: Boolean(executeAction(state, SIDE_PLAYER, actionSpec)),
      lines: [
        `Цена: ${cost.gold} золота`,
        `После захвата: гарнизон ${countUnits(getClaimGarrison(cell))} ед.`,
        `Ценность клетки: ${getTerrainScore(cell)}`,
      ],
    };
  }

  if (actionSpec.type === 'assault') {
    const context = getAssaultContext(state, SIDE_PLAYER, targetId);
    return {
      title: 'Штурм',
      valid: Boolean(executeAction(state, SIDE_PLAYER, actionSpec)),
      lines: [
        `Сила штурма: ${context.attackPower}`,
        `Защита цели: ${context.defensePower}`,
        cell.structure === 'capital'
          ? `Потенциальный урон столице: ${context.capitalDamage}`
          : (context.canBreakLine ? 'Порог захвата достигнут' : 'Нужна еще поддержка фронта'),
      ],
    };
  }

  if (actionSpec.type === 'build') {
    const cost = getBuildCost(cell, actionSpec.structure);
    return {
      title: BUILDING_STATS[actionSpec.structure].label,
      valid: Boolean(executeAction(state, SIDE_PLAYER, actionSpec)),
      lines: [
        `Цена: ${cost.gold} золота`,
        `Местность: ${TERRAIN_STATS[cell.terrain].label}`,
        actionSpec.structure === 'farm'
          ? `Прирост еды: ${BUILDING_STATS.farm.food + TERRAIN_STATS[cell.terrain].farmBonus}`
          : actionSpec.structure === 'mine'
            ? `Прирост золота: ${BUILDING_STATS.mine.gold + TERRAIN_STATS[cell.terrain].mineBonus}`
            : actionSpec.structure === 'fort'
              ? `Защита гарнизона: +${BUILDING_STATS.fort.defense}`
              : `Обзор и контроль: +${BUILDING_STATS.watchtower.revealRadius} к радиусу`,
      ],
    };
  }

  if (actionSpec.type === 'recruit') {
    const unit = UNIT_STATS[actionSpec.unit];
    const cost = getRecruitCost(actionSpec.unit);
    return {
      title: unit.label,
      valid: Boolean(executeAction(state, SIDE_PLAYER, actionSpec)),
      lines: [
        `Цена: ${cost.gold} золота и ${cost.food} еды`,
        `Пополнение: +${unit.recruitAmount} ед.`,
        `Сила клетки вырастет на ${unit.attack * unit.recruitAmount}`,
      ],
    };
  }

  if (actionSpec.type === 'scout') {
    const radius = 2 + (cell.structure === 'watchtower' ? cell.level : 0) + (cell.terrain === 'highland' ? 1 : 0);
    return {
      title: 'Разведка',
      valid: Boolean(executeAction(state, SIDE_PLAYER, actionSpec)),
      lines: [
        'Цена: 10 золота',
        `Радиус открытия: ${radius}`,
        'Полезно, когда фронт упирается в туман войны.',
      ],
    };
  }

  return null;
}

function getHint(state) {
  if (!state) return '';
  const playerEconomy = getCellIncome(state.board, SIDE_PLAYER);
  const enemyCapitalId = getCapitalId(state.board, SIDE_ENEMY);
  const playerCapitalId = getCapitalId(state.board, SIDE_PLAYER);
  const enemyCapitalContext = enemyCapitalId === null ? null : getAssaultContext(state, SIDE_PLAYER, enemyCapitalId);
  const pressureOnPlayerCapital = playerCapitalId === null ? null : getAssaultContext(state, SIDE_ENEMY, playerCapitalId);

  if (state.winner === SIDE_PLAYER) return 'Кампания завершена победой. Можно сразу запускать новую карту или попробовать более сильный режим.';
  if (state.winner === SIDE_ENEMY) return 'Поражение здесь обычно лечится ранней экономикой и более плотной обороной подступов к столице.';
  if (state.player.command <= 0) return 'Приказы закончились. Можно завершать ход и смотреть, как соперник ответит на позицию.';
  if (pressureOnPlayerCapital && pressureOnPlayerCapital.attackPower >= pressureOnPlayerCapital.defensePower * 0.8) {
    return 'Столица под давлением. Усиливай ближние гарнизоны или ставь форт на подступах.';
  }
  if (playerEconomy.netFood < 2) return 'Еда на грани. Еще один-два хода без фермы, и столица начнет терять прочность.';
  if (state.player.gold < 18) return 'Золото проседает. Хорошая шахта сейчас сильнее еще одного рискованного штурма.';
  if (enemyCapitalContext && enemyCapitalContext.capitalDamage > 0) {
    return 'У тебя уже есть окно по столице врага. Сначала расчисти сектор, затем добивай цитадель.';
  }
  return 'Оптимальный темп почти всегда такой: регион -> экономика -> гарнизон -> давление по ключевой цели.';
}

function summarizeCell(cell, visible) {
  if (!cell) return [];
  const lines = [`${TERRAIN_STATS[cell.terrain].emoji} ${TERRAIN_STATS[cell.terrain].label}`];
  if (!visible && cell.owner !== SIDE_PLAYER) {
    lines.push('Точные силы сейчас скрыты туманом войны.');
    return lines;
  }
  lines.push(`Владелец: ${cell.owner === SIDE_PLAYER ? 'ты' : cell.owner === SIDE_ENEMY ? 'соперник' : 'никто'}`);
  lines.push(`Гарнизон: ${countUnits(cell.units)} ед. | атака ${getUnitAttackPower(cell.units)} | защита ${getUnitDefensePower(cell.units)}`);
  if (cell.structure) {
    lines.push(`Постройка: ${BUILDING_STATS[cell.structure].label}${cell.structure === 'capital' ? '' : ` ур. ${cell.level}`}`);
  } else {
    lines.push('Постройка: нет');
  }
  const income = getStructureYield(cell);
  if (cell.owner) {
    lines.push(`Доход клетки: +${TERRAIN_STATS[cell.terrain].gold + income.gold} золота, +${TERRAIN_STATS[cell.terrain].food + income.food} еды`);
  }
  return lines;
}

function formatResourceLine(cost) {
  const parts = [];
  if (cost.gold > 0) parts.push(`${cost.gold} золота`);
  if (cost.food > 0) parts.push(`${cost.food} еды`);
  return parts.length > 0 ? parts.join(' и ') : 'без стоимости';
}

function getActionCostLabel(actionId, state, targetId) {
  const actionSpec = getActionSpec(actionId, targetId);
  const cell = state?.board?.[targetId];
  if (!actionSpec || !cell) return '';
  if (actionSpec.type === 'expand') return formatResourceLine(getExpandCost(cell));
  if (actionSpec.type === 'assault') return formatResourceLine(getAssaultCost());
  if (actionSpec.type === 'scout') return formatResourceLine(getScoutCost());
  if (actionSpec.type === 'build') return formatResourceLine(getBuildCost(cell, actionSpec.structure));
  if (actionSpec.type === 'recruit') return formatResourceLine(getRecruitCost(actionSpec.unit));
  return '';
}

const BOARD_COLUMNS = Array.from({ length: GRID_SIZE }, (_, index) => String.fromCharCode(65 + index));

function getActionIdFromSpec(action) {
  if (!action) return null;
  if (action.type === 'build') return action.structure;
  if (action.type === 'recruit') return action.unit;
  return action.type;
}

function getActionKey(action) {
  return `${action.type}:${action.targetId}:${action.structure || ''}:${action.unit || ''}`;
}

function formatCellCoordinate(cellId) {
  const { row, col } = indexToPoint(cellId);
  return `${BOARD_COLUMNS[col]}${row + 1}`;
}

function getOwnerLabel(owner) {
  if (owner === SIDE_PLAYER) return 'Твои владения';
  if (owner === SIDE_ENEMY) return 'Соперник';
  return 'Нейтральная территория';
}

function getOwnerBadgeClasses(owner) {
  if (owner === SIDE_PLAYER) return 'border-emerald-300/30 bg-emerald-400/15 text-emerald-50';
  if (owner === SIDE_ENEMY) return 'border-rose-300/30 bg-rose-400/15 text-rose-50';
  return 'border-white/10 bg-white/5 text-slate-100';
}

function formatRecommendedAction(state, action) {
  if (!state || !action) return '';
  const actionId = getActionIdFromSpec(action);
  const actionLabel = ACTIONS[actionId]?.label || describeAction(action);
  const cell = state.board[action.targetId];
  if (!cell) return actionLabel;
  return `${actionLabel} на ${formatCellCoordinate(action.targetId)} (${TERRAIN_STATS[cell.terrain].label.toLowerCase()})`;
}

function getCellFocusMessage(state, cell, visible, availableActions) {
  if (!state || !cell) return 'Выбери клетку на карте, чтобы получить разбор позиции.';
  if (state.winner === SIDE_PLAYER) return 'Кампания завершена победой. Можно сразу поднять сложность или запустить новую карту.';
  if (state.winner === SIDE_ENEMY) return 'Поражение. На следующей партии обычно помогает более ранняя экономика и плотнее собранный фронт.';
  if (state.player.command <= 0) return 'Приказы на этот ход закончились. Заверши ход и посмотри на ответ соперника.';

  if (cell.owner === SIDE_PLAYER) {
    if (availableActions.length > 0) {
      return 'Это твоя клетка. В панели приказов ниже показываются именно те действия, которые реально доступны здесь сейчас.';
    }
    if (getFrontierIds(state.board, SIDE_PLAYER).includes(cell.id)) {
      return 'Это фронтовая клетка. Обычно её усиливают гарнизоном, фортом или башней, когда хватает ресурсов.';
    }
    return 'Это внутренняя территория. Здесь чаще всего развивают экономику и копят резерв под будущий фронт.';
  }

  if (cell.owner === SIDE_ENEMY) {
    if (!visible) {
      return 'Сектор скрыт туманом войны: местность известна, но точная текущая сила и постройки могут уже измениться.';
    }
    const context = getAssaultContext(state, SIDE_PLAYER, cell.id);
    if (availableActions.length > 0) {
      return 'Это вражеская клетка. Штурм считается от силы соседних твоих гарнизонов и не зависит от случайности.';
    }
    if (context.attackerIds.length <= 0) {
      return 'Штурм невозможен: у цели нет соседних твоих гарнизонов, которые могли бы дать поддержку фронту.';
    }
    return 'Враг рядом, но сейчас либо не хватает ресурсов на приказ, либо удар ещё слишком слаб для прорыва.';
  }

  if (getNeighbors(cell.id).some((neighborId) => state.board[neighborId].owner === SIDE_PLAYER)) {
    return availableActions.length > 0
      ? 'Нейтральный сектор на границе. Его можно сразу занять приказом и получить стартовый гарнизон.'
      : 'Сектор стоит на твоей границе, но для захвата прямо сейчас не хватает золота.';
  }

  return 'Это дальний нейтральный сектор. Сначала нужно подвести к нему свои границы.';
}

function Panel({ children, className = '' }) {
  return (
    <section className={`rounded-[28px] border border-white/10 bg-slate-950/65 p-4 shadow-[0_20px_55px_rgba(2,6,23,0.38)] backdrop-blur-md ${className}`}>
      {children}
    </section>
  );
}

function StatCard({ label, value, sublabel, icon: Icon, className = '' }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/5 p-3 ${className}`}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300/80">
        {Icon ? <Icon size={14} /> : null}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-slate-300/70">{sublabel}</div> : null}
    </div>
  );
}

function CommandButton({ actionId, active, onClick, detail, available, recommended = false }) {
  const action = ACTIONS[actionId];
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={`rounded-3xl border px-3 py-3 text-left transition-colors ${
        !available
          ? 'border-white/10 bg-white/[0.03] text-slate-500'
          : active
            ? 'border-amber-300/70 bg-amber-300/20 text-white shadow-[0_0_0_1px_rgba(252,211,77,0.25)]'
            : 'border-white/10 bg-white/5 text-slate-100 hover:border-white/20 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold">
          <Icon size={15} />
          <span>{action.label}</span>
        </div>
        {recommended && available ? (
          <span className="rounded-full border border-amber-300/30 bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            совет
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-300/75">{detail || action.description}</div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400/75">
        {available ? 'Нажми, чтобы сыграть на выбранной клетке' : 'Недоступно для выбранной клетки'}
      </div>
    </button>
  );
}

function DifficultyCard({ difficulty, active, onStart }) {
  const classes = active
    ? 'border-amber-300/70 bg-amber-300/15'
    : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10';

  return (
    <button
      type="button"
      onClick={() => onStart(difficulty.id)}
      className={`rounded-[28px] border p-4 text-left transition-colors ${classes}`}
    >
      <div className="text-sm font-black uppercase tracking-[0.16em] text-white">{difficulty.label}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-300/80">{difficulty.description}</div>
      <div className="mt-3 text-xs text-slate-300/60">
        {`Поиск: ${difficulty.searchDepth} полухода · ширина ${difficulty.beamWidth}`}
      </div>
    </button>
  );
}

function SetupOverlay({ preferredDifficulty, onStart, onClose, tutorialSeen, hasActiveGame = false }) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/88 px-4 py-6 text-slate-50 backdrop-blur-md">
      <div className="mx-auto max-w-md space-y-4">
        <Panel className="overflow-hidden bg-gradient-to-br from-slate-950/85 via-slate-900/80 to-amber-950/35">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
            <Sparkles size={13} />
            <span>{hasActiveGame ? 'Меню кампании' : 'Standalone /game'}</span>
          </div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Pocket Kingdom: Warfront</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-200/80">
            Финальная мобильная мини-стратегия: экономика, разведка, укрепления, deterministic-бой и ИИ,
            который просчитывает несколько полуходов вперед.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-200/70">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">2 приказа за ход</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Автосохранение</div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">Поисковый ИИ</div>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/70">Сложность</div>
              <div className="mt-1 text-lg font-black text-white">Выбери режим кампании</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300/80">
              {tutorialSeen ? 'гайд уже виден' : 'гайд откроется'}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-3 text-sm leading-relaxed text-slate-100/85">
            Нажми на карточку сложности ниже, и кампания стартует сразу.
            Кнопка снизу оставлена как запасной вариант.
          </div>
          <div className="mt-4 space-y-3">
            {Object.values(DIFFICULTY_SETTINGS).map((difficulty) => (
              <DifficultyCard
                key={difficulty.id}
                difficulty={difficulty}
                active={difficulty.id === preferredDifficulty}
                onStart={onStart}
              />
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => onStart(preferredDifficulty)} className="flex-1 rounded-2xl py-5 text-base font-black">
              <Play className="h-4 w-4" />
              <span>{`${hasActiveGame ? 'Новая кампания' : 'Начать кампанию'}: ${(DIFFICULTY_SETTINGS[preferredDifficulty] || DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY]).label}`}</span>
            </Button>
            {hasActiveGame ? (
              <Button onClick={onClose} variant="secondary" className="rounded-2xl bg-white/90 text-slate-950 hover:bg-white">
                Продолжить
              </Button>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/70">Как побеждать</div>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-200/80">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="font-bold text-white">1. Ранний темп строится от дохода</div>
              <div className="mt-1">Первые ходы почти всегда сильнее через ферму или шахту, чем через лишний рискованный штурм.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="font-bold text-white">2. Считай соседние гарнизоны</div>
              <div className="mt-1">Штурм работает силой всех соседних клеток. Один форт и пара лучников часто решают исход фронта.</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="font-bold text-white">3. Не игнорируй туман войны</div>
              <div className="mt-1">Башни и разведка нужны не для красоты: без информации ИИ начнет выигрывать темп и фланги.</div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function MobileStrategyGame() {
  const [preferredDifficulty, setPreferredDifficulty] = useState(() => loadPrefs().preferredDifficulty);
  const [tutorialSeen, setTutorialSeen] = useState(() => loadPrefs().tutorialSeen);
  const [gameState, setGameState] = useState(() => {
    const saved = loadSavedGame();
    if (saved) return saved;
    const prefs = loadPrefs();
    const nextState = buildInitialState(prefs.preferredDifficulty, Date.now());
    nextState.tutorialOpen = !prefs.tutorialSeen;
    return nextState;
  });
  const [setupOpen, setSetupOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState('orders');
  const [selectedAction, setSelectedAction] = useState('expand');
  const [selectedCellId, setSelectedCellId] = useState(PLAYER_CAPITAL_ID);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
      if (gameState) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // no-op
    }
  }, [gameState]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify({
        tutorialSeen,
        preferredDifficulty,
      }));
    } catch {
      // no-op
    }
  }, [tutorialSeen, preferredDifficulty]);

  const visibleIds = useMemo(() => {
    if (!gameState) return new Set();
    return getVisibleCellIds(gameState.board, SIDE_PLAYER);
  }, [gameState]);

  const legalActions = useMemo(() => {
    if (!gameState) return [];
    return getLegalActions(gameState, SIDE_PLAYER);
  }, [gameState]);

  const rankedLegalActions = useMemo(() => {
    if (!gameState) return [];
    return rankActions(gameState, SIDE_PLAYER, legalActions);
  }, [gameState, legalActions]);

  const actionableCellIds = useMemo(() => new Set(legalActions.map((action) => action.targetId)), [legalActions]);

  const selectedCell = gameState ? gameState.board[selectedCellId] : null;
  const selectedCellVisible = selectedCell ? (selectedCell.owner === SIDE_PLAYER || visibleIds.has(selectedCell.id)) : false;
  const selectedCellKnown = selectedCell ? (selectedCell.owner === SIDE_PLAYER || selectedCell.seenByPlayer) : false;

  const selectedCellActions = useMemo(() => {
    if (!selectedCell) return [];
    const scores = new Map(rankedLegalActions.map((item) => [getActionKey(item.action), item.score]));
    return legalActions
      .filter((action) => action.targetId === selectedCell.id)
      .sort((left, right) => (scores.get(getActionKey(right)) || 0) - (scores.get(getActionKey(left)) || 0));
  }, [legalActions, rankedLegalActions, selectedCell]);

  const selectedCellActionMap = useMemo(() => {
    const map = new Map();
    selectedCellActions.forEach((action) => {
      const actionId = getActionIdFromSpec(action);
      if (actionId) map.set(actionId, action);
    });
    return map;
  }, [selectedCellActions]);

  const actionPreview = useMemo(() => {
    if (!gameState || typeof selectedCellId !== 'number') return null;
    return getActionPreview(gameState, selectedAction, selectedCellId);
  }, [gameState, selectedAction, selectedCellId]);

  const bestAction = rankedLegalActions[0]?.action || null;
  const bestActionText = useMemo(() => formatRecommendedAction(gameState, bestAction), [gameState, bestAction]);
  const selectedCellMessage = useMemo(
    () => getCellFocusMessage(gameState, selectedCell, selectedCellVisible, selectedCellActions),
    [gameState, selectedCell, selectedCellVisible, selectedCellActions],
  );
  const selectionPrompt = useMemo(() => {
    if (!gameState || !selectedCell) return '';
    if (gameState.winner) return gameState.gameOverReason;
    if (gameState.player.command <= 0) return 'Приказы на ход закончились. Можно завершать ход.';
    if (selectedCellActions.length > 0) {
      return `Клетка ${formatCellCoordinate(selectedCell.id)} готова к приказу. Выбирай действие в панели ниже.`;
    }
    if (actionableCellIds.size > 0) {
      return 'На выбранной клетке действий нет. На карте подсвечены клетки, где приказ доступен прямо сейчас.';
    }
    return 'Свободных приказов не осталось или не хватает ресурсов.';
  }, [actionableCellIds, gameState, selectedCell, selectedCellActions]);

  const hint = useMemo(() => getHint(gameState), [gameState]);
  const playerEconomy = useMemo(() => (gameState ? getCellIncome(gameState.board, SIDE_PLAYER) : null), [gameState]);
  const enemyEconomy = useMemo(() => (gameState ? getCellIncome(gameState.board, SIDE_ENEMY) : null), [gameState]);
  const currentDifficulty = gameState
    ? (DIFFICULTY_SETTINGS[gameState.difficulty] || DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY])
    : (DIFFICULTY_SETTINGS[preferredDifficulty] || DIFFICULTY_SETTINGS[DEFAULT_DIFFICULTY]);

  const startCampaign = (difficultyId) => {
    const nextDifficulty = DIFFICULTY_SETTINGS[difficultyId] ? difficultyId : DEFAULT_DIFFICULTY;
    const nextState = buildInitialState(nextDifficulty, Date.now());
    nextState.tutorialOpen = !tutorialSeen;
    setPreferredDifficulty(nextDifficulty);
    setSelectedGroup('orders');
    setSelectedAction('expand');
    setSelectedCellId(PLAYER_CAPITAL_ID);
    setGameState(nextState);
    setSetupOpen(false);
  };

  const restartCampaign = () => {
    if (!gameState) {
      startCampaign(preferredDifficulty);
      return;
    }
    startCampaign(gameState.difficulty);
  };

  const goToDifficultyMenu = () => {
    setSetupOpen(true);
  };

  const closeTutorial = () => {
    if (!gameState) return;
    setTutorialSeen(true);
    setGameState({ ...gameState, tutorialOpen: false });
  };

  const handleTutorialNext = () => {
    if (!gameState) return;
    if (gameState.tutorialIndex >= GUIDE_STEPS.length - 1) {
      closeTutorial();
      return;
    }
    setGameState({ ...gameState, tutorialIndex: gameState.tutorialIndex + 1 });
  };

  const handleCellSelect = (cellId) => {
    setSelectedCellId(cellId);
  };

  const handleCommandClick = (actionId) => {
    if (!gameState || !selectedCell) return;
    setSelectedAction(actionId);
    if (gameState.winner || gameState.currentSide !== SIDE_PLAYER) return;
    const actionSpec = selectedCellActionMap.get(actionId);
    if (!actionSpec) return;
    const executed = executeAction(gameState, SIDE_PLAYER, actionSpec);
    if (!executed) return;
    setGameState(executed);
  };

  const handleEndTurn = () => {
    if (!gameState || gameState.winner || gameState.currentSide !== SIDE_PLAYER) return;
    setGameState(resolveEnemyTurn({ ...gameState, enemyReport: [] }));
  };

  const winnerLabel = gameState.winner === SIDE_PLAYER
    ? 'Победа'
    : gameState.winner === SIDE_ENEMY
      ? 'Поражение'
      : '';
  const playerCells = getOwnedCells(gameState.board, SIDE_PLAYER).length;
  const enemyCells = getOwnedCells(gameState.board, SIDE_ENEMY).length;
  const visibleCount = gameState.board.filter((cell) => cell.seenByPlayer).length;
  const assaultContext = selectedCell ? getAssaultContext(gameState, SIDE_PLAYER, selectedCell.id) : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_rgba(15,23,42,0.96)_42%),linear-gradient(180deg,_#0f172a_0%,_#020617_100%)] px-3 py-4 text-slate-50 sm:px-4 sm:py-6">
      <div className="mx-auto max-w-md space-y-4">
        {setupOpen ? (
          <SetupOverlay
            preferredDifficulty={preferredDifficulty}
            onStart={startCampaign}
            onClose={() => setSetupOpen(false)}
            tutorialSeen={tutorialSeen}
            hasActiveGame
          />
        ) : null}
        <Panel className="overflow-hidden bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-amber-950/30">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                <BrainCircuit size={13} />
                <span>{`${currentDifficulty.label} · поисковый ИИ`}</span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white">Pocket Kingdom</h1>
              <div className="mt-1 text-sm text-slate-200/80">Warfront / мобильная тактическая кампания с понятным ходом</div>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={restartCampaign} variant="secondary" className="rounded-2xl bg-white/90 text-slate-950 hover:bg-white">
                <RotateCcw className="h-4 w-4" />
                <span>Заново</span>
              </Button>
              <Button onClick={goToDifficultyMenu} variant="ghost" className="rounded-2xl border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
                <Home className="h-4 w-4" />
                <span>Меню</span>
              </Button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Ход" value={gameState.turn} sublabel={gameState.turnReport} icon={Play} />
            <StatCard label="Туман" value={`${visibleCount}/${BOARD_SIZE}`} sublabel="клеток открыто" icon={Eye} />
            <StatCard label="Твои земли" value={playerCells} sublabel={`Столица: ${gameState.player.hp} HP`} icon={Castle} />
            <StatCard label="Земли врага" value={enemyCells} sublabel={`Столица: ${gameState.enemy.hp} HP`} icon={Bot} />
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300/75">
              <Sparkles size={13} />
              <span>Что делать сейчас</span>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-100/90">{hint}</div>
            {bestActionText ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/90">Рекомендуемый ход</div>
                <div className="mt-2 text-sm font-bold text-white">{bestActionText}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-100/75">
                  {bestAction ? `Подсвеченная золотом клетка показывает лучший приказ по текущей позиции.` : 'Выбери клетку на карте и проверь доступные действия.'}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Золото" value={gameState.player.gold} sublabel={playerEconomy ? `+${playerEconomy.goldIncome}/ход` : ''} icon={Coins} className="bg-amber-300/10" />
          <StatCard label="Еда" value={gameState.player.food} sublabel={playerEconomy ? `${playerEconomy.netFood >= 0 ? '+' : ''}${playerEconomy.netFood} net` : ''} icon={Wheat} className="bg-lime-300/10" />
        </div>

        {gameState.tutorialOpen ? (
          <Panel className="border-amber-300/25 bg-amber-400/10">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-amber-100">
              <BookOpen size={16} />
              <span>Боевой гайд</span>
            </div>
            <div className="mt-4 rounded-3xl border border-amber-200/15 bg-slate-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-black text-white">{GUIDE_STEPS[gameState.tutorialIndex].title}</div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/75">{`${gameState.tutorialIndex + 1}/${GUIDE_STEPS.length}`}</div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-100/85">{GUIDE_STEPS[gameState.tutorialIndex].text}</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {GUIDE_STEPS.map((_, index) => (
                  <div key={`guide-step-${index}`} className={`h-2 rounded-full ${index <= gameState.tutorialIndex ? 'bg-amber-300' : 'bg-white/10'}`} />
                ))}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={closeTutorial} variant="secondary" className="flex-1 rounded-2xl bg-white/90 text-slate-950 hover:bg-white">
                Пропустить
              </Button>
              <Button onClick={handleTutorialNext} className="flex-1 rounded-2xl font-bold">
                {gameState.tutorialIndex >= GUIDE_STEPS.length - 1 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>К игре</span>
                  </>
                ) : (
                  <>
                    <span>Дальше</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </Panel>
        ) : null}

        {gameState.enemyReport.length > 0 ? (
          <Panel>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/75">
              <BrainCircuit size={14} />
              <span>Последний план ИИ</span>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-100/85">
              {gameState.enemyReport.map((line) => (
                <div key={line} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">{line}</div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="p-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-100/85">
            {selectionPrompt}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200/75">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Шаг 1: тапни по клетке</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Шаг 2: сыграй приказ ниже</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Голубая рамка: выбранная клетка</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Белая точка: доступен ход</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2">Золото: лучший ход</div>
          </div>

          <div className="mt-4 grid grid-cols-6 gap-2">
            {gameState.board.map((cell) => {
              const terrain = TERRAIN_STATS[cell.terrain];
              const fullyVisible = cell.owner === SIDE_PLAYER || visibleIds.has(cell.id);
              const seen = cell.seenByPlayer;
              const actionable = actionableCellIds.has(cell.id) && !gameState.winner && gameState.currentSide === SIDE_PLAYER;
              const recommended = bestAction?.targetId === cell.id;
              const selected = selectedCellId === cell.id;
              const ownerTint = cell.owner === SIDE_PLAYER
                ? 'border-emerald-300/60 bg-emerald-400/18'
                : cell.owner === SIDE_ENEMY
                  ? 'border-rose-300/55 bg-rose-400/16'
                  : 'border-white/10 bg-white/5';
              const hiddenTint = seen ? 'border-slate-600/70 bg-slate-900/75' : 'border-slate-800 bg-slate-950';
              const ringTint = selected ? 'ring-2 ring-cyan-300/80' : '';
              const totalUnits = countUnits(cell.units);

              return (
                <button
                  key={`board-cell-${cell.id}`}
                  type="button"
                  onClick={() => handleCellSelect(cell.id)}
                  className={`relative aspect-square overflow-hidden rounded-2xl border text-[10px] transition active:scale-[0.98] ${fullyVisible ? ownerTint : hiddenTint} ${ringTint}`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${terrain.palette}`} />
                  <div className="absolute left-1 top-1 rounded-full bg-slate-950/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-100/85">
                    {formatCellCoordinate(cell.id)}
                  </div>
                  {actionable ? (
                    <div className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-950/60">
                      <span className={`h-2 w-2 rounded-full ${recommended ? 'bg-amber-300' : 'bg-white/85'}`} />
                    </div>
                  ) : null}
                  <div className={`relative flex h-full flex-col items-center justify-center px-1 ${!fullyVisible && seen ? 'opacity-70' : ''}`}>
                    {!seen && !fullyVisible ? (
                      <>
                        <div className="text-lg">🌫️</div>
                        <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-slate-300/75">неизв.</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg leading-none">{fullyVisible && cell.structure ? BUILDING_STATS[cell.structure].emoji : terrain.emoji}</div>
                        <div className="mt-1 text-[9px] font-bold leading-tight text-white">
                          {fullyVisible && cell.structure ? BUILDING_STATS[cell.structure].label.slice(0, 3) : terrain.label.slice(0, 3)}
                        </div>
                        <div className="mt-1 text-[9px] text-slate-100/80">{fullyVisible ? (totalUnits > 0 ? `⚔ ${totalUnits}` : '·') : 'туман'}</div>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="rounded-3xl border border-white/10 bg-slate-950/45 px-4 py-3 text-sm leading-relaxed text-slate-100/85">
            {selectedCellMessage}
          </div>

          <div className="flex flex-wrap gap-2">
            {COMMAND_GROUPS.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  setSelectedGroup(group.id);
                  if (!group.actions.includes(selectedAction)) setSelectedAction(group.actions[0]);
                }}
                className={`rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                  selectedGroup === group.id ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-200/80 hover:bg-white/10'
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {COMMAND_GROUPS.find((group) => group.id === selectedGroup)?.actions.map((actionId) => (
              <CommandButton
                key={actionId}
                actionId={actionId}
                active={selectedAction === actionId}
                available={selectedCellActionMap.has(actionId)}
                recommended={bestAction ? getActionIdFromSpec(bestAction) === actionId && bestAction.targetId === selectedCell?.id : false}
                onClick={() => handleCommandClick(actionId)}
                detail={selectedCell && selectedCellActionMap.has(actionId)
                  ? getActionCostLabel(actionId, gameState, selectedCell.id) || ACTIONS[actionId].description
                  : ACTIONS[actionId].description}
              />
            ))}
          </div>

          <Button onClick={handleEndTurn} className="mt-4 w-full rounded-2xl py-5 text-base font-black" disabled={gameState.winner || gameState.currentSide !== SIDE_PLAYER}>
            <Play className="h-4 w-4" />
            <span>Закончить ход</span>
          </Button>
          <div className="mt-2 text-xs leading-relaxed text-slate-400/80">
            Панель приказов всегда работает от выбранной клетки. Если кнопка серая, для этого сектора действие сейчас недоступно.
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200/85">
                  {selectedCell ? formatCellCoordinate(selectedCell.id) : '—'}
                </span>
                <span className={`rounded-full border px-3 py-1 ${getOwnerBadgeClasses(selectedCellVisible || selectedCell?.owner === SIDE_PLAYER ? selectedCell?.owner : null)}`}>
                  {selectedCell
                    ? (selectedCellVisible || selectedCell.owner === SIDE_PLAYER ? getOwnerLabel(selectedCell.owner) : 'Туман войны')
                    : 'Нет выбора'}
                </span>
              </div>
              <div className="mt-1 text-xl font-black text-white">
                {selectedCell
                  ? selectedCellKnown
                    ? `${TERRAIN_STATS[selectedCell.terrain].emoji} ${TERRAIN_STATS[selectedCell.terrain].label}`
                    : 'Неизвестный сектор'
                  : 'Нет выбора'}
              </div>
            </div>
            {winnerLabel ? (
              <div className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] ${
                gameState.winner === SIDE_PLAYER ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-400/20 text-rose-100'
              }`}>
                {winnerLabel}
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
            {selectedCell ? (
              <div className="space-y-2 text-sm text-slate-100/85">
                <div className="font-semibold text-slate-100/90">
                  {selectedCellKnown
                    ? selectedCellVisible || selectedCell.owner === SIDE_PLAYER
                      ? selectedCell.structure
                        ? `${BUILDING_STATS[selectedCell.structure].label}${selectedCell.structure === 'capital' ? '' : ` · ур. ${selectedCell.level}`}`
                        : 'Построек нет'
                      : 'Текущая постройка скрыта туманом войны.'
                    : 'Местность откроется после разведки.'}
                </div>
                {summarizeCell(selectedCell, selectedCellVisible).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-300/70">Тапни по клетке, чтобы получить разбор позиции.</div>
            )}
          </div>

          {actionPreview ? (
            <div className="mt-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/90">
                <Target size={14} />
                <span>{actionPreview.title}</span>
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-slate-100/85">
                {actionPreview.lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
              {!actionPreview.valid ? (
                <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200/80">
                  Сейчас этот приказ сюда не применяется
                </div>
              ) : null}
            </div>
          ) : null}

          {selectedAction === 'assault' && selectedCell && selectedCell.owner === SIDE_ENEMY && selectedCellVisible && assaultContext ? (
            <div className="mt-4 rounded-3xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-slate-100/85">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-100/85">Разбор штурма</div>
              <div className="mt-3">{`Поддержка фронта: ${assaultContext.attackPower}`}</div>
              <div>{`Суммарная защита: ${assaultContext.defensePower}`}</div>
              <div>{selectedCell.structure === 'capital' ? `Потенциальный урон столице: ${assaultContext.capitalDamage}` : assaultContext.canBreakLine ? 'Шанс на прорыв высокий.' : 'Нужна еще одна сильная клетка рядом.'}</div>
            </div>
          ) : null}
        </Panel>

        <div className="grid grid-cols-2 gap-3">
          <Panel className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/70">Твоя экономика</div>
            <div className="mt-3 space-y-2 text-sm text-slate-100/85">
              <div>{`Доход золота: +${playerEconomy?.goldIncome || 0}`}</div>
              <div>{`Доход еды: +${playerEconomy?.foodIncome || 0}`}</div>
              <div>{`Содержание армии: ${playerEconomy?.upkeep || 0}`}</div>
            </div>
          </Panel>
          <Panel className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/70">Темп врага</div>
            <div className="mt-3 space-y-2 text-sm text-slate-100/85">
              <div>{`Доход золота: +${enemyEconomy?.goldIncome || 0}`}</div>
              <div>{`Доход еды: +${enemyEconomy?.foodIncome || 0}`}</div>
              <div>{`Содержание армии: ${enemyEconomy?.upkeep || 0}`}</div>
            </div>
          </Panel>
        </div>

        <Panel>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300/70">
            {gameState.winner === SIDE_PLAYER ? <CheckCircle2 size={14} /> : gameState.winner === SIDE_ENEMY ? <Skull size={14} /> : <Sparkles size={14} />}
            <span>Журнал кампании</span>
          </div>
          <div className="mt-3 space-y-2 text-sm text-slate-100/85">
            {gameState.log.map((entry, index) => (
              <div key={`${entry}-${index}`} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">{entry}</div>
            ))}
          </div>
        </Panel>

        {gameState.winner ? (
          <Panel className={`${gameState.winner === SIDE_PLAYER ? 'border-emerald-300/20 bg-emerald-400/10' : 'border-rose-300/20 bg-rose-400/10'}`}>
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-white">
              {gameState.winner === SIDE_PLAYER ? <CheckCircle2 size={16} /> : <Skull size={16} />}
              <span>{winnerLabel}</span>
            </div>
            <div className="mt-3 text-sm leading-relaxed text-slate-100/85">{gameState.gameOverReason}</div>
            <div className="mt-4 flex gap-2">
              <Button onClick={restartCampaign} className="flex-1 rounded-2xl font-bold">
                <RotateCcw className="h-4 w-4" />
                <span>Еще партия</span>
              </Button>
              <Button onClick={goToDifficultyMenu} variant="secondary" className="flex-1 rounded-2xl bg-white/90 text-slate-950 hover:bg-white">
                <Home className="h-4 w-4" />
                <span>Сменить режим</span>
              </Button>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
