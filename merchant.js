function getGoldCount(totalCells) {
  return Math.max(3, Math.floor(totalCells * 0.08));
}

function getMerchantCount() {
  return 1;
}

function getGoldAmountRange(floor) {
  return { min: 5, max: 15 + floor * 3 };
}

module.exports = {
  getGoldCount,
  getMerchantCount,
  getGoldAmountRange,
};
