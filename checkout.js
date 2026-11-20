'use strict';
(() => {
  const R = window.TeploCheckoutRules, $ = selector => document.querySelector(selector);
  const notice = message => document.dispatchEvent(new CustomEvent('teplo:notice', { detail: message }));
  const mapDialog = $('#pickup-dialog');
  let physical = false, pickup = null, manual = false, attempted = false, touched = false;
  let db = null, writeQueue = Promise.resolve(), saveTimer, frame = null, requestId = null, mapTimer;
  function raw() {
    return { name: $('#recipient-name').value, phone: $('#recipient-phone').value, city: pickup?.city || '', pickup, manualAddress: manual ? $('#recipient-pickup-address').value : '' };
  }
  function snapshot() { return { version: 1, remember: $('#remember-recipient').checked, fields: raw(), manual }; }
  let etaPoint=null,quote=null,etaTask=Promise.resolve();
  function updateEstimate(){
    const point=physical && !manual && pickup?.id || null;
    if(point===etaPoint && !(quote && quote.expires<=Date.now())) return etaTask;
    etaPoint=point;quote=null;
    const el=$('#pickup-eta');el.textContent=point?'Уточняем срок доставки…':'';
    etaTask=point?(async()=>{
      try {
        const r=await fetch('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=delivery-estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({point}),signal:AbortSignal.timeout(8500)});
        const q=r.ok?await r.json():null;
        if(point===etaPoint && q?.point===point && q.signature){quote=q;el.textContent=q.label;return;}
      } catch {}
      if(point===etaPoint) el.textContent='Срок доставки до этого ПВЗ пока неизвестен.';
    })():Promise.resolve();
    return etaTask;
  }
  async function shippingQuote(){await updateEstimate();return quote;}
  function drawPickup() {
    updateEstimate();
    $('#manual-pickup-field').hidden = !manual;
    $('#manual-pickup-toggle').setAttribute('aria-expanded', String(manual));
    $('#manual-pickup-toggle').textContent = manual ? 'Скрыть ручной ввод адреса' : 'Указать адрес ПВЗ вручную';
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
    if (attempted) showErrors(R.validate(raw(), physical).errors, false);
    if ($('#remember-recipient').checked) saveTimer = setTimeout(() => writeRemembered(snapshot()), 350);
  }
  function showErrors(errors, focus) {
    const fields = { name: '#recipient-name', phone: '#recipient-phone', pickup: manual ? '#recipient-pickup-address' : '#choose-pickup' };
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
    const result = R.validate(raw(), physical); showErrors(result.errors, focus);
    return result;
  }
  function setOrderState(hasPhysical) {
    physical = hasPhysical;updateEstimate();
    $('#recipient-delivery').hidden = !physical;
    $('#digital-contact-note').hidden = physical;
    if (attempted) showErrors(R.validate(raw(), physical).errors, false);
  }
  function useManual() {
    if (mapDialog.open) mapDialog.close();
    pickup = null; manual = true; drawPickup(); changed();
    $('#recipient-pickup-address').focus({ preventScroll: true });
    $('#manual-pickup-field').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    frame.src = `pickup.html?v=2#${new URLSearchParams({ city, requestId })}`;
    $('#pickup-frame-slot').replaceChildren(frame);
    mapDialog.showModal();
    clearTimeout(mapTimer);
    mapTimer = setTimeout(() => { if (mapDialog.open) $('#pickup-map-status').textContent = 'Если карта не загрузилась, укажите адрес ПВЗ вручную.'; }, 14000);
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.data?.requestId !== requestId) return;
    if (event.data.type === 'teplo:pickup-ready') {
      clearTimeout(mapTimer); $('#pickup-map-status').textContent = 'Найдите удобный пункт и подтвердите выбор на карте.';
    } else if (event.data.type === 'teplo:pickup-error') {
      clearTimeout(mapTimer); $('#pickup-map-status').textContent = 'Карта сейчас недоступна. Укажите адрес ПВЗ вручную.';
    } else if (event.data.type === 'teplo:pickup-selected') {
      const selected = R.point(event.data.point); if (!selected) return;
      pickup = selected; manual = false;
      $('#recipient-pickup-address').value = '';
      drawPickup(); changed(); mapDialog.close(); notice('Пункт выдачи добавлен к заказу.');
    }
  });
  mapDialog.addEventListener('close', () => { clearTimeout(mapTimer); frame = null; requestId = null; $('#pickup-frame-slot').replaceChildren(); });
  $('#close-pickup').addEventListener('click', () => mapDialog.close());
  $('#pickup-map-manual').addEventListener('click', useManual);
  $('#choose-pickup').addEventListener('click', openMap);
  $('#manual-pickup-toggle').addEventListener('click', () => {
    if (!manual) useManual(); else { manual = false; drawPickup(); changed(); }
  });
  ['#recipient-name', '#recipient-phone', '#recipient-pickup-address'].forEach(selector => $(selector).addEventListener('input', changed));
  $('#recipient-phone').addEventListener('blur', () => { const value = R.phone($('#recipient-phone').value); if (value) $('#recipient-phone').value = value; changed(); });
  $('#remember-recipient').addEventListener('change', () => { touched = true; clearTimeout(saveTimer); writeRemembered(snapshot()); });
  function clear() {
    clearTimeout(saveTimer); touched = true; attempted = false; pickup = null; manual = false;
    ['#recipient-name', '#recipient-phone', '#recipient-pickup-address'].forEach(selector => { $(selector).value = ''; });
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
        $('#recipient-pickup-address').value = R.fullManualAddress(fields.manualAddress, fields.city);
        pickup = R.point(fields.pickup); manual = !!saved.manual && !pickup;
        $('#remember-recipient').checked = true;
        $('#recipient-storage-note').textContent = 'Данные сохранены только в этом браузере. Их можно очистить в любой момент.';
        drawPickup();
      }
    } catch { db = null; }
  })();
  window.TeploCheckout = Object.freeze({ ready, validate, setOrderState, shippingQuote });
})();
