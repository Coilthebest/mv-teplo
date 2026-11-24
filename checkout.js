'use strict';
(() => {
  const R = window.TeploCheckoutRules, $ = selector => document.querySelector(selector);
  const notice = message => document.dispatchEvent(new CustomEvent('teplo:notice', { detail: message }));
  const mapDialog = $('#pickup-dialog');
  let physical = false, pickup = null, allowDoor = false, attempted = false, touched = false;
  let db = null, writeQueue = Promise.resolve(), saveTimer, frame = null, requestId = null, mapTimer;
  const isDoor = () => physical && allowDoor && $('#delivery-method').value === 'door';
  function raw() {
    return { name: $('#recipient-name').value, phone: $('#recipient-phone').value, pickup: isDoor() ? null : pickup,
      deliveryMethod: isDoor() ? 'door' : 'pickup', doorAddress: isDoor() ? $('#door-address').value : '' };
  }
  function snapshot() {
    return { version: 1, remember: $('#remember-recipient').checked, fields: raw(),
      widgetEstimate: currentWidgetDate(pickup?.id) ? widgetEstimate : null };
  }
  let etaPoint=null,quote=null,etaTask=Promise.resolve(),widgetEstimate=null,etaVersion=0,etaTimer;
  const widgetCalculationVersion = 2;
  function currentWidgetDate(point) {
    return widgetEstimate?.point === point && widgetEstimate.expires > Date.now() ? widgetEstimate.date : '';
  }
  function showWidgetDate(el, date) {
    el.textContent = `Ориентировочная доставка: ${date}. Планируем отправку на следующий день (посылка до 2 кг).`;
  }
  function updateEstimate(){
    const point=physical && !isDoor() && pickup?.id || null;
    const widgetDate = currentWidgetDate(point);
    if(point===etaPoint && !(quote && quote.expires<=Date.now()) && !(widgetEstimate?.point === point && !widgetDate)) return etaTask;
    if (widgetEstimate && widgetEstimate.expires<=Date.now()) widgetEstimate=null;
    etaPoint=point;quote=null;
    const version=++etaVersion;
    clearTimeout(etaTimer);
    const el=$('#pickup-eta');el.textContent=point?'Уточняем срок доставки…':'';
    if (widgetDate) {
      showWidgetDate(el,widgetDate);
      etaTimer=setTimeout(updateEstimate,Math.max(0,widgetEstimate.expires-Date.now()));
    }
    etaTask=point?(async()=>{
      try {
        const r=await fetch('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=delivery-estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({point}),signal:AbortSignal.timeout(8500)});
        const q=r.ok?await r.json():null;
        if(version===etaVersion && q?.point===point && q.signature){quote=q;if(!currentWidgetDate(point))el.textContent=q.label+' по расчёту перевозчика. Добавьте 1 день на изготовление.';return;}
      } catch {}
      if(version===etaVersion && !currentWidgetDate(point)) {
        const calculator=document.createElement('a');
        calculator.href='https://dostavka.yandex.ru/order/ndd_self_pickup/';
        calculator.target='_blank';
        calculator.rel='noopener noreferrer';
        calculator.textContent='Посмотреть срок в Яндексе';
        el.replaceChildren('Изготовление — 1 день. Если дата не рассчиталась, выберите ПВЗ повторно или ', calculator,
          '. Пункт отправки — Москва, ул. Бехтерева, 25 к2. К сроку Яндекса прибавьте 1 день.');
      }
    })():Promise.resolve();
    return etaTask;
  }
  async function shippingQuote(){await updateEstimate();return quote;}
  function drawPickup() {
    updateEstimate();
    $('#delivery-choice').hidden = !physical || !allowDoor;
    $('#door-field').hidden = !isDoor();
    $('.cart-shipping-method').textContent = isDoor() ? 'до двери' : 'до ПВЗ Яндекс Маркета';
    $('#pickup-field').hidden = isDoor();
    $('#pickup-selected').hidden = !pickup;
    $('#pickup-address').textContent = pickup?.address || '';
    $('#pickup-source-note').textContent = pickup ? 'Выбран на карте Яндекса' : '';
    $('#choose-pickup-text').textContent = pickup ? 'Изменить пункт выдачи' : 'Выбрать ПВЗ на карте';
  }
  function writeRemembered(value) {
    writeQueue = writeQueue.then(async () => {
      await ready;
      if (!db) { if (value.remember) throw new Error('storage_unavailable'); return; }
      await new Promise((resolve, reject) => {
        const tx = db.transaction('cart', 'readwrite');
        if (value.remember) tx.objectStore('cart').put(value, 'checkout');
        else tx.objectStore('cart').delete('checkout');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      $('#recipient-storage-note').textContent = value.remember ? 'Данные сохранены только в этом браузере. Их можно очистить в любой момент.' : 'Без этой галочки данные получателя не сохраняются после обновления страницы.';
    }).catch(() => { $('#recipient-storage-note').textContent = 'Не удалось изменить сохранение данных в браузере. Очистить их можно также в настройках данных сайта.'; });
    return writeQueue;
  }
  function changed() {
    touched = true; clearTimeout(saveTimer);
    if (attempted) showErrors(R.validate(raw(), physical, allowDoor).errors, false);
    if ($('#remember-recipient').checked) saveTimer = setTimeout(() => writeRemembered(snapshot()), 350);
  }
  function showErrors(errors, focus) {
    const fields = { name: '#recipient-name', phone: '#recipient-phone', pickup: isDoor() ? '#door-address' : '#choose-pickup' };
    Object.entries(fields).forEach(([key, selector]) => {
      const message = $(`#recipient-${key}-error`);
      message.textContent = errors[key] || ''; message.hidden = !errors[key];
      $(selector).setAttribute('aria-invalid', String(!!errors[key]));
    });
    if (focus) {
      const first = Object.keys(fields).find(key => errors[key]);
      if (first) { $(fields[first]).focus({ preventScroll: true }); $(fields[first]).scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }
  function validate(focus = true) {
    attempted = true;
    const result = R.validate(raw(), physical, allowDoor); showErrors(result.errors, focus);
    return result;
  }
  function setOrderState(hasPhysical, doorEligible) {
    if (doorEligible && !allowDoor) $('#delivery-method').value = 'door';
    allowDoor = !!doorEligible;
    physical = hasPhysical;
    drawPickup();
    $('#recipient-delivery').hidden = !physical;
    $('#digital-contact-note').hidden = physical;
    if (attempted) showErrors(R.validate(raw(), physical, allowDoor).errors, false);
  }
  function openMap() {
    const city = pickup?.city || 'Москва';
    requestId = crypto.randomUUID();
    $('#pickup-city-label').textContent = 'Найдите свой город или адрес в поиске на карте.';
    $('#pickup-map-status').textContent = 'Загружаем карту пунктов выдачи…';
    frame = document.createElement('iframe');
    frame.title = `Пункты выдачи Яндекс Маркета: ${city}`;
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.setAttribute('allow', "geolocation 'none'");
    frame.referrerPolicy = 'no-referrer';
    frame.src = `pickup.html?v=5#${new URLSearchParams({ city, requestId })}`;
    $('#pickup-frame-slot').replaceChildren(frame);
    mapDialog.showModal();
    clearTimeout(mapTimer);
    mapTimer = setTimeout(() => { if (mapDialog.open) $('#pickup-map-status').textContent = 'Если карта не загрузилась, закройте её и попробуйте снова.'; }, 14000);
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.data?.requestId !== requestId) return;
    if (event.data.type === 'teplo:pickup-ready') {
      clearTimeout(mapTimer); $('#pickup-map-status').textContent = 'Выберите удобный пункт. Яндекс покажет ориентировочную дату доставки (посылка до 2 кг). Планируем отправку на следующий день.';
    } else if (event.data.type === 'teplo:pickup-error') {
      clearTimeout(mapTimer); $('#pickup-map-status').textContent = 'Карта сейчас недоступна. Попробуйте открыть её ещё раз.';
    } else if (event.data.type === 'teplo:pickup-selected') {
      const selected = R.point(event.data.point); if (!selected) return;
      pickup = selected;
      const date = R.widgetDate(event.data.deliveryDate);
      widgetEstimate = date ? {version: widgetCalculationVersion, point: selected.id, date, expires: Date.now()+30*60*1000} : null;
      etaPoint = null;
      drawPickup(); changed(); mapDialog.close(); notice('Пункт выдачи добавлен к заказу.');
    }
  });
  mapDialog.addEventListener('close', () => { clearTimeout(mapTimer); frame = null; requestId = null; $('#pickup-frame-slot').replaceChildren(); });
  $('#close-pickup').addEventListener('click', () => mapDialog.close());
  $('#choose-pickup').addEventListener('click', openMap);
  $('#delivery-method').addEventListener('change', () => { drawPickup(); changed(); });
  ['#recipient-name', '#recipient-phone', '#door-address'].forEach(selector => $(selector).addEventListener('input', changed));
  $('#recipient-phone').addEventListener('blur', () => { const value = R.phone($('#recipient-phone').value); if (value) $('#recipient-phone').value = value; changed(); });
  $('#remember-recipient').addEventListener('change', () => { touched = true; clearTimeout(saveTimer); writeRemembered(snapshot()); });
  function clear() {
    clearTimeout(saveTimer); touched = true; attempted = false; pickup = null; widgetEstimate = null;
    ['#recipient-name', '#recipient-phone', '#door-address'].forEach(selector => { $(selector).value = ''; });
    $('#remember-recipient').checked = false; drawPickup(); showErrors({}, false);
    return writeRemembered(snapshot());
  }
  $('#clear-recipient').addEventListener('click', async () => { await clear(); notice('Данные получателя очищены.'); });
  document.addEventListener('teplo:cart-cleared', clear);
  const ready = (async () => {
    try {
      db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('teplo-cart', 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('cart')) request.result.createObjectStore('cart'); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('blocked'));
      });
      db.onversionchange = () => { db.close(); db = null; };
      const saved = await new Promise((resolve, reject) => {
        const request = db.transaction('cart').objectStore('cart').get('checkout');
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      if (!touched && saved?.version === 1 && saved.remember && saved.fields) {
        const fields = saved.fields;
        $('#recipient-name').value = R.text(fields.name, 80); $('#recipient-phone').value = R.text(fields.phone, 50);
        $('#door-address').value = R.text(fields.doorAddress, 500);
        pickup = R.point(fields.pickup);
        const savedEstimate = saved.widgetEstimate;
        const savedDate = R.widgetDate(savedEstimate?.date);
        if (pickup && savedDate && savedEstimate.version === widgetCalculationVersion && savedEstimate.point === pickup.id &&
            Number.isSafeInteger(savedEstimate.expires) && savedEstimate.expires > Date.now() &&
            savedEstimate.expires <= Date.now()+30*60*1000) {
          widgetEstimate = {version: widgetCalculationVersion, point: pickup.id, date: savedDate, expires: savedEstimate.expires};
        }
        $('#remember-recipient').checked = true;
        $('#recipient-storage-note').textContent = 'Данные сохранены только в этом браузере. Их можно очистить в любой момент.';
        drawPickup();
      }
    } catch { db = null; }
  })();
  window.TeploCheckout = Object.freeze({ ready, validate, setOrderState, shippingQuote });
})();
