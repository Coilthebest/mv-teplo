'use strict';
window.startTestCheckout = function(getCart) {
  if (new URLSearchParams(location.search).get('checkout') !== 'test') return;
  const button=document.querySelector('#test-payment');
  const status=document.querySelector('#test-payment-status');
  const key='teplo-test-checkout-v1';
  const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  button.hidden=false;
  let busy=false, attempt;
  try { attempt=JSON.parse(localStorage.getItem(key)); } catch {}
  async function request(route,data) {
    const res=await fetch(endpoint+route,{method:data?'POST':'GET',cache:'no-store',
      headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,
      signal:AbortSignal.timeout(25000)});
    const reply=await res.json();
    if (!res.ok) throw Error(typeof reply.error==='string'?reply.error:'Платёжный модуль пока недоступен.');
    return reply;
  }
  async function check() {
    const result=await request('payment-status',{order:attempt.order});
    const number=attempt.order.slice(0,12);
    if (result.status==='pending') {
      status.textContent='Заказ '+number+' ожидает тестовой оплаты.';
      button.textContent='Проверить статус';
      if (attempt.url) {
        const link=document.createElement('a');link.href=attempt.url;link.textContent='Продолжить тестовую оплату';
        status.append(' ',link);
      }
      return;
    }
    status.textContent=result.status==='paid'?'Тестовый заказ '+number+' оплачен. Деньги не списаны.':'Тестовый платёж отменён.';
    localStorage.removeItem(key);attempt=null;button.textContent='Начать новый тестовый заказ';
  }
  async function run() {
    if (busy) return;
    busy=true;button.disabled=true;
    try {
      if (attempt?.order) {await check();return}
      const cart=getCart();
      if (!cart.canOrder) throw Error('Проверьте минимальное количество товаров.');
      await window.TeploCheckout.ready;
      const recipient=window.TeploCheckout.validate();
      if (!recipient.ok) throw Error('Заполните поля получателя тестовыми данными.');
      const items=cart.rows.map(r=>({product:r.product,qty:r.qty,format:r.format,shirtColor:r.shirtColor,
        material:r.material,objectId:r.sealedArtwork?.objectId,caption:r.caption,year:r.year,yearLines:r.yearLines,photoHash:r.photoHash}));
      const order={items,pack:cart.pack,total:cart.total,recipient:recipient.data};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(order)));
      const fingerprint=Array.from(new Uint8Array(digest)).join('-');
      if (!attempt || attempt.fingerprint!==fingerprint || Date.now()-attempt.started>12*3600000) {
        attempt={fingerprint,attempt:crypto.randomUUID(),started:Date.now()};localStorage.setItem(key,JSON.stringify(attempt));
      }
      const result=await request('payment-create',{...order,attempt:attempt.attempt,started:attempt.started});
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
    button.disabled=false;
    status.textContent='Тестовый магазин. Используйте вымышленные данные получателя.';
    if (attempt?.order) {window.TeploCart.open();await run();}
  }).catch(()=>{status.textContent='Тестовая касса пока не подключена. Проверьте версию функции и тестовые ключи.';});
};
