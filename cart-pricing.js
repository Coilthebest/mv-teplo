/* All money is stored in kopeks. One source of truth for the catalogue and cart. */
(function (root) {
  'use strict';
  const prices = Object.freeze({ frame: 76000, paper: 35000, keychain: 65000, tshirt: 287000, digital: 49900 });
  const magnets = Object.freeze({ '7 × 5 см': 60000, '6 × 9 см (рекомендуем)': 60000, '10 × 7 см': 65000, '13 × 9 см': 70000, '15 × 10 см': 75000 });
  const packaging = Object.freeze({ ordinary: 10000, gift: 35000 });
  const names = Object.freeze({ frame: 'Фото в рамке', magnet: 'Магнит', keychain: 'Брелок', paper: 'Фото без рамки', tshirt: 'Футболка', digital: 'Электронная версия в HD-качестве' });
  const quantity = value => Math.max(1, Math.min(99, Math.trunc(Number(value)) || 1));
  const money = value => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100);
  function unitPrice(item) {
    return item.product === 'magnet' ? magnets[item.format] ?? magnets['6 × 9 см (рекомендуем)'] : prices[item.product] ?? 0;
  }
  function productName(item) {
    return item.product === 'paper' && item.material === 'sticker' ? 'Наклейка' : names[item.product] || 'Изделие';
  }
  function calculate(items, pack = 'ordinary') {
    const rows = items.map(item => ({ ...item, qty: item.product === 'digital' ? 1 : quantity(item.qty), unit: unitPrice(item), discount: 0 }));
    const physical = rows.filter(row => row.product !== 'digital');
    const physicalCount = physical.reduce((sum, row) => sum + row.qty, 0);
    const artworkKeys = new Set((physicalCount ? rows : []).map(row => row.artworkKey));
    const gifts = rows.filter(row => row.product === 'digital' && artworkKeys.has(row.artworkKey));
    gifts.forEach(row => { row.discount = row.unit; row.freeDigital = true; });
    const types = new Set(physical.map(row => row.product));
    const hasTrio = ['frame', 'magnet', 'keychain'].every(product => types.has(product));
    const cartRate = hasTrio ? (types.has('tshirt') ? 15 : 10) : 0;
    const promotions = [];
    const paidFiles = rows.filter(row => row.product === 'digital' && !row.freeDigital);
    // Previous carts stored the generated image hash as the first part of the artwork key.
    function imageKey(row) {
      try { return JSON.parse(row.artworkKey)[0] || row.artworkKey; }
      catch { return row.artworkKey; }
    }
    const sourceByArtwork = new Map(rows.filter(row => row.photoHash).map(row => [imageKey(row), row.photoHash]));
    const differentPhotos = new Set(paidFiles.map(row => row.photoHash || sourceByArtwork.get(imageKey(row)) || imageKey(row))).size;
    const hdOffer = differentPhotos >= 10;
    let cartSaving = 0;
    let hdSaving = 0;
    for (const row of rows) {
      if (row.freeDigital) continue;
      if (hdOffer && row.product === 'digital') {
        row.discount = Math.round(row.unit * 0.5);
        hdSaving += row.discount;
      } else if (cartRate) {
        row.discount = Math.round(row.unit * cartRate / 100) * row.qty;
        cartSaving += row.discount;
      }
    }
    if (cartSaving) promotions.push({ rate: cartRate, count: 1, discount: cartSaving, name: 'На всю корзину' });
    if (hdSaving) promotions.push({ rate: 50, count: 1, discount: hdSaving, name: 'Электронные версии HD · от 10 разных фото' });
    const subtotal = rows.reduce((sum, row) => sum + row.unit * row.qty, 0);
    const discount = rows.reduce((sum, row) => sum + row.discount, 0);
    const packagingCost = physicalCount ? packaging[pack] ?? packaging.ordinary : 0;
    const total = subtotal - discount + packagingCost;
    return { rows, physicalCount, digitalCount: rows.length - physical.length, giftCount: artworkKeys.size, promotions, subtotal, discount, packagingCost, total, missing: physicalCount ? Math.max(0, 3 - physicalCount) : 0, canOrder: rows.length > 0 && (!physicalCount || physicalCount >= 3) };
  }
  const api = Object.freeze({ prices, magnets, packaging, names, quantity, money, unitPrice, productName, calculate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeploPricing = api;
})(typeof window === 'undefined' ? globalThis : window);
