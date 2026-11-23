'use strict';
window.startPayment = function(getCart, enablePromo) {
  const button=document.querySelector('#pay-order');
  const status=document.querySelector('#payment-status');
  const note = document.querySelector('.cart-checkout-note');
  const key='teplo-test-checkout-v1';
  const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';

  let busy=false, attempt;
  try { attempt=JSON.parse(localStorage.getItem(key)); } catch {}
  async function request(route,data) {
    const res=await fetch(endpoint+route,{method:data?'POST':'GET',cache:'no-store',
      headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,
      signal:AbortSignal.timeout(25000)});
    const reply=await res.json().catch(() => ({}));
    if (!res.ok) throw Error(typeof reply.error==='string'?reply.error:'Платёжный модуль пока недоступен.');
    return reply;
  }
  async function check() {
    const result=await request('payment-status',{order:attempt.order});
    if (result.status==='paid') { location.replace('/thanks.html#'+attempt.order); return; }
    const number=attempt.order.slice(0,12);
    if (result.status==='pending') {
      status.textContent='Заказ '+number+' ожидает оплаты.';
      button.textContent='Проверить статус';
      if (attempt.url) {
        const link=document.createElement('a');link.href=attempt.url;link.textContent='Продолжить оформление';
        status.append(' ',link);
      }
      return;
    }
    status.textContent=result.status==='expired'
      ? 'Эта попытка оплаты завершилась. Можно оформить заказ заново.'
      : 'Платёж отменён.';
    localStorage.removeItem(key);attempt=null;button.textContent='Оплатить';
  }
  async function run() {
    if (busy) return;
    busy=true;button.disabled=true;
    try {
      if (attempt?.order) {await check();return}
      const cart=getCart();
      if (cart.promoDraft) throw Error('Дождитесь проверки промокода или очистите поле, чтобы продолжить.');
      const outdated = cart.rows.find(row => row.product === 'garland'
        ? row.artworks.some(art => !art.objectId)
        : !row.sealedArtwork?.objectId || row.testArtwork);
      if (outdated) {
        const edit = [...document.querySelectorAll('[data-cart-action="edit"]')]
          .find(button => button.dataset.id === outdated.id);
        status.textContent = 'Обновите иллюстрацию для товара «' + window.TeploPricing.productName(outdated) + '».';
        if (edit) {
          const fix = document.createElement('button');
          fix.type = 'button';
          fix.className = 'button button-outline';
          fix.textContent = 'Открыть товар';
          fix.addEventListener('click', () => edit.click());
          status.append(' ', fix);
        }
        return;
      }
      if (!cart.canOrder) throw Error('Проверьте минимальное количество товаров.');
      await window.TeploCheckout.ready;
      const recipient=window.TeploCheckout.validate();
      if (!recipient.ok) throw Error('Заполните поля получателя.');
      const items=cart.rows.map(r=>r.product === 'garland' ? {
        product: r.product, qty: r.qty, format: r.format,
        artworks: r.artworks.map(({objectId, caption, year, yearLines}) => ({objectId, caption, year, yearLines}))
      } : {product:r.product,qty:r.qty,printLayout:r.printLayout,format:r.format,shirtColor:r.shirtColor,
        material:r.material,objectId:r.sealedArtwork?.objectId,caption:r.caption,year:r.year,yearLines:r.yearLines,photoHash:r.photoHash});
      const order={items,pack:cart.pack,total:cart.total,promoCode:cart.promoCode,recipient:recipient.data};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(order)));
      const fingerprint=Array.from(new Uint8Array(digest)).join('-');
      if (!attempt || attempt.fingerprint!==fingerprint || Date.now()-attempt.started>12*3600000) {
        attempt={fingerprint,attempt:crypto.randomUUID(),started:Date.now()};localStorage.setItem(key,JSON.stringify(attempt));
      }
      const shippingQuote=await window.TeploCheckout.shippingQuote();
      const result=await request('payment-create',{...order,shippingQuote,attempt:attempt.attempt,started:attempt.started});
      attempt.order=result.order;
      if (result.url && new URL(result.url).protocol==='https:') attempt.url=result.url;
      localStorage.setItem(key,JSON.stringify(attempt));
      if (attempt.url) location.assign(attempt.url); else await check();
    } catch(err) {status.textContent=err.message;}
    finally {busy=false;button.disabled=false;}
  }
  button.addEventListener('click',run);
  button.disabled=true;
  request('payment-config').then(async config=>{
    if (!config.enabled) throw Error();
    if (config.promoCodes) enablePromo(code => request('promo-check', {code}));
    button.disabled=false;
    status.textContent='';
    note.hidden=false;
    note.textContent=config.mode==='live'
      ? 'Оплата через СБП. После оплаты вы получите HD-копии.'
      : 'Сейчас ЮKassa принимает тестовые платежи без списания денег.';
    if (attempt?.order) {window.TeploCart.open();await run();}
  }).catch(()=>{status.textContent='Оплата временно недоступна. Попробуйте позже.';});
};
