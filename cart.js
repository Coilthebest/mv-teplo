'use strict';
(() => {
  const P = window.TeploPricing;
  const $ = selector => document.querySelector(selector);
  const dialog = $('#cart-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const notice = message => document.dispatchEvent(new CustomEvent('teplo:notice', { detail: message }));
  let items = [], pack = 'ordinary', db = null, queue = Promise.resolve();
  const previewUrls = new Map();
  const signature = item => JSON.stringify([item.artworkKey, item.product, item.material, item.format, item.shirtColor]);
  const calculation = () => P.calculate(items, pack);
  const thingWord = n => ({ one: 'вещь', few: 'вещи', many: 'вещей', other: 'вещи' })[new Intl.PluralRules('ru-RU').select(n)];
  function loadDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('teplo-cart', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('cart');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
    });
  }
  function readSaved() {
    return new Promise((resolve, reject) => {
      const request = db.transaction('cart').objectStore('cart').get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function persist(nextItems, nextPack) {
    if (!db) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cart', 'readwrite');
      tx.objectStore('cart').put({ version: 1, items: nextItems, pack: nextPack }, 'current');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('save_failed'));
    });
  }
  function transact(change) {
    const job = queue.then(async () => {
      await ready;
      const next = change(items.map(item => ({ ...item })), pack);
      await persist(next.items, next.pack);
      items = next.items; pack = next.pack;
      render();
      return next;
    });
    queue = job.catch(() => {});
    return job;
  }
  function getPreview(item) {
    const cached = previewUrls.get(item.id);
    if (cached?.blob !== item.preview) {
      if (cached) URL.revokeObjectURL(cached.url);
      previewUrls.set(item.id, { blob: item.preview, url: URL.createObjectURL(item.preview) });
    }
    return previewUrls.get(item.id).url;
  }
  function spec(item) {
    return item.product === 'tshirt' ? `${item.colorName} · ${item.format}` : item.product === 'paper' ? `${item.material === 'sticker' ? 'Наклейка' : 'Матовая бумага'} · ${item.format}` : item.format;
  }
  function itemMarkup(row) {
    const amount = row.unit * row.qty - row.discount;
    return `<article class="cart-item" data-cart-id="${esc(row.id)}"><img src="${getPreview(row)}" alt="${esc(row.caption || 'Ваша история')} — ${esc(P.productName(row))}" width="84" height="112"><div class="cart-item-detail"><h3>${esc(P.productName(row))}</h3><p>${esc(spec(row))}</p><p class="cart-artwork-title">${esc(row.caption || 'Без надписи')}${row.year ? ` · ${esc(row.year)}` : ''}</p><div class="cart-item-tools"><button type="button" data-cart-action="edit" data-id="${esc(row.id)}">Изменить</button>${row.product !== 'digital' ? `<button type="button" data-cart-action="copy" data-id="${esc(row.id)}">Ещё вещь с этим рисунком</button>` : ''}</div><div class="cart-item-bottom">${row.product !== 'digital' ? `<div class="cart-quantity" aria-label="Количество: ${esc(P.productName(row))}"><button type="button" data-cart-action="minus" data-id="${esc(row.id)}" aria-label="Уменьшить количество: ${esc(P.productName(row))}" ${row.qty === 1 ? 'disabled' : ''}>−</button><output>${row.qty}</output><button type="button" data-cart-action="plus" data-id="${esc(row.id)}" aria-label="Увеличить количество: ${esc(P.productName(row))}" ${row.qty === 99 ? 'disabled' : ''}>+</button></div>` : '<span class="cart-file-count">1 файл</span>'}<div class="cart-row-price">${row.discount ? `<del>${P.money(row.unit * row.qty)}</del>` : ''}<strong>${row.freeDigital ? 'В подарок' : P.money(amount)}</strong>${row.qty > 1 ? `<small>${P.money(row.unit)} / шт.</small>` : ''}</div></div></div><button type="button" class="cart-remove" data-cart-action="remove" data-id="${esc(row.id)}" aria-label="Удалить: ${esc(P.productName(row))}">×</button></article>`;
  }
  function render() {
    const c = calculation();
    const focus = document.activeElement;
    const action = focus?.dataset.cartAction, focusedId = focus?.dataset.id;
    for (const [id, cached] of previewUrls) if (!items.some(item => item.id === id)) { URL.revokeObjectURL(cached.url); previewUrls.delete(id); }
    const count = c.rows.reduce((sum, row) => sum + row.qty, 0);
    document.querySelectorAll('[data-cart-count]').forEach(el => { el.textContent = count; });
    $('#cart-title-count').textContent = count;
    document.querySelectorAll('[data-open-cart]').forEach(el => el.setAttribute('aria-label', `Корзина, товаров: ${count}`));
    $('#cart-empty').hidden = !!count;
    $('#cart-filled').hidden = !count;
    $('#cart-floating').hidden = !count;
    $('#cart-floating-total').textContent = P.money(c.total);
    $('#cart-items').innerHTML = c.rows.map(itemMarkup).join('');
    $('#cart-minimum').textContent = !c.physicalCount ? 'Электронный заказ — без минимума' : c.missing ? `Ещё ${c.missing} ${c.missing === 1 ? 'вещь' : 'вещи'} до минимального заказа` : `${c.physicalCount} ${thingWord(c.physicalCount)} · минимум собран`;
    $('#cart-progress-fill').style.width = `${Math.min(100, c.physicalCount / 3 * 100)}%`;
    $('.cart-progress').classList.toggle('complete', c.canOrder);
    $('.cart-progress p').hidden = !c.physicalCount;
    $('#cart-packaging').hidden = !c.physicalCount;
    document.querySelectorAll('input[name="cart-packaging"]').forEach(input => { input.checked = input.value === pack; });
    $('#cart-discounts').innerHTML = c.promotions.map(p => `<p><b>−${p.rate}% · ${esc(p.name)}${p.count > 1 ? ` × ${p.count}` : ''}</b><span>−${P.money(p.discount)}</span></p>`).join('');
    if (c.physicalCount && !c.promotions.length) $('#cart-discounts').innerHTML = '<p class="cart-promo-hint">Рамка, магнит и брелок дают −10% на всю корзину. Добавьте футболку, и скидка вырастет до 15%.</p>';
    $('#cart-subtotal').textContent = P.money(c.subtotal);
    $('#cart-discount').textContent = `−${P.money(c.discount)}`;
    $('#cart-discount-row').hidden = !c.discount;
    $('#cart-pack-cost').textContent = P.money(c.packagingCost);
    $('#cart-pack-row').hidden = !c.physicalCount;
    $('#cart-delivery-row').hidden = !c.physicalCount;
    $('#cart-total').textContent = P.money(c.total);
    $('#cart-gifts').hidden = !c.physicalCount;
    $('#cart-gifts').textContent = 'Электронная копия каждого рисунка в HD-качестве — в подарок.';
    $('#cart-save').disabled = !c.canOrder;
    $('#cart-save').textContent = c.missing ? `Добавьте ещё ${c.missing} ${c.missing === 1 ? 'вещь' : 'вещи'}` : 'Скачать состав заказа';
    window.TeploCheckout.setOrderState(!!c.physicalCount);
    if (action && focusedId) {
      const replacement = [...$('#cart-items').querySelectorAll('button')].find(button => button.dataset.cartAction === action && button.dataset.id === focusedId && !button.disabled);
      (replacement || $('#close-cart')).focus({ preventScroll: true });
    }
  }
  function open() { Promise.all([ready, window.TeploCheckout.ready]).then(() => { render(); if (!dialog.open) dialog.showModal(); }); }
  function continueShopping() { dialog.close(); document.querySelector('#constructor').scrollIntoView({ behavior: 'smooth' }); document.dispatchEvent(new Event('teplo:next-story')); }
  async function add(item, editingId) {
    if (!(item.sourceFile instanceof Blob) || !(item.preview instanceof Blob) || !item.artworkKey || !P.unitPrice(item)) throw new Error('invalid_item');
    const clean = { ...item, qty: item.product === 'digital' ? 1 : P.quantity(item.qty) };
    await transact(list => {
      if (editingId && !list.some(entry => entry.id === editingId)) throw new Error('removed_item');
      const rest = list.filter(entry => entry.id !== editingId);
      const match = rest.find(entry => signature(entry) === signature(clean));
      if (match) {
        if (clean.product !== 'digital' && match.qty + clean.qty > 99) throw new Error('quantity_limit');
        match.qty = clean.product === 'digital' ? 1 : match.qty + clean.qty;
      } else {
        if (rest.length >= 50) throw new Error('cart_full');
        rest.push({ ...clean, id: editingId || crypto.randomUUID() });
      }
      return { items: rest, pack };
    });
  }
  async function saveComposition() {
    const c = calculation();
    if (!c.canOrder) return;
    await window.TeploCheckout.ready;
    const recipient = window.TeploCheckout.validate();
    if (!recipient.ok) { notice('Заполните обязательные данные получателя.'); return; }
    const details = recipient.data;
    const recipientHTML = `<section class="recipient"><h2>Получатель</h2><p>Имя: ${esc(details.name)}</p><p>Телефон: ${esc(details.phone)}</p>${c.physicalCount ? `${details.city ? `<p>Город: ${esc(details.city)}</p>` : ''}<p>Доставка до ПВЗ Яндекс Маркета: ${esc(details.pickup?.address || details.manualAddress)}</p>${details.pickup ? `<p>ID ПВЗ: ${esc(details.pickup.id)}</p>` : '<small>Адрес ПВЗ указан вручную. Доступность пункта нужно уточнить перед отправкой.</small>'}` : ''}</section>`;
    const button = $('#cart-save'); button.disabled = true;
    try {
      const cards = c.rows.map(row => `<article><div><h2>${esc(P.productName(row))}</h2><p>${esc(spec(row))}</p><p>${esc(row.caption || 'Без надписи')} ${esc(row.year)}</p><p>${row.qty} шт. × ${P.money(row.unit)}${row.discount ? ` · скидка ${P.money(row.discount)}` : ''}</p><strong>${P.money(row.unit * row.qty - row.discount)}</strong></div></article>`).join('');
      const html = `<!doctype html><html lang="ru"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Teplo — состав заказа</title><style>body{font:15px/1.6 system-ui,sans-serif;background:#fff8ec;color:#62351f;max-width:850px;margin:40px auto;padding:20px}h1,h2{font-family:Georgia,serif}h2{font-size:22px}article{display:flex;gap:25px;border-bottom:1px solid #dfcab0;padding:25px 0;break-inside:avoid}img{width:125px;height:170px;object-fit:contain;background:#f7ead5}small{display:block;color:#8a735e}.total{font-size:24px;font-weight:600}.note{padding:18px;background:#f5e2be}@media(max-width:500px){article{gap:15px}img{width:85px;height:120px}}</style><h1>Teplo · ваши истории</h1><p>Состав заказа от ${new Date().toLocaleDateString('ru-RU')}</p><p class="note">Это сохранённый расчёт, а не оформленный заказ. Он не отправлен в мастерскую и не оплачен.</p>${recipientHTML}${cards}<p>Товары: ${P.money(c.subtotal)}</p>${c.promotions.map(p => `<p>${esc(p.name)} · −${p.rate}%: −${P.money(p.discount)}</p>`).join('')}${c.discount ? `<p>Все скидки и подарки: −${P.money(c.discount)}</p>` : ''}${c.physicalCount ? `<p>Упаковка: ${pack === 'gift' ? 'подарочная' : 'обычная'} · ${P.money(c.packagingCost)} за заказ</p><p>Доставка: бесплатно до ПВЗ Яндекс Маркета</p><p>Электронные копии рисунков из заказа в HD-качестве — в подарок.</p>` : '<p>Электронный заказ: без доставки и упаковки.</p>'}<p class="total">Итого: ${P.money(c.total)}</p><small>Файл содержит список товаров и данные получателя. Передавайте его только тем, кому доверяете. Цены рассчитаны на дату сохранения.</small></html>`;
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `teplo-состав-заказа-${new Date().toISOString().slice(0, 10)}.html`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      notice('Состав подготовлен к скачиванию. Заказ пока не отправлен.');
    } catch { notice('Не получилось сохранить состав. Попробуйте ещё раз.'); }
    finally { render(); }
  }
  document.querySelectorAll('[data-open-cart]').forEach(button => button.addEventListener('click', open));
  $('#close-cart').addEventListener('click', () => dialog.close());
  document.querySelectorAll('[data-cart-continue]').forEach(button => button.addEventListener('click', continueShopping));
  $('#cart-items').addEventListener('click', async event => {
    const button = event.target.closest('[data-cart-action]'); if (!button) return;
    const item = items.find(row => row.id === button.dataset.id); if (!item) return;
    const action = button.dataset.cartAction;
    if (action === 'edit' || action === 'copy') {
      dialog.close();
      document.dispatchEvent(new CustomEvent('teplo:edit-cart', { detail: { item, copy: action === 'copy' } }));
      $('#constructor').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    button.disabled = true;
    try {
      await transact(list => {
        const target = list.find(row => row.id === item.id);
        if (action === 'remove') list = list.filter(row => row.id !== item.id);
        else if (target) target.qty = P.quantity(target.qty + (action === 'plus' ? 1 : -1));
        return { items: list, pack };
      });
      if (action === 'remove') { document.dispatchEvent(new CustomEvent('teplo:cart-removed', { detail: item.id })); notice('Товар удалён из корзины.'); }
    } catch { notice('Не удалось сохранить изменение. Освободите место в браузере и попробуйте снова.'); render(); }
  });
  $('#cart-packaging').addEventListener('change', async event => {
    if (!P.packaging[event.target.value]) return;
    try { await transact(list => ({ items: list, pack: event.target.value })); }
    catch { notice('Не удалось сохранить упаковку. Попробуйте снова.'); render(); }
  });
  $('#clear-cart').addEventListener('click', async () => {
    try { await transact(() => ({ items: [], pack: 'ordinary' })); document.dispatchEvent(new CustomEvent('teplo:cart-cleared')); notice('Корзина очищена, сохранённые фотографии удалены.'); }
    catch { notice('Не удалось очистить корзину. Попробуйте снова.'); }
  });
  $('#cart-save').addEventListener('click', saveComposition);
  const ready = (async () => {
    try {
      db = await loadDB();
      db.onversionchange = () => { db.close(); db = null; };
      const saved = await readSaved();
      if (saved?.version === 1 && Array.isArray(saved.items)) {
        items = saved.items.filter(item => P.unitPrice(item) && item.preview instanceof Blob && item.sourceFile instanceof Blob).slice(0, 50);
        pack = saved.pack === 'gift' ? 'gift' : 'ordinary';
      }
    } catch {
      db = null;
      $('#cart-storage-note').textContent = 'Хранилище браузера недоступно. Корзина работает до закрытия или обновления этой страницы.';
    }
    render();
  })();
  window.TeploCart = Object.freeze({ ready, add, open, spec });
  window.startTestCheckout(() => ({ ...calculation(), pack }));
})();
