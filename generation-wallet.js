'use strict';
(() => {
  const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  const savedKey='teplo-generation-packs-v1',pendingKey='teplo-generation-purchase-v1';
  const valid=id=>typeof id==='string'&&/^[a-f0-9]{48}$/.test(id);
  function packs() {try{return JSON.parse(localStorage.getItem(savedKey)||'[]').filter(valid);}catch{return [];}}
  async function request(route,data) {
    const response=await fetch(endpoint+route,{method:data?'POST':'GET',cache:'no-store',headers:data?{'Content-Type':'application/json'}:undefined,
      body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(18000)});
    const result=await response.json();
    if(!response.ok)throw Object.assign(Error(typeof result.error==='string'?result.error:'Сервис временно недоступен.'),{status:response.status});
    return result;
  }
  async function proof() {
    let check;
    try {check=await request('generation-check');} catch(e){if(e.status===404)return {};throw e;}
    const {ticket}=check;
    const enc=new TextEncoder();
    for(let counter=0;counter<1000000;counter+=32) {
      const results=await Promise.all(Array.from({length:32},(_,i)=>crypto.subtle.digest('SHA-256',enc.encode(ticket+':'+(counter+i)))));
      const offset=results.findIndex(buf=>new DataView(buf).getUint16(0)<32);
      if(offset!==-1)return {proof:{ticket,counter:counter+offset},packs:packs().slice(-12).reverse()};
    }
    throw Error('Повторите проверку перед генерацией.');
  }
  window.TeploGeneration={proof};
  const $=s=>document.querySelector(s),message=$('#credit-result');
  if(message) {
    const retry=$('#credit-retry'),pack=location.hash.slice(1);
    if(!valid(pack)){message.textContent='Для проверки откройте ссылку со страницы оплаты пакета.';return;}
    retry.onclick=async()=>{retry.disabled=true;retry.hidden=true;message.textContent='Проверяем оплату…';
      try {
        const {status}=await request('credit-status',{pack});
        if(status==='paid'){
          localStorage.setItem(savedKey,JSON.stringify([...new Set([...packs(),pack])]));
          message.textContent='Оплата подтверждена. Пакет из 10 генераций привязан к этому браузеру. Сохраните эту страницу, чтобы восстановить доступ.';
        } else if(status==='canceled'){message.textContent='Платёж отменён. Можно вернуться в мастерскую.';}
        else {message.textContent='Касса ещё подтверждает оплату.';retry.hidden=false;return;}
        if(localStorage.getItem(pendingKey)===pack)localStorage.removeItem(pendingKey);
      } catch(e){message.textContent=e.message;retry.hidden=false;}finally{retry.disabled=false;}
    };
    retry.click();return;
  }
  const buy=$('#buy-credits'),note=$('#credit-note'),offer=$('#generation-offer');
  if(!buy||!offer)return;
  request('generation-check').then(({sale})=>{
    offer.hidden=false;
    if(!sale){offer.textContent='3 бесплатные генерации в день. Лимит обновляется в 00:00 по Москве.';return;}
    $('#credit-box').hidden=false;
  }).catch(()=>{});
  $('#open-credit-cart').onclick=()=>{window.TeploCart.open();requestAnimationFrame(()=>$('#buy-credits').focus());};
  buy.onclick=async()=>{buy.disabled=true;try{
    let pack=localStorage.getItem(pendingKey);
    if(!valid(pack)) {pack=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');localStorage.setItem(pendingKey,pack);}
    const {url}=await request('credit-create',{pack});
    if(new URL(url).protocol!=='https:')throw Error('Касса не вернула ссылку на оплату.');
    location.assign(url);
  }catch(e){note.textContent=e.message;}finally{buy.disabled=false;}};
})();
