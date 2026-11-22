'use strict';
(() => {
  const P = window.TeploPricing;
  const $ = selector => document.querySelector(selector);
  const dialog = $('#cart-dialog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const notice = message => document.dispatchEvent(new CustomEvent('teplo:notice', { detail: message }));
  let items = [], pack = 'ordinary', queue = Promise.resolve();
  const previewUrls = new Map();
  const signature = item => JSON.stringify([item.artworkKey, item.product, item.material, item.format,item.shirtColor,printSpec(item)]);
  let promo = null;
  const calculation = () => P.calculate(items, pack, promo);
  const thingWord = n => ({ one: 'вещь', few: 'вещи', many: 'вещей', other: 'вещи' })[new Intl.PluralRules('ru-RU').select(n)];
  const records = TeploStore('teplo-cart', 'cart');
  function persist(items, pack) {
    return records('put', 'current', { version: 1, items, pack });
  }
  function transact(change) {
    const job = queue.then(async () => {
      await ready;
      const next = change(items.map(item => ({ ...item })), pack);
      try { await persist(next.items, next.pack); }
      catch(err){
        $('#cart-storage-note').textContent='Корзина доступна в этой вкладке. Браузер не смог сохранить последнее изменение на устройстве.';
      }
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
  function printSpec(item) {
    const p=item.printLayout||{scale:100,x:0,y:0};
    return 'принт '+p.scale+'%, X '+p.x+'%, Y '+p.y+'%';
  }
  function spec(item) {
    if (item.product === 'garland') return item.format + ' иллюстраций в белых картонных рамках · шнур и прищепки';
    const description = item.product === 'tshirt' ? `${item.colorName} · ${item.format}` : item.product === 'paper' ? `Наклейка · ${item.format}` : item.format;
    return description + ' · ' + printSpec(item);
  }
  function itemMarkup(row) {
    const amount = row.unit * row.qty - row.discount;
    const artworkList = row.product === 'garland'
      ? `<ol class="cart-artwork-title">${row.artworks.map(art => `<li>${esc(art.caption || 'Без названия')}${art.year ? ' · ' + esc(art.year) : ''}</li>`).join('')}</ol>`
      : `<p class="cart-artwork-title">${esc(row.caption || 'Без надписи')}${row.year ? ' · ' + esc(row.year) : ''}</p>`;
    return `<article class="cart-item" data-cart-id="${esc(row.id)}"><img src="${getPreview(row)}" alt="${esc(row.caption || 'Ваша история')} — ${esc(P.productName(row))}" width="84" height="112"><div class="cart-item-detail"><h3>${esc(P.productName(row))}</h3><p>${esc(spec(row))}</p>${artworkList}<div class="cart-item-tools"><button type="button" data-cart-action="edit" data-id="${esc(row.id)}">Изменить</button>${!['digital', 'garland'].includes(row.product) ? `<button type="button" data-cart-action="copy" data-id="${esc(row.id)}">Ещё вещь с этим рисунком</button>` : ''}</div><div class="cart-item-bottom">${row.product !== 'digital' ? `<div class="cart-quantity" aria-label="Количество: ${esc(P.productName(row))}"><button type="button" data-cart-action="minus" data-id="${esc(row.id)}" aria-label="Уменьшить количество: ${esc(P.productName(row))}" ${row.qty === 1 ? 'disabled' : ''}>−</button><output>${row.qty}</output><button type="button" data-cart-action="plus" data-id="${esc(row.id)}" aria-label="Увеличить количество: ${esc(P.productName(row))}" ${row.qty === 99 ? 'disabled' : ''}>+</button></div>` : '<span class="cart-file-count">1 файл</span>'}<div class="cart-row-price">${row.discount ? `<del>${P.money(row.unit * row.qty)}</del>` : ''}<strong>${row.freeDigital ? 'В подарок' : P.money(amount)}</strong>${row.qty > 1 ? `<small>${P.money(row.unit)} / шт.</small>` : ''}</div></div></div><button type="button" class="cart-remove" data-cart-action="remove" data-id="${esc(row.id)}" aria-label="Удалить: ${esc(P.productName(row))}">×</button></article>`;
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
    const hasGarland = c.rows.some(row => row.product === 'garland');
    $('#cart-minimum').textContent = hasGarland ? 'Арт-гирлянду можно заказать отдельно' : !c.physicalCount ? 'Электронный заказ — без минимума' : c.missing ? `Ещё ${c.missing} ${c.missing === 1 ? 'вещь' : 'вещи'} до минимального заказа` : `${c.physicalCount} ${thingWord(c.physicalCount)} · минимум собран`;
    $('#cart-progress-fill').style.width = `${(c.canOrder && c.physicalCount ? 100 : Math.min(100, c.physicalCount / 3 * 100))}%`;
    $('.cart-progress').classList.toggle('complete', c.canOrder);
    $('.cart-progress p').hidden = !c.physicalCount || hasGarland;
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
    window.TeploCheckout.setOrderState(!!c.physicalCount, promo?.door === true);
    if (action && focusedId) {
      const replacement = [...$('#cart-items').querySelectorAll('button')].find(button => button.dataset.cartAction === action && button.dataset.id === focusedId && !button.disabled);
      (replacement || $('#close-cart')).focus({ preventScroll: true });
    }
  }
  function open() { ready.then(() => { render(); if (!dialog.open) dialog.showModal(); }); }
  function continueShopping() { dialog.close(); document.querySelector('#constructor').scrollIntoView({ behavior: 'smooth' }); document.dispatchEvent(new Event('teplo:next-story')); }
  function validItem(item) {
    if (!P.unitPrice(item) || !(item.preview instanceof Blob)) return false;
    if (item.product === 'garland') return Array.isArray(item.artworks) && item.artworks.length === Number(item.format);
    if (item.product === 'paper' && item.material !== 'sticker') return false;
    return item.sourceFile instanceof Blob;
  }
  async function add(item, editingId) {
    if (!validItem(item) || !item.artworkKey) throw new Error('invalid_item');
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
    if (!Object.hasOwn(P.packaging, event.target.value)) return;
    try { await transact(list => ({ items: list, pack: event.target.value })); }
    catch { notice('Не удалось сохранить упаковку. Попробуйте снова.'); render(); }
  });
  $('#clear-cart').addEventListener('click', async () => {
    try { await transact(() => ({ items: [], pack: 'ordinary' })); document.dispatchEvent(new CustomEvent('teplo:cart-cleared')); notice('Корзина очищена, сохранённые фотографии удалены.'); }
    catch { notice('Не удалось очистить корзину. Попробуйте снова.'); }
  });
  const ready = (async () => {
    try {
      const saved = await records('get', 'current');
      if (saved?.version === 1 && Array.isArray(saved.items)) {
        items = saved.items.filter(validItem).slice(0, 50);
        pack = saved.pack === 'gift' ? 'gift' : 'ordinary';
      }
    } catch {
      $('#cart-storage-note').textContent = 'Хранилище браузера недоступно. Корзина работает до закрытия или обновления этой страницы.';
    }
    render();
  })();
  window.TeploCart = Object.freeze({ ready, add, open, spec, printSpec });
  const input = $('#cart-promo'), feedback = $('#promo-status');
  let timer, revision = 0;
  function rememberPromo(value) {
    try {
      if (value) sessionStorage.setItem('teplo-promo', value.code);
      else sessionStorage.removeItem('teplo-promo');
    } catch {}
  }
  function clearPromo() {
    ++revision;
    clearTimeout(timer);
    promo = null;
    rememberPromo(null);
    input.value = '';
    feedback.textContent = '';
    $('#promo-chip').hidden = true;
    render();
  }
  $('#remove-promo').addEventListener('click', () => { clearPromo(); input.focus(); });
  document.addEventListener('teplo:cart-cleared', clearPromo);
  function enablePromo(lookup) {
    $('#promo-field').hidden = false;
    async function check(value, version) {
      feedback.textContent = 'Проверяем промокод…';
      try {
        const { offer } = await lookup(value);
        if (version !== revision) return;
        if (!offer) {
          feedback.textContent = 'Такого промокода нет. Проверьте написание.';
          return;
        }
        const keepPrevious = promo && promo.rate > offer.rate;
        if (!keepPrevious) promo = offer;
        rememberPromo(promo);
        input.value = '';
        $('#promo-name').textContent = promo.code + ' · −' + promo.rate + '%';
        $('#promo-chip').hidden = false;
        feedback.textContent = keepPrevious ? 'Сохранён более выгодный промокод.' : 'Промокод принят. Применяется самая выгодная скидка.';
        render();
      } catch {
        if (version === revision) feedback.textContent = 'Не удалось проверить промокод. Нажмите Enter для повторной проверки.';
      }
    }
    function schedule(immediate) {
      clearTimeout(timer);
      const version = ++revision, value = input.value.trim();
      feedback.textContent = '';
      if (value) timer = setTimeout(() => check(value, version), immediate ? 0 : 450);
    }
    input.addEventListener('input', () => schedule(false));
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); schedule(true); }
    });
    try { input.value = sessionStorage.getItem('teplo-promo') || ''; } catch {}
    schedule(true);
  }
  window.startTestCheckout(() => ({ ...calculation(), pack, promoCode: promo?.code, promoDraft: !!input.value.trim() }), enablePromo);
})();
