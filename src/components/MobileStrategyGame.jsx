import React, { useMemo, useState } from "react";
import { Button } from "./ui";
import { Crown, Hammer, Shield, Coins, Wheat, Castle, Swords, RotateCcw, Eye, House, Sparkles, BookOpen, ChevronRight, CheckCircle2 } from "lucide-react";

const Card = ({ children, className = "", ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

const CardContent = ({ children, className = "", ...props }) => (
  <div className={className} {...props}>
    {children}
  </div>
);

const Progress = ({ value = 0, className = "", ...props }) => {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div className={`overflow-hidden rounded-full bg-slate-700 ${className}`.trim()} {...props}>
      <div
        className="h-full rounded-full bg-cyan-300 transition-all duration-300"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
};

const GRID = 6;
const START_GOLD = 120;
const START_FOOD = 80;
const START_TURN = 1;
const ENEMY_START_HP = 36;
const PLAYER_START_HP = 40;
const MAX_LOG = 7;

const terrainTypes = ["plains", "forest", "mountain", "village", "ruins", "river"];

const terrainInfo = {
  plains: { label: "Равнина", emoji: "🟩", food: 10, gold: 2 },
  forest: { label: "Лес", emoji: "🌲", food: 6, gold: 5 },
  mountain: { label: "Гора", emoji: "⛰️", food: 0, gold: 11 },
  village: { label: "Деревня", emoji: "🏘️", food: 9, gold: 8 },
  ruins: { label: "Руины", emoji: "🏚️", food: 0, gold: 14 },
  river: { label: "Река", emoji: "🌊", food: 8, gold: 3 },
  castle: { label: "Крепость", emoji: "🏰", food: 0, gold: 0 },
};

const buildingInfo = {
  capital: "Столица",
  farm: "Ферма",
  mine: "Шахта",
  fort: "Форт",
  house: "Дом",
};

const unitStats = {
  militia: { label: "Ополчение", emoji: "🛡️", attack: 2, upkeep: 1, costGold: 10, costFood: 6 },
  archers: { label: "Лучники", emoji: "🏹", attack: 3, upkeep: 2, costGold: 16, costFood: 8 },
  knights: { label: "Рыцари", emoji: "🐎", attack: 5, upkeep: 3, costGold: 24, costFood: 12 },
};

const tutorialSteps = [
  {
    title: "Добро пожаловать в Pocket Kingdom",
    text: "Ты правишь маленьким королевством. Цель игры — развиться, найти врага на карте и разрушить его крепость раньше, чем он уничтожит твою.",
  },
  {
    title: "Как проходит ход",
    text: "На своём ходу ты выбираешь действие снизу, затем нажимаешь на клетку. После этого жмёшь ‘Закончить ход’, получаешь доход, и ходит враг.",
  },
  {
    title: "Главное правило захвата",
    text: "Захватывать можно только клетки рядом с твоими землями. Такие клетки подсвечиваются. Обычно первые ходы — это аккуратное расширение от столицы.",
  },
  {
    title: "Экономика и армия",
    text: "Фермы дают еду, шахты — золото, дома понемногу усиливают оба ресурса. Юниты сильны, но каждый ход съедают еду, поэтому не нанимай слишком много сразу.",
  },
  {
    title: "План на старт",
    text: "Первые ходы делай так: 1) захвати соседнюю клетку, 2) построй ферму или шахту на безопасной земле, 3) затем нанимай войска, когда экономика уже держится уверенно.",
  },
];

function randFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeCell(id) {
  const terrain = randFrom(terrainTypes);
  return {
    id,
    terrain,
    owner: null,
    building: null,
    level: 0,
    units: { militia: 0, archers: 0, knights: 0 },
    seen: false,
  };
}

function revealMap(cells) {
  const next = cells.map((cell) => ({ ...cell, seen: cell.seen || false }));
  next.forEach((cell, index) => {
    if (cell.owner === "player") {
      next[index].seen = true;
      neighbors(index).forEach((n) => {
        next[n] = { ...next[n], seen: true };
      });
    }
  });
  return next;
}

function createMap() {
  const cells = Array.from({ length: GRID * GRID }, (_, i) => makeCell(i));
  cells[0] = {
    ...cells[0],
    owner: "player",
    terrain: "castle",
    building: "capital",
    level: 1,
    units: { militia: 2, archers: 0, knights: 0 },
    seen: true,
  };
  cells[GRID + 1] = {
    ...cells[GRID + 1],
    owner: "player",
    terrain: "village",
    building: "farm",
    level: 1,
    units: { militia: 1, archers: 0, knights: 0 },
    seen: true,
  };
  const enemyIndex = GRID * GRID - 1;
  cells[enemyIndex] = {
    ...cells[enemyIndex],
    owner: "enemy",
    terrain: "castle",
    building: "capital",
    level: 1,
    units: { militia: 2, archers: 1, knights: 0 },
    seen: false,
  };
  cells[enemyIndex - GRID - 1] = {
    ...cells[enemyIndex - GRID - 1],
    owner: "enemy",
    terrain: "village",
    building: "farm",
    level: 1,
    units: { militia: 1, archers: 0, knights: 0 },
    seen: false,
  };
  return revealMap(cells);
}

function neighbors(index) {
  const r = Math.floor(index / GRID);
  const c = index % GRID;
  const n = [];
  if (r > 0) n.push(index - GRID);
  if (r < GRID - 1) n.push(index + GRID);
  if (c > 0) n.push(index - 1);
  if (c < GRID - 1) n.push(index + 1);
  return n;
}

function getArmyPower(units) {
  return Object.entries(units).reduce((sum, [key, count]) => sum + count * unitStats[key].attack, 0);
}

function getArmySize(units) {
  return Object.values(units).reduce((a, b) => a + b, 0);
}

function addUnit(units, type, amount = 1) {
  return { ...units, [type]: (units[type] || 0) + amount };
}

function getRandomAttackRoll(units) {
  return Math.max(1, getArmyPower(units) === 0 ? 3 : 4 + Math.floor(Math.random() * 3));
}

function loseArmy(units, losses) {
  const order = ["militia", "archers", "knights"];
  const next = { ...units };
  let left = losses;
  for (const type of order) {
    if (left <= 0) break;
    const killed = Math.min(next[type], left);
    next[type] -= killed;
    left -= killed;
  }
  return next;
}

function actionCost(action, recruitType) {
  if (action === "claim") return { gold: 18, food: 0 };
  if (action === "farm") return { gold: 14, food: 0 };
  if (action === "mine") return { gold: 16, food: 0 };
  if (action === "fort") return { gold: 22, food: 0 };
  if (action === "house") return { gold: 12, food: 0 };
  if (action === "recruit") {
    const unit = unitStats[recruitType];
    return { gold: unit.costGold, food: unit.costFood };
  }
  return { gold: 0, food: 0 };
}

function App() {
  const [cells, setCells] = useState(createMap);
  const [gold, setGold] = useState(START_GOLD);
  const [food, setFood] = useState(START_FOOD);
  const [turn, setTurn] = useState(START_TURN);
  const [playerHp, setPlayerHp] = useState(PLAYER_START_HP);
  const [enemyHp, setEnemyHp] = useState(ENEMY_START_HP);
  const [selectedAction, setSelectedAction] = useState("claim");
  const [recruitType, setRecruitType] = useState("militia");
  const [log, setLog] = useState(["Королевство основано. Сначала пройди обучение, затем начинай экспансию."]);
  const [selectedCell, setSelectedCell] = useState(0);
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialIndex, setTutorialIndex] = useState(0);

  const playerCells = useMemo(() => cells.filter((c) => c.owner === "player"), [cells]);
  const enemyCells = useMemo(() => cells.filter((c) => c.owner === "enemy"), [cells]);
  const visibleCells = useMemo(() => cells.filter((c) => c.seen).length, [cells]);

  const addLog = (text) => setLog((prev) => [text, ...prev].slice(0, MAX_LOG));

  const isFrontier = (index) => neighbors(index).some((n) => cells[n]?.owner === "player");
  const frontierCount = cells.filter((_, index) => isFrontier(index) && cells[index].owner !== "player").length;
  const endWithReveal = (nextCells) => setCells(revealMap(nextCells));
  const ended = playerHp <= 0 || enemyHp <= 0;

  const handleCellClick = (index) => {
    if (showTutorial || ended) return;
    setSelectedCell(index);
    const target = cells[index];
    if (!target.seen && target.owner !== "player") {
      addLog("Эта область пока скрыта туманом войны.");
      return;
    }

    const cost = actionCost(selectedAction, recruitType);
    if (gold < cost.gold || food < cost.food) {
      addLog("Не хватает ресурсов для этого действия.");
      return;
    }

    const next = [...cells];
    const cell = { ...next[index] };

    if (selectedAction === "claim") {
      if (cell.owner === "player") {
        addLog("Эта клетка уже под твоим контролем.");
        return;
      }
      if (!isFrontier(index) && index !== 0) {
        addLog("Расширяться можно только от границы твоих земель.");
        return;
      }
      setGold((g) => g - cost.gold);
      if (cell.owner === "enemy") {
        const attack = getRandomAttackRoll(cell.units);
        const defense = getArmyPower(cell.units) + cell.level + (cell.building === "fort" ? 3 : 0);
        if (cell.terrain === "castle") {
          const damage = Math.max(5, attack + 3 - Math.floor(defense / 3));
          setEnemyHp((hp) => Math.max(0, hp - damage));
          addLog(`Штурм крепости врага наносит ${damage} урона.`);
        } else {
          if (attack >= Math.max(2, Math.floor(defense / 2))) {
            cell.owner = "player";
            cell.level = Math.max(1, cell.level);
            cell.units = { militia: 1, archers: 0, knights: 0 };
            cell.building = null;
            addLog(`Ты отбил ${terrainInfo[cell.terrain].label.toLowerCase()} у противника.`);
          } else {
            addLog("Атака провалилась. Враг удержал позицию.");
          }
        }
      } else {
        cell.owner = "player";
        cell.level = 1;
        cell.units = { militia: 1, archers: 0, knights: 0 };
        addLog(`Захвачена клетка: ${terrainInfo[cell.terrain].label}.`);
      }
      next[index] = cell;
      endWithReveal(next);
      return;
    }

    if (cell.owner !== "player") {
      addLog("Эта команда работает только на твоих землях.");
      return;
    }

    if (selectedAction === "farm") {
      setGold((g) => g - cost.gold);
      cell.building = "farm";
      cell.level += 1;
      next[index] = cell;
      endWithReveal(next);
      addLog("Построена ферма. Прирост еды усилен.");
      return;
    }

    if (selectedAction === "mine") {
      setGold((g) => g - cost.gold);
      cell.building = "mine";
      cell.level += 1;
      next[index] = cell;
      endWithReveal(next);
      addLog("Построена шахта. Доход золота вырос.");
      return;
    }

    if (selectedAction === "fort") {
      setGold((g) => g - cost.gold);
      cell.building = "fort";
      cell.level += 1;
      next[index] = cell;
      endWithReveal(next);
      addLog("Возведён форт. Оборона клетки увеличена.");
      return;
    }

    if (selectedAction === "house") {
      setGold((g) => g - cost.gold);
      cell.building = "house";
      cell.level += 1;
      next[index] = cell;
      endWithReveal(next);
      addLog("Построен дом. Земля станет эффективнее.");
      return;
    }

    if (selectedAction === "recruit") {
      setGold((g) => g - cost.gold);
      setFood((f) => f - cost.food);
      cell.units = addUnit(cell.units, recruitType, 1);
      next[index] = cell;
      endWithReveal(next);
      addLog(`Нанят отряд: ${unitStats[recruitType].label}.`);
    }
  };

  const endTurn = () => {
    if (showTutorial || ended) return;

    let incomeGold = 6;
    let incomeFood = 4;
    let upkeep = 0;

    cells.forEach((cell) => {
      if (cell.owner === "player") {
        const base = terrainInfo[cell.terrain];
        incomeGold += base.gold;
        incomeFood += base.food;

        if (cell.building === "farm") incomeFood += 8 + cell.level;
        if (cell.building === "mine") incomeGold += 8 + cell.level;
        if (cell.building === "house") {
          incomeGold += 3 + Math.floor(cell.level / 2);
          incomeFood += 3 + Math.floor(cell.level / 2);
        }
        if (cell.building === "capital") {
          incomeGold += 6;
          incomeFood += 6;
        }
        upkeep += (cell.units.militia || 0) * unitStats.militia.upkeep;
        upkeep += (cell.units.archers || 0) * unitStats.archers.upkeep;
        upkeep += (cell.units.knights || 0) * unitStats.knights.upkeep;
      }
    });

    let nextFood = food + incomeFood - upkeep;
    let nextGold = gold + incomeGold;

    if (nextFood < 0) {
      const famineDamage = Math.min(8, Math.abs(nextFood) + 2);
      setPlayerHp((hp) => Math.max(0, hp - famineDamage));
      addLog(`Голод в королевстве! Ты теряешь ${famineDamage} HP.`);
      nextFood = 0;
    }

    setGold(Math.max(0, nextGold));
    setFood(Math.max(0, nextFood));

    let nextCells = [...cells];
    const enemyOwned = nextCells
      .map((cell, i) => ({ cell, i }))
      .filter(({ cell }) => cell.owner === "enemy");

    const enemyFrontier = nextCells
      .map((cell, i) => ({ cell, i }))
      .filter(({ i, cell }) => cell.owner !== "enemy" && neighbors(i).some((n) => nextCells[n]?.owner === "enemy"));

    const playerFrontier = nextCells
      .map((cell, i) => ({ cell, i }))
      .filter(({ i, cell }) => cell.owner === "player" && neighbors(i).some((n) => nextCells[n]?.owner === "enemy"));

    if (enemyFrontier.length > 0 && Math.random() > 0.25) {
      const target = randFrom(enemyFrontier);
      const cell = { ...nextCells[target.i] };
      const defense = getArmyPower(cell.units) + cell.level + (cell.building === "fort" ? 4 : 0);
      const attack = 5 + Math.floor(Math.random() * 6);
      if (cell.terrain === "castle") {
        const damage = Math.max(4, attack - 1);
        setPlayerHp((hp) => Math.max(0, hp - damage));
        addLog(`Вражеский штурм крепости наносит ${damage} урона.`);
      } else if (attack >= Math.max(2, Math.floor(defense / 2))) {
        cell.owner = "enemy";
        cell.units = { militia: 1, archers: Math.random() > 0.5 ? 1 : 0, knights: 0 };
        cell.building = null;
        nextCells[target.i] = cell;
        addLog(`Враг захватил ${terrainInfo[cell.terrain].label.toLowerCase()}.`);
      } else {
        addLog("Враг атаковал границу, но был остановлен.");
      }
    } else if (enemyOwned.length > 0) {
      const growFrom = randFrom(enemyOwned).i;
      const options = neighbors(growFrom).filter((n) => nextCells[n].owner === null);
      if (options.length > 0) {
        const idx = randFrom(options);
        nextCells[idx] = {
          ...nextCells[idx],
          owner: "enemy",
          level: 1,
          units: { militia: 1, archers: 0, knights: 0 },
        };
        addLog("Враг расширяет влияние в тумане войны.");
      } else if (playerFrontier.length > 0) {
        const reinforce = randFrom(playerFrontier).i;
        const spot = { ...nextCells[reinforce] };
        if (spot.owner === "player") {
          spot.units = loseArmy(spot.units, 0);
          addLog("Враг копит силы у границы.");
        }
      }
    }

    setCells(revealMap(nextCells));
    setTurn((t) => t + 1);
  };

  const restart = () => {
    setCells(createMap());
    setGold(START_GOLD);
    setFood(START_FOOD);
    setTurn(START_TURN);
    setPlayerHp(PLAYER_START_HP);
    setEnemyHp(ENEMY_START_HP);
    setSelectedAction("claim");
    setRecruitType("militia");
    setSelectedCell(0);
    setLog(["Новая партия началась. Сначала пройди обучение или пропусти его."]);
    setTutorialIndex(0);
    setShowTutorial(true);
  };

  const actions = [
    { id: "claim", label: "Захват", icon: Crown, desc: "18 золота" },
    { id: "farm", label: "Ферма", icon: Wheat, desc: "еда" },
    { id: "mine", label: "Шахта", icon: Coins, desc: "золото" },
    { id: "fort", label: "Форт", icon: Shield, desc: "оборона" },
    { id: "house", label: "Дом", icon: House, desc: "баланс" },
    { id: "recruit", label: "Найм", icon: Swords, desc: "армия" },
  ];

  const selectedCellData = cells[selectedCell] || cells[0];
  const winner = enemyHp <= 0 ? "Ты победил" : playerHp <= 0 ? "Ты проиграл" : null;
  const tutorial = tutorialSteps[tutorialIndex];
  const contextualHint = turn === 1
    ? "Совет на старт: выбери «Захват» и нажми на подсвеченную соседнюю клетку." 
    : gold < 20
    ? "Совет: золота маловато — построй шахту на своей клетке или заверши ход ради дохода."
    : food < 15
    ? "Совет: еды мало. Не нанимай много войск, пока не будет ферм."
    : frontierCount > 0
    ? "Совет: у тебя есть доступные клетки для расширения. Дави по краю своих земель."
    : "Совет: развивай экономику и ищи путь к крепости врага.";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-3 sm:p-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">Pocket Kingdom: Warfront</h1>
            <p className="text-sm text-slate-100">Более глубокая мобильная стратегия с туманом войны</p>
          </div>
          <Button onClick={restart} variant="secondary" className="rounded-2xl bg-white text-slate-950 hover:bg-slate-200">
            <RotateCcw className="w-4 h-4 mr-2" />
            Заново
          </Button>
        </div>

        {showTutorial ? (
          <Card className="bg-slate-900 border-slate-700 rounded-3xl shadow-2xl">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 text-cyan-200 font-semibold">
                <BookOpen className="w-5 h-5" /> Обучение
              </div>
              <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">{tutorial.title}</h2>
                  <span className="text-sm text-slate-200">{tutorialIndex + 1}/{tutorialSteps.length}</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-100">{tutorial.text}</p>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {tutorialSteps.map((_, i) => (
                  <div key={i} className={`h-2 rounded-full ${i <= tutorialIndex ? "bg-cyan-300" : "bg-slate-700"}`} />
                ))}
              </div>
              <div className="rounded-2xl bg-amber-500/10 border border-amber-300/20 p-3 text-sm text-amber-100">
                <div className="font-semibold mb-1">Быстрый план на первую минуту</div>
                <div>Захватить соседнюю клетку → улучшить безопасную клетку фермой или шахтой → закончить ход → смотреть, хватает ли еды на армию.</div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowTutorial(false)}
                  className="flex-1 rounded-2xl bg-slate-200 text-slate-950 hover:bg-white"
                >
                  Пропустить
                </Button>
                {tutorialIndex < tutorialSteps.length - 1 ? (
                  <Button
                    onClick={() => setTutorialIndex((i) => i + 1)}
                    className="flex-1 rounded-2xl font-semibold"
                  >
                    Дальше <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => setShowTutorial(false)}
                    className="flex-1 rounded-2xl font-semibold"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Начать игру
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {!showTutorial ? (
          <Card className="bg-cyan-500/10 border-cyan-300/20 rounded-3xl">
            <CardContent className="p-4 text-sm text-cyan-50 leading-relaxed">
              <div className="font-semibold mb-1">Подсказка</div>
              <div>{contextualHint}</div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="bg-slate-900 border-slate-700 rounded-3xl shadow-2xl">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-800 p-3 border border-slate-700">
                <div className="text-xs text-slate-100">Ход</div>
                <div className="text-2xl font-bold text-white">{turn}</div>
              </div>
              <div className="rounded-2xl bg-slate-800 p-3 border border-slate-700">
                <div className="text-xs text-slate-100">Твои земли</div>
                <div className="text-2xl font-bold text-white">{playerCells.length}</div>
              </div>
              <div className="rounded-2xl bg-amber-500/15 p-3 border border-amber-300/30">
                <div className="flex items-center gap-2 text-xs text-amber-100"><Coins className="w-4 h-4" /> Золото</div>
                <div className="text-2xl font-bold text-amber-50">{gold}</div>
              </div>
              <div className="rounded-2xl bg-lime-500/15 p-3 border border-lime-300/30">
                <div className="flex items-center gap-2 text-xs text-lime-100"><Wheat className="w-4 h-4" /> Еда</div>
                <div className="text-2xl font-bold text-lime-50">{food}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-800 p-3 border border-slate-700">
                <div className="flex items-center gap-2 text-slate-100"><Eye className="w-4 h-4" /> Разведано</div>
                <div className="text-xl font-bold text-white">{visibleCells}/{GRID * GRID}</div>
              </div>
              <div className="rounded-2xl bg-slate-800 p-3 border border-slate-700">
                <div className="flex items-center gap-2 text-slate-100"><Sparkles className="w-4 h-4" /> Земли врага</div>
                <div className="text-xl font-bold text-white">{enemyCells.length}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1 text-slate-100"><span className="flex items-center gap-2"><Castle className="w-4 h-4" /> Твоя крепость</span><span>{playerHp}/{PLAYER_START_HP}</span></div>
                <Progress value={(playerHp / PLAYER_START_HP) * 100} className="h-3" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1 text-slate-100"><span className="flex items-center gap-2"><Hammer className="w-4 h-4" /> Вражеская крепость</span><span>{enemyHp}/{ENEMY_START_HP}</span></div>
                <Progress value={(enemyHp / ENEMY_START_HP) * 100} className="h-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-700 rounded-3xl">
          <CardContent className="p-3">
            <div className="grid grid-cols-6 gap-2">
              {cells.map((cell, i) => {
                const visible = cell.seen || cell.owner === "player";
                const info = terrainInfo[cell.terrain];
                const player = cell.owner === "player";
                const enemy = cell.owner === "enemy";
                const totalUnits = getArmySize(cell.units);
                const lineOne = cell.building ? buildingInfo[cell.building] || cell.building : cell.level > 0 ? `ур.${cell.level}` : info.label;
                return (
                  <button
                    key={cell.id}
                    onClick={() => handleCellClick(i)}
                    className={`aspect-square rounded-2xl text-xs flex flex-col items-center justify-center border transition active:scale-95 overflow-hidden ${
                      !visible
                        ? "bg-slate-950 border-slate-700"
                        : player
                        ? "bg-emerald-500/20 border-emerald-300/50"
                        : enemy
                        ? "bg-rose-500/20 border-rose-300/50"
                        : "bg-slate-800 border-slate-600"
                    } ${selectedCell === i ? "ring-2 ring-cyan-300" : ""} ${selectedAction === "claim" && isFrontier(i) ? "ring-2 ring-amber-300/70" : ""}`}
                  >
                    {!visible ? (
                      <>
                        <div className="text-lg">🌫️</div>
                        <div className="text-[10px] text-slate-100">неизв.</div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg leading-none">{info.emoji}</div>
                        <div className="text-[9px] leading-tight text-center text-white font-semibold px-1 mt-1 break-words">{lineOne}</div>
                        <div className="text-[10px] text-slate-100 mt-0.5">{totalUnits > 0 ? `⚔ ${totalUnits}` : "·"}</div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const active = selectedAction === action.id;
            return (
              <button
                key={action.id}
                onClick={() => setSelectedAction(action.id)}
                className={`rounded-2xl p-3 text-left border ${active ? "bg-cyan-500/25 border-cyan-300 text-white" : "bg-slate-900 border-slate-700 text-slate-50"}`}
              >
                <div className="flex items-center gap-2 font-semibold text-sm"><Icon className="w-4 h-4" /> {action.label}</div>
                <div className="text-[11px] text-slate-100 mt-1">{action.desc}</div>
              </button>
            );
          })}
        </div>

        {selectedAction === "recruit" ? (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(unitStats).map(([key, unit]) => (
              <button
                key={key}
                onClick={() => setRecruitType(key)}
                className={`rounded-2xl p-3 text-left border ${recruitType === key ? "bg-violet-500/25 border-violet-300 text-white" : "bg-slate-900 border-slate-700 text-slate-50"}`}
              >
                <div className="font-semibold text-sm">{unit.emoji} {unit.label}</div>
                <div className="text-[11px] text-slate-100 mt-1">{unit.costGold} золота · {unit.costFood} еды</div>
              </button>
            ))}
          </div>
        ) : null}

        <Button onClick={endTurn} className="w-full rounded-2xl text-base py-6 font-bold" disabled={showTutorial}>
          Закончить ход
        </Button>

        <Card className="bg-slate-900 border-slate-700 rounded-3xl">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-white">Выбранная клетка</h2>
              {winner ? <span className="text-sm font-semibold text-cyan-200">{winner}</span> : null}
            </div>
            <div className="rounded-2xl bg-slate-800 border border-slate-700 p-3 text-sm text-slate-50">
              {selectedCellData.seen || selectedCellData.owner === "player" ? (
                <>
                  <div><span className="text-slate-200">Тип:</span> {terrainInfo[selectedCellData.terrain].label}</div>
                  <div><span className="text-slate-200">Владелец:</span> {selectedCellData.owner === "player" ? "ты" : selectedCellData.owner === "enemy" ? "враг" : "никто"}</div>
                  <div><span className="text-slate-200">Постройка:</span> {selectedCellData.building ? (buildingInfo[selectedCellData.building] || selectedCellData.building) : "нет"}</div>
                  <div><span className="text-slate-200">Армия:</span> {getArmySize(selectedCellData.units)} | сила {getArmyPower(selectedCellData.units)}</div>
                </>
              ) : (
                <div className="text-slate-50">Информация скрыта туманом войны.</div>
              )}
            </div>
            <div className="space-y-2 text-sm text-slate-50">
              {log.map((entry, idx) => (
                <div key={idx} className="rounded-2xl bg-slate-800 border border-slate-700 px-3 py-2">{entry}</div>
              ))}
            </div>
            <div className="text-xs text-slate-100 leading-relaxed">
              Цель: развиться, раскрыть карту, дойти до вражеской крепости и снести её здоровье до нуля. Захватывай соседние клетки, строй экономику и следи за содержанием армии.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
