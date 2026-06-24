const EQUIPMENT_POOL = [
  { name: '生锈短剑', atkBonus: 2, price: 20 },
  { name: '铁剑', atkBonus: 4, price: 45 },
  { name: '骑士长剑', atkBonus: 7, price: 90 },
  { name: '魔法杖', atkBonus: 10, price: 160 },
  { name: '屠龙宝刀', atkBonus: 15, price: 280 },
];

const SHOP_POTION_PRICE = 15;

function addGold(player, amount) {
  player.gold += amount;
  player.goldEarned += amount;
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

function openShop(player, rl) {
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

module.exports = {
  EQUIPMENT_POOL,
  SHOP_POTION_PRICE,
  addGold,
  getShopInventory,
  renderShop,
  openShop,
};
