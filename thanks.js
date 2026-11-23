'use strict';
(async function(){
  const $=s=>document.querySelector(s), action=$('#action'), progress=$('#progress');
  const key='teplo-test-checkout-v1', last='teplo-last-paid-v1';
  let attempt;
  try {attempt=JSON.parse(localStorage.getItem(key));} catch {}
  const id=location.hash.slice(1)||attempt?.order||localStorage.getItem(last);
  const valid=/^[a-f0-9]{48}$/.test(id||'');
  const show=(heading,message,info='')=>{
    $('h1').textContent=heading;$('#message').textContent=message;$('#info').textContent=info;
  };
  function control(label,handler){
    action.hidden=false;action.disabled=false;action.textContent=label;action.onclick=handler;
  }
  async function request(route,body){
    const r=await fetch('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route='+route,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({order:id,...body}),cache:'no-store',signal:AbortSignal.timeout(25000)});
    if(!r.ok) throw Error('request');
    return r.json();
  }
  function clearAttempt(){
    if(JSON.parse(localStorage.getItem(key)||'null')?.order===id) localStorage.removeItem(key);
  }
  if(!valid){show('Какой заказ проверить?','Откройте ссылку, по которой ЮKassa вернула вас после оплаты. Для прежней версии сайта понадобится тот же браузер.');return;}
  history.replaceState(null,'','#'+id);
  $('#number').textContent='Заказ № '+id.slice(0,12).toUpperCase();
  async function download(){
    action.disabled=true;progress.textContent='Готовим скачивание…';
    try {
      const result=await request('payment-status',{});
      if(result.status!=='paid') throw Error('unpaid');
      const delivery=result.delivery, files=[];
      const seen = new Set();
      if (!delivery?.files?.length) throw Error('missing_files');
      // Prefer the explicitly chosen electronic layout when a physical item shares its art.
      const entries = Array.from(delivery.files.entries()).sort((a,b) => Number(b[1].product==='digital') - Number(a[1].product==='digital'));
        for(const [position,[index,item]] of entries.entries()){
          progress.textContent='Готовим иллюстрацию '+(position+1)+' из '+delivery.files.length+'…';
          const chunks=[];
          for(let part=0;;part++){
            const r=await request('payment-file',{ticket:delivery.ticket,expires:delivery.expires,index,part});
            chunks.push(Uint8Array.from(atob(r.data),c=>c.charCodeAt(0)));
            if(r.last) break;
          }
          const original = new Blob(chunks,{type:'image/png'});
          const digest = await crypto.subtle.digest('SHA-256',await original.arrayBuffer());
          const key = new Uint8Array(digest).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          const label=[item.caption,item.year].filter(Boolean).join(' ').replace(/[\\/:*?"<>|\x00-\x1f]/g,' ').trim()||'Иллюстрация';
          files.push({name:String(files.length+1).padStart(2,'0')+' — '+label+'.jpg',bytes:await captionedJpeg(original,{caption:item.caption,year:item.year,yearLines:item.yearLines,printLayout:item.product==='digital'?item.printLayout:null})});
        }
      if (!files.length) throw Error('empty_delivery');
      const single=files.length===1;
      const imageType='image/jpeg';
      const blob=single?new Blob([files[0].bytes],{type:imageType}):orderZip(files);
      const a=document.createElement('a'),url=URL.createObjectURL(blob);
      a.href=url;a.download=single?files[0].name:'Teplo-'+id.slice(0,12)+'.zip';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      progress.textContent='Готово. Можно скачать ещё раз.';
    } catch {progress.textContent='Не удалось подготовить скачивание. Попробуйте скачать ещё раз.';}
    finally {action.disabled=false;}
  }
  async function check(){
    action.hidden=true;
    try {
      for(let n=0;n<8;n++){
        const r=await request('payment-status',{});
        if(r.status==='paid'){
          localStorage.setItem(last,id);clearAttempt();
          const count=r.delivery?.files?.length||0;
          let info='Файлы заказа пока недоступны. Сохраните эту страницу и откройте её после обновления сервиса.';
          if (count) info=r.delivery.preview?'Доступна предварительная версия иллюстрации.':'Вы можете скачать свои иллюстрации в HD-качестве';
          if (r.test) {
            show('Тестовая оплата прошла', 'Можно скачать HD-иллюстрации и проверить уведомление о заказе.', info);
          } else {
            show('Спасибо Вам большое.','Мы Вас не подведём! Теперь вы клиент ',info);
            const brand = document.createElement('em');
            brand.className = 'customer-brand';
            brand.textContent = 'mv-teplo.ru';
            $('#message').append(brand, '.');
          }
          if(r.physical){const eta=$('#order-eta');eta.textContent=r.deliveryMethod === 'door' ? 'Бесплатная доставка до двери' : r.deliveryEstimate || 'Срок доставки до ПВЗ пока неизвестен.';eta.hidden=false;}
          if (count) control(count>1?'Скачать HD-иллюстрации':r.delivery.preview?'Скачать иллюстрацию · JPG':'Скачать HD-иллюстрацию · JPG',download);
          if(!matchMedia('(prefers-reduced-motion: reduce)').matches) for(let n=0;n<28;n++){
            const i=document.createElement('i');i.style.left=Math.random()*100+'%';i.style.background=['#cf9464','#c2a259','#92a493','#d4a397'][n%4];i.style.animationDelay=Math.random()*.6+'s';$('main').append(i);setTimeout(()=>i.remove(),3200);
          }
          return;
        }
        if (r.status==='expired') { clearAttempt(); show('Попытка оплаты завершилась', 'Вернитесь в корзину, чтобы оформить заказ заново.'); return; }
        if(r.status==='canceled'){clearAttempt();show('Платёж отменён','Можно вернуться в корзину и попробовать снова.');return;}
        show('Ждём подтверждения','Как только ЮKassa подтвердит оплату, здесь появится кнопка скачивания.');
        if(n<7) await new Promise(r=>setTimeout(r,2500));
      }
    } catch {show('Проверяем ваш заказ','Связь с кассой прервалась. Нажмите ниже, чтобы проверить уже созданный платёж.');}
    control('Проверить оплату',check);
  }
  await check();
})();
