const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const SAVE_FILE = path.join(__dirname, 'savegame.json');

const TILE = {
  EMPTY: 'empty',
  MONSTER: 'monster',
  POTION: 'potion',
  TRAP: 'trap',
  ENTRANCE: 'entrance',
  EXIT: 'exit',
  GOLD: 'gold',
  MERCHANT: 'merchant',
};

const TILE_CHAR = {
  unknown: '?',
  empty: '·',
  monster: 'M',
  potion: '!',
  trap: '^',
  entrance: 'E',
  exit: 'X',
  gold: '$',
  merchant: 'S',
  player: '@',
};

const MONSTER_TEMPLATES = {
  slime: { name: '史莱姆', type: 'slime', baseHp: 15, baseAtk: 3, baseGold: [3, 8] },
  skeleton: { name: '骷髅', type: 'skeleton', baseHp: 30, baseAtk: 6, baseGold: [8, 18] },
  dragon: { name: '黑龙', type: 'dragon', baseHp: 80, baseAtk: 15, baseGold: [25, 50] },
};

const EQUIPMENT_POOL = [
  { name: '生锈短剑', atkBonus: 2, price: 20 },
  { name: '铁剑', atkBonus: 4, price: 45 },
  { name: '骑士长剑', atkBonus: 7, price: 90 },
  { name: '魔法杖', atkBonus: 10, price: 160 },
  { name: '屠龙宝刀', atkBonus: 15, price: 280 },
];

const SHOP_POTION_PRICE = 15;


function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createPlayer() {
  return {
    hp: 50,
    maxHp: 50,
    baseAtk: 5,
    potions: 2,
    gold: 10,
    floor: 1,
    x: 0,
    y: 0,
    equipment: null,
    totalKills: 0,
    totalDamageDealt: 0,
    potionsUsed: 0,
    trapsTriggered: 0,
    goldEarned: 0,
    goldSpent: 0,
  };
}

function createMonster(floor, forceType = null) {
  let template;
  if (forceType) {
    template = MONSTER_TEMPLATES[forceType];
  } else {
    const r = Math.random();
    if (floor <= 2) {
      template = r < 0.7 ? MONSTER_TEMPLATES.slime : MONSTER_TEMPLATES.skeleton;
    } else if (floor <= 4) {
      if (r < 0.4) template = MONSTER_TEMPLATES.slime;
      else if (r < 0.85) template = MONSTER_TEMPLATES.skeleton;
      else template = MONSTER_TEMPLATES.dragon;
    } else {
      if (r < 0.2) template = MONSTER_TEMPLATES.slime;
      else if (r < 0.6) template = MONSTER_TEMPLATES.skeleton;
      else template = MONSTER_TEMPLATES.dragon;
    }
  }
  const scale = 1 + (floor - 1) * 0.25;
  const hp = Math.floor(template.baseHp * scale);
  const goldScale = 1 + (floor - 1) * 0.3;
  const goldMin = Math.floor(template.baseGold[0] * goldScale);
  const goldMax = Math.floor(template.baseGold[1] * goldScale);
  return {
    name: template.name,
    type: template.type,
    hp,
    maxHp: hp,
    atk: Math.floor(template.baseAtk * scale),
    goldReward: randInt(goldMin, goldMax),
  };
}

function getMapSize(floor) {
  const size = 8 + floor * 2;
  return { w: Math.min(size, 20), h: Math.min(size, 16) };
}

function generateMap(floor) {
  const { w, h } = getMapSize(floor);
  const map = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push({ type: TILE.EMPTY, revealed: false, content: null, cleared: false });
    }
    map.push(row);
  }

  const entranceX = 0;
  const entranceY = Math.floor(h / 2);
  map[entranceY][entranceX] = { type: TILE.ENTRANCE, revealed: true, content: null, cleared: true };

  const exitX = w - 1;
  const exitY = Math.floor(h / 2) + randInt(-1, 1);
  map[exitY][exitX] = { type: TILE.EXIT, revealed: false, content: null, cleared: false };

  const totalCells = w * h;
  const monsterCount = Math.floor(totalCells * 0.18) + floor;
  const potionCount = Math.max(2, Math.floor(totalCells * 0.05));
  const trapCount = Math.max(2, Math.floor(totalCells * 0.07) + floor - 1);
  const goldCount = Math.max(3, Math.floor(totalCells * 0.08));
  const merchantCount = 1;

  const occupied = new Set([`${entranceX},${entranceY}`, `${exitX},${exitY}`]);

  function placeRandom(type, createContent) {
    let tries = 0;
    while (tries < 500) {
      const x = randInt(0, w - 1);
      const y = randInt(0, h - 1);
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        occupied.add(key);
        map[y][x] = {
          type,
          revealed: false,
          content: createContent ? createContent() : null,
          cleared: false,
        };
        return;
      }
      tries++;
    }
  }

  for (let i = 0; i < monsterCount; i++) {
    placeRandom(TILE.MONSTER, () => createMonster(floor));
  }
  for (let i = 0; i < potionCount; i++) {
    placeRandom(TILE.POTION);
  }
  for (let i = 0; i < trapCount; i++) {
    placeRandom(TILE.TRAP);
  }
  for (let i = 0; i < goldCount; i++) {
    placeRandom(TILE.GOLD, () => randInt(5, 15 + floor * 3));
  }
  for (let i = 0; i < merchantCount; i++) {
    placeRandom(TILE.MERCHANT);
  }

  revealAround(map, entranceX, entranceY, w, h);

  return { map, w, h, playerStart: { x: entranceX, y: entranceY } };
}

function revealAround(map, x, y, w, h) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        map[ny][nx].revealed = true;
      }
    }
  }
}

function getPlayerAtk(player) {
  const bonus = player.equipment ? player.equipment.atkBonus : 0;
  return player.baseAtk + bonus;
}

function getTileDisplay(tile, isPlayer) {
  if (isPlayer) return TILE_CHAR.player;
  if (!tile.revealed) return TILE_CHAR.unknown;
  if (tile.type === TILE.MERCHANT) return TILE_CHAR.merchant;
  if (tile.cleared && tile.type !== TILE.ENTRANCE && tile.type !== TILE.EXIT) {
    return TILE_CHAR.empty;
  }
  return TILE_CHAR[tile.type] || '?';
}

function buildHUD(player, mapData) {
  const floorStr = ` 层数: ${player.floor} `;
  const hpStr = ` HP: ${player.hp}/${player.maxHp} `;
  const atkStr = ` 攻击: ${getPlayerAtk(player)} `;
  const potStr = ` 药水: ${player.potions} `;
  const goldStr = ` 金币: ${player.gold} `;
  const equipStr = player.equipment ? ` 装备: ${player.equipment.name}(+${player.equipment.atkBonus}) ` : ' 装备: 无 ';
  return { floorStr, hpStr, atkStr, potStr, goldStr, equipStr };
}

function renderScreen(player, mapData, extraLines = []) {
  const { map, w } = mapData;
  const { floorStr, hpStr, atkStr, potStr, goldStr, equipStr } = buildHUD(player, mapData);

  const contentWidth = w + 2;
  const leftPad = '║ ';
  const rightPad = ' ║';
  const innerWidth = contentWidth - leftPad.length - rightPad.length;

  const lines = [];

  lines.push('╔' + '═'.repeat(contentWidth - 2) + '╗');

  const topHUD = floorStr + goldStr;
  const topPad = topHUD + ' '.repeat(Math.max(0, innerWidth - topHUD.length));
  lines.push(leftPad + topPad + rightPad);

  const secondHUD = hpStr + ' '.repeat(Math.max(0, innerWidth - hpStr.length));
  lines.push(leftPad + secondHUD + rightPad);

  const thirdHUD = atkStr + equipStr;
  const thirdPad = thirdHUD + ' '.repeat(Math.max(0, innerWidth - thirdHUD.length));
  lines.push(leftPad + thirdPad + rightPad);

  const fourthHUD = potStr;
  const fourthPad = fourthHUD + ' '.repeat(Math.max(0, innerWidth - fourthHUD.length));
  lines.push(leftPad + fourthPad + rightPad);

  lines.push('╠' + '═'.repeat(contentWidth - 2) + '╣');

  for (let y = 0; y < map.length; y++) {
    let rowStr = '';
    for (let x = 0; x < w; x++) {
      const tile = map[y][x];
      const isPlayer = x === player.x && y === player.y;
      rowStr += getTileDisplay(tile, isPlayer) + ' ';
    }
    rowStr = rowStr.trimEnd();
    const padded = rowStr + ' '.repeat(Math.max(0, innerWidth - rowStr.length));
    lines.push(leftPad + padded + rightPad);
  }

  lines.push('╠' + '═'.repeat(contentWidth - 2) + '╣');

  const legend = ' ?未知 ·空 M怪 !药 ^阱 $金 S商 E入 X出 @你 ';
  const legendPad = legend + ' '.repeat(Math.max(0, innerWidth - legend.length));
  lines.push(leftPad + legendPad + rightPad);

  const controls = ' W/A/S/D或方向键移动  Q存档退出  B背包 ';
  const controlsPad = controls + ' '.repeat(Math.max(0, innerWidth - controls.length));
  lines.push(leftPad + controlsPad + rightPad);

  lines.push('╚' + '═'.repeat(contentWidth - 2) + '╝');

  for (const line of extraLines) {
    lines.push(line);
  }

  console.clear();
  console.log(lines.join('\n'));
}

function renderBattle(player, monster, log, prompt = true) {
  console.clear();
  const box = [];
  box.push('╔══════════════════════════════════════════╗');
  box.push('║          ⚔ 战 斗 画 面 ⚔                 ║');
  box.push('╠══════════════════════════════════════════╣');
  box.push(`║ 敌方: ${monster.name}`);
  box.push(`║ HP: ${'█'.repeat(Math.ceil(monster.hp / monster.maxHp * 10))}${'░'.repeat(10 - Math.ceil(monster.hp / monster.maxHp * 10))} ${monster.hp}/${monster.maxHp}`);
  box.push(`║ 攻击力: ${monster.atk}`);
  box.push('╠══════════════════════════════════════════╣');
  box.push(`║ 玩家: 你`);
  box.push(`║ HP: ${'█'.repeat(Math.ceil(player.hp / player.maxHp * 10))}${'░'.repeat(10 - Math.ceil(player.hp / player.maxHp * 10))} ${player.hp}/${player.maxHp}`);
  box.push(`║ 攻击力: ${getPlayerAtk(player)}  药水: ${player.potions}  金币: ${player.gold}`);
  if (player.equipment) box.push(`║ 装备: ${player.equipment.name}(+${player.equipment.atkBonus})`);
  box.push('╠══════════════════════════════════════════╣');
  box.push('║ 战斗日志:');
  for (const l of log.slice(-6)) {
    const line = '║  ' + l;
    box.push(line + ' '.repeat(Math.max(0, 42 - line.length)) + '║');
  }
  box.push('╠══════════════════════════════════════════╣');
  box.push('║  [1] 攻击   [2] 喝药水   [3] 逃跑       ║');
  box.push('╚══════════════════════════════════════════╝');
  console.log(box.join('\n'));
  if (prompt) process.stdout.write('请选择行动: ');
}

function runBattle(player, monster, mapData) {
  return new Promise((resolve) => {
    const log = [`遭遇了 ${monster.name}！`];

    function askAction() {
      renderBattle(player, monster, log);
      rl.question('', (input) => {
        const choice = input.trim().toLowerCase();
        if (choice === '1' || choice === 'a') {
          doPlayerAttack();
        } else if (choice === '2' || choice === 'h') {
          doDrinkPotion();
        } else if (choice === '3' || choice === 'r') {
          doEscape();
        } else {
          log.push('无效输入，请选 1/2/3 或 A/H/R');
          askAction();
        }
      });
    }

    function doPlayerAttack() {
      const dmg = randInt(Math.max(1, getPlayerAtk(player) - 2), getPlayerAtk(player) + 2);
      monster.hp -= dmg;
      player.totalDamageDealt += dmg;
      log.push(`你对 ${monster.name} 造成了 ${dmg} 点伤害！`);
      if (monster.hp <= 0) {
        winBattle();
        return;
      }
      monsterTurn();
    }

    function doDrinkPotion() {
      if (player.potions <= 0) {
        log.push('你没有药水了！');
        askAction();
        return;
      }
      const heal = randInt(15, 30);
      player.potions--;
      player.potionsUsed++;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      log.push(`你喝下药水，恢复了 ${heal} 点 HP！`);
      monsterTurn();
    }

    function doEscape() {
      const chance = 0.5;
      if (Math.random() < chance) {
        log.push('你成功逃跑了！');
        renderBattle(player, monster, log, false);
        console.log('\n按回车继续...');
        rl.question('', () => {
          resolve({ fled: true, died: false });
        });
      } else {
        log.push('逃跑失败！');
        monsterTurn();
      }
    }

    function monsterTurn() {
      const dmg = randInt(Math.max(1, monster.atk - 1), monster.atk + 2);
      player.hp -= dmg;
      log.push(`${monster.name} 对你造成了 ${dmg} 点伤害！`);
      if (player.hp <= 0) {
        player.hp = 0;
        loseBattle();
        return;
      }
      setTimeout(askAction, 150);
    }

    function winBattle() {
      player.totalKills++;
      log.push(`你击败了 ${monster.name}！`);
      if (monster.goldReward > 0) {
        player.gold += monster.goldReward;
        player.goldEarned += monster.goldReward;
        log.push(`获得了 ${monster.goldReward} 金币！`);
      }
      if (Math.random() < 0.35) {
        const maxTier = Math.min(Math.floor(player.floor / 2) + 2, EQUIPMENT_POOL.length);
        const tierIdx = randInt(0, maxTier - 1);
        const drop = EQUIPMENT_POOL[tierIdx];
        log.push(`${monster.name} 掉落了【${drop.name}】(攻击力+${drop.atkBonus})！`);
        if (!player.equipment || drop.atkBonus > player.equipment.atkBonus) {
          player.equipment = drop;
          log.push(`你装备上了【${drop.name}】！`);
        } else {
          log.push(`当前装备更好，丢弃了【${drop.name}】。`);
        }
      }
      if (Math.random() < 0.3) {
        player.potions++;
        log.push(`${monster.name} 掉落了一瓶药水！`);
      }
      renderBattle(player, monster, log, false);
      console.log('\n按回车继续...');
      rl.question('', () => {
        resolve({ fled: false, died: false });
      });
    }

    function loseBattle() {
      log.push('你被击败了...');
      renderBattle(player, monster, log, false);
      console.log('\n按回车继续...');
      rl.question('', () => {
        resolve({ fled: false, died: true });
      });
    }

    setTimeout(askAction, 200);
  });
}

function showInventory(player, mapData) {
  return new Promise((resolve) => {
    const lines = [];
    lines.push('');
    lines.push('┌──────────── 背包 ────────────┐');
    lines.push(`│ HP:      ${player.hp}/${player.maxHp}`);
    lines.push(`│ 基础攻击: ${player.baseAtk}`);
    lines.push(`│ 药水:    ${player.potions} 瓶`);
    lines.push(`│ 金币:    ${player.gold}`);
    if (player.equipment) {
      lines.push(`│ 武器:    ${player.equipment.name} (+${player.equipment.atkBonus}攻击)`);
    } else {
      lines.push(`│ 武器:    无`);
    }
    lines.push(`│ 总击杀:  ${player.totalKills}`);
    lines.push(`│ 总伤害:  ${player.totalDamageDealt}`);
    lines.push(`│ 用掉药水: ${player.potionsUsed}`);
    lines.push(`│ 触发陷阱: ${player.trapsTriggered}`);
    lines.push(`│ 累计收入: ${player.goldEarned}`);
    lines.push(`│ 累计消费: ${player.goldSpent}`);
    lines.push('└──────────────────────────────┘');
    lines.push('按回车返回游戏...');
    renderScreen(player, mapData, lines);
    rl.question('', () => resolve());
  });
}

function getShopInventory(player) {
  const items = [];
  items.push({
    id: 'potion',
    name: '治疗药水',
    desc: '战斗/探索中恢复 15~30 HP',
    price: SHOP_POTION_PRICE,
    type: 'potion',
  });
  const maxTier = Math.min(Math.floor(player.floor / 2) + 2, EQUIPMENT_POOL.length);
  for (let i = 0; i < maxTier; i++) {
    const eq = EQUIPMENT_POOL[i];
    items.push({
      id: 'equip_' + i,
      name: eq.name,
      desc: '攻击力 +' + eq.atkBonus,
      price: eq.price,
      type: 'equip',
      equip: eq,
    });
  }
  return items;
}

function renderShop(player, shopItems, message = '') {
  console.clear();
  const box = [];
  box.push('╔════════════════════════════════════════════════════╗');
  box.push('║              🏪 地 牢 商 店 🏪                      ║');
  box.push('╠════════════════════════════════════════════════════╣');
  box.push(`║  商人: "欢迎光临冒险者！要买点什么？"                ║`);
  box.push(`║  你的金币: ${player.gold} 💰                           ║`);
  box.push('╠════════════════════════════════════════════════════╣');
  box.push('║  #  商品            价格      说明                  ║');
  box.push('╠════════════════════════════════════════════════════╣');
  shopItems.forEach((it, idx) => {
    const mark = player.gold >= it.price ? ' ' : '✗';
    const num = String(idx + 1).padStart(2, ' ');
    const name = it.name.padEnd(14, ' ');
    const price = (it.price + '金').padEnd(8, ' ');
    const desc = it.desc.padEnd(18, ' ');
    box.push(`║ ${mark}${num} ${name} ${price} ${desc} ║`);
  });
  box.push('╠════════════════════════════════════════════════════╣');
  box.push('║  [编号] 购买对应商品   [S] 卖出当前装备             ║');
  box.push('║  [L] 离开商店                                       ║');
  box.push('╚════════════════════════════════════════════════════╝');
  if (message) box.push('  ' + message);
  console.log(box.join('\n'));
  process.stdout.write('请输入: ');
}

function openShop(player, mapData) {
  return new Promise((resolve) => {
    function ask() {
      const shopItems = getShopInventory(player);
      renderShop(player, shopItems);
      rl.question('', (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === 'l' || cmd === 'leave' || cmd === 'q') {
          resolve();
          return;
        }
        if (cmd === 's' || cmd === 'sell') {
          if (!player.equipment) {
            renderShop(player, shopItems, '你没有装备可以出售！');
            setTimeout(ask, 800);
            return;
          }
          const sellPrice = Math.floor(player.equipment.price * 0.5);
          player.gold += sellPrice;
          player.goldSpent -= sellPrice;
          if (player.goldSpent < 0) player.goldSpent = 0;
          const oldName = player.equipment.name;
          player.equipment = null;
          renderShop(player, shopItems, `出售了【${oldName}】，获得 ${sellPrice} 金币！`);
          setTimeout(ask, 800);
          return;
        }
        const idx = parseInt(cmd, 10);
        if (!isNaN(idx) && idx >= 1 && idx <= shopItems.length) {
          const item = shopItems[idx - 1];
          if (player.gold < item.price) {
            renderShop(player, shopItems, `金币不够！需要 ${item.price}，你只有 ${player.gold}`);
            setTimeout(ask, 900);
            return;
          }
          player.gold -= item.price;
          player.goldSpent += item.price;
          if (item.type === 'potion') {
            player.potions++;
            renderShop(player, shopItems, `购买了一瓶治疗药水！（药水: ${player.potions}）`);
          } else {
            if (!player.equipment || item.equip.atkBonus > player.equipment.atkBonus) {
              player.equipment = item.equip;
              renderShop(player, shopItems, `购买并装备了【${item.equip.name}】！攻击力+${item.equip.atkBonus}`);
            } else {
              renderShop(player, shopItems, `购买了【${item.equip.name}】，但当前装备更好，丢弃...`);
            }
          }
          setTimeout(ask, 900);
          return;
        }
        renderShop(player, shopItems, '无效输入，请输入商品编号 / S / L');
        setTimeout(ask, 700);
      });
    }
    ask();
  });
}

function triggerTile(player, tile, mapData) {
  return new Promise(async (resolve) => {
    const messages = [];

    if (tile.type === TILE.MONSTER && !tile.cleared) {
      const monster = tile.content;
      tile.cleared = true;
      tile.content = null;
      const result = await runBattle(player, monster, mapData);
      if (result.died) {
        resolve({ died: true });
        return;
      }
      resolve({ died: false });
      return;
    }

    if (tile.type === TILE.POTION && !tile.cleared) {
      tile.cleared = true;
      player.potions++;
      messages.push('💊 你发现了一瓶药水！（药水数量+1）');
      renderScreen(player, mapData, messages.concat(['按回车继续...']));
      rl.question('', () => resolve({ died: false }));
      return;
    }

    if (tile.type === TILE.GOLD && !tile.cleared) {
      tile.cleared = true;
      const amount = tile.content || 10;
      player.gold += amount;
      player.goldEarned += amount;
      tile.content = null;
      messages.push(`💰 你捡到了 ${amount} 金币！（当前: ${player.gold} 金）`);
      renderScreen(player, mapData, messages.concat(['按回车继续...']));
      rl.question('', () => resolve({ died: false }));
      return;
    }

    if (tile.type === TILE.MERCHANT) {
      await openShop(player, mapData);
      resolve({ died: false });
      return;
    }

    if (tile.type === TILE.TRAP && !tile.cleared) {
      tile.cleared = true;
      const dmg = randInt(5, 10 + player.floor * 2);
      player.hp -= dmg;
      player.trapsTriggered++;
      messages.push(`💥 你踩中了陷阱！受到 ${dmg} 点伤害！`);
      if (player.hp <= 0) {
        player.hp = 0;
        renderScreen(player, mapData, messages);
        resolve({ died: true });
        return;
      }
      renderScreen(player, mapData, messages.concat(['按回车继续...']));
      rl.question('', () => resolve({ died: false }));
      return;
    }

    if (tile.type === TILE.EXIT && !tile.cleared) {
      tile.cleared = true;
      messages.push(`🚪 你找到了第 ${player.floor} 层的出口！传送至下一层...`);
      renderScreen(player, mapData, messages.concat(['按回车继续...']));
      rl.question('', () => resolve({ nextFloor: true, died: false }));
      return;
    }

    resolve({ died: false });
  });
}

function nextFloor(player) {
  player.floor++;
  player.hp = Math.min(player.maxHp, player.hp + 15);
  if (player.floor % 3 === 0) {
    player.maxHp += 10;
    player.hp += 10;
    player.baseAtk += 2;
  }
  return generateMap(player.floor);
}

function saveGame(player, mapData) {
  const data = {
    player,
    map: mapData.map,
    w: mapData.w,
    h: mapData.map.length,
  };
  try {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function loadGame() {
  try {
    if (!fs.existsSync(SAVE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
    return data;
  } catch (e) {
    return null;
  }
}

function deleteSave() {
  try {
    if (fs.existsSync(SAVE_FILE)) {
      fs.unlinkSync(SAVE_FILE);
    }
  } catch (e) {}
}

function showMainMenu() {
  return new Promise((resolve) => {
    console.clear();
    const hasSave = fs.existsSync(SAVE_FILE);
    const lines = [];
    lines.push('╔══════════════════════════════════════════╗');
    lines.push('║                                          ║');
    lines.push('║       🏰  ASCII 地牢探险  🏰              ║');
    lines.push('║                                          ║');
    lines.push('║   在黑暗的地牢中寻找出口，击败怪物，       ║');
    lines.push('║   收集药水和装备，挑战更深的层数！         ║');
    lines.push('║                                          ║');
    lines.push('╠══════════════════════════════════════════╣');
    lines.push('║   [1] 开始新游戏                         ║');
    if (hasSave) lines.push('║   [2] 继续上次进度                       ║');
    lines.push('║   [3] 查看玩法说明                       ║');
    lines.push('║   [4] 退出游戏                           ║');
    lines.push('╚══════════════════════════════════════════╝');
    process.stdout.write(lines.join('\n') + '\n\n请选择: ');
    rl.question('', (input) => {
      const c = input.trim();
      if (c === '1') resolve({ choice: 'new' });
      else if (c === '2' && hasSave) resolve({ choice: 'load' });
      else if (c === '3' || (!hasSave && c === '2')) {
        showInstructions().then(() => resolve({ choice: 'menu' }));
      } else if (c === '4' || (hasSave && c === '3')) resolve({ choice: 'quit' });
      else resolve({ choice: 'menu' });
    });
  });
}

function showInstructions() {
  return new Promise((resolve) => {
    console.clear();
    const lines = [];
    lines.push('╔══════════════════════════════════════════╗');
    lines.push('║            玩 法 说 明                    ║');
    lines.push('╠══════════════════════════════════════════╣');
    lines.push('║ 【目标】                                 ║');
    lines.push('║   从入口(E)出发，找到出口(X)，深入地牢！  ║');
    lines.push('║                                          ║');
    lines.push('║ 【操作】                                 ║');
    lines.push('║   W / ↑  - 向上移动                      ║');
    lines.push('║   S / ↓  - 向下移动                      ║');
    lines.push('║   A / ←  - 向左移动                      ║');
    lines.push('║   D / →  - 向右移动                      ║');
    lines.push('║   Q      - 保存并退出                    ║');
    lines.push('║   B      - 查看背包/状态                 ║');
    lines.push('║                                          ║');
    lines.push('║ 【地图】                                 ║');
    lines.push('║   ? 未探索  · 空房间  M 怪物             ║');
    lines.push('║   ! 药水    ^ 陷阱    $ 金币             ║');
    lines.push('║   S 商人    E 入口    X 出口             ║');
    lines.push('║                                          ║');
    lines.push('║ 【商店】                                 ║');
    lines.push('║   踩到商人(S)即可进入商店                 ║');
    lines.push('║   编号=购买  S=卖装备(半价)  L=离开      ║');
    lines.push('║   金币来源：击杀怪物 / 地图上捡           ║');
    lines.push('║                                          ║');
    lines.push('║ 【战斗】                                 ║');
    lines.push('║   1/攻击  2/喝药  3/逃跑                 ║');
    lines.push('║                                          ║');
    lines.push('║ 【怪物】                                 ║');
    lines.push('║   史莱姆(弱)  骷髅(中)  黑龙(强)         ║');
    lines.push('║   击败怪物有概率掉落装备和药水！          ║');
    lines.push('║                                          ║');
    lines.push('║ 【层数】                                 ║');
    lines.push('║   每下一层地图更大、怪物更强              ║');
    lines.push('║   每3层玩家获得属性提升                  ║');
    lines.push('╚══════════════════════════════════════════╝');
    lines.push('\n按回车返回主菜单...');
    console.log(lines.join('\n'));
    rl.question('', () => resolve());
  });
}

function showGameOver(player, cleared = false) {
  return new Promise((resolve) => {
    console.clear();
    const lines = [];
    lines.push('╔══════════════════════════════════════════╗');
    if (cleared) {
      lines.push('║         🎉  恭 喜 通 关  🎉              ║');
    } else {
      lines.push('║         💀  游 戏 结 束  💀              ║');
    }
    lines.push('╠══════════════════════════════════════════╣');
    lines.push('║  冒险总结:                               ║');
    lines.push(`║    到达层数: ${player.floor}`);
    lines.push(`║    击杀怪物: ${player.totalKills}`);
    lines.push(`║    造成伤害: ${player.totalDamageDealt}`);
    lines.push(`║    使用药水: ${player.potionsUsed}`);
    lines.push(`║    触发陷阱: ${player.trapsTriggered}`);
    lines.push(`║    累计金币: ${player.goldEarned}(收入) / ${player.goldSpent}(消费) = ${player.gold}(当前)`);
    if (player.equipment) {
      lines.push(`║    最终装备: ${player.equipment.name}(+${player.equipment.atkBonus})`);
    }
    lines.push('╠══════════════════════════════════════════╣');
    lines.push('║  [1] 重新开始                            ║');
    lines.push('║  [2] 返回主菜单                          ║');
    lines.push('║  [3] 退出游戏                            ║');
    lines.push('╚══════════════════════════════════════════╝');
    process.stdout.write(lines.join('\n') + '\n\n请选择: ');
    rl.question('', (input) => {
      const c = input.trim();
      if (c === '1') resolve({ action: 'restart' });
      else if (c === '3') resolve({ action: 'quit' });
      else resolve({ action: 'menu' });
    });
  });
}

const MAX_FLOOR = 10;

async function startNewGame() {
  const player = createPlayer();
  let mapData = generateMap(player.floor);
  player.x = mapData.playerStart.x;
  player.y = mapData.playerStart.y;
  return await runGameLoop(player, mapData);
}

async function continueGame() {
  const saved = loadGame();
  if (!saved) return { action: 'menu' };
  const player = saved.player;
  if (typeof player.gold !== 'number') player.gold = 0;
  if (typeof player.goldEarned !== 'number') player.goldEarned = 0;
  if (typeof player.goldSpent !== 'number') player.goldSpent = 0;
  if (player.equipment && typeof player.equipment.price !== 'number') {
    const match = EQUIPMENT_POOL.find(e => e.name === player.equipment.name);
    if (match) player.equipment = match;
  }
  const mapData = { map: saved.map, w: saved.w, h: saved.h };
  return await runGameLoop(player, mapData);
}

function runGameLoop(player, mapData) {
  return new Promise((resolve) => {
    function promptMove() {
      renderScreen(player, mapData);
      process.stdout.write('你的行动: ');
      rl.question('', async (input) => {
        const cmd = input.trim().toLowerCase();
        let dx = 0, dy = 0;
        let handled = false;

        if (cmd === 'w' || cmd === 'arrowup' || cmd === '8') dy = -1;
        else if (cmd === 's' || cmd === 'arrowdown' || cmd === '2') dy = 1;
        else if (cmd === 'a' || cmd === 'arrowleft' || cmd === '4') dx = -1;
        else if (cmd === 'd' || cmd === 'arrowright' || cmd === '6') dx = 1;
        else if (cmd === 'q') {
          const ok = saveGame(player, mapData);
          renderScreen(player, mapData, [
            '',
            ok ? '✅ 游戏已保存！退出中...' : '❌ 保存失败！',
          ]);
          setTimeout(() => resolve({ action: 'quit' }), 600);
          return;
        } else if (cmd === 'b') {
          await showInventory(player, mapData);
          handled = true;
        } else {
          handled = true;
        }

        if (dx !== 0 || dy !== 0) {
          const nx = player.x + dx;
          const ny = player.y + dy;
          if (nx < 0 || nx >= mapData.w || ny < 0 || ny >= mapData.map.length) {
            renderScreen(player, mapData, ['', '⚠ 撞墙了，无法移动到那里！', '按回车继续...']);
            rl.question('', () => promptMove());
            return;
          }
          player.x = nx;
          player.y = ny;
          revealAround(mapData.map, nx, ny, mapData.w, mapData.map.length);
          const tile = mapData.map[ny][nx];
          const result = await triggerTile(player, tile, mapData);
          if (result.died) {
            deleteSave();
            const end = await showGameOver(player, false);
            resolve(end);
            return;
          }
          if (result.nextFloor) {
            if (player.floor >= MAX_FLOOR) {
              deleteSave();
              const end = await showGameOver(player, true);
              resolve(end);
              return;
            }
            mapData = nextFloor(player);
            player.x = mapData.playerStart.x;
            player.y = mapData.playerStart.y;
          }
          promptMove();
          return;
        }

        if (handled) {
          promptMove();
        } else {
          promptMove();
        }
      });
    }
    promptMove();
  });
}

async function main() {
  let running = true;
  while (running) {
    const menu = await showMainMenu();
    if (menu.choice === 'new') {
      deleteSave();
      const result = await startNewGame();
      if (result.action === 'restart') {
        deleteSave();
        const r2 = await startNewGame();
        if (r2.action === 'quit') running = false;
        continue;
      }
      if (result.action === 'quit') running = false;
    } else if (menu.choice === 'load') {
      const result = await continueGame();
      if (result.action === 'restart') {
        deleteSave();
        const r2 = await startNewGame();
        if (r2.action === 'quit') running = false;
        continue;
      }
      if (result.action === 'quit') running = false;
    } else if (menu.choice === 'quit') {
      running = false;
    }
  }
  console.clear();
  console.log('\n👋 感谢游玩！再见~\n');
  rl.close();
}

main().catch((err) => {
  console.error('游戏出错:', err);
  rl.close();
  process.exit(1);
});
