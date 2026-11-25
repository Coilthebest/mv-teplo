'use strict';
(() => {
  const $=selector=>document.querySelector(selector),results=$('#results'),notice=$('#notice');
  const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  const labels={preparing:'Готовится к отправке',sent:'Отправлен в ПВЗ',delivered:'Доставлен в ПВЗ',digital:'Электронный заказ готов'};
  function label(stage,method) {
    return method==='door'&&stage==='sent'?'Передан курьеру':method==='door'&&stage==='delivered'?'Доставлен получателю':labels[stage];
  }
  const money=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(value/100);
  function node(tag,text,cls) {const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;}
  async function api(route,body) {
    const r=await fetch(endpoint+route,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
    const data=await r.json();
    if(!r.ok)throw Error(typeof data.error==='string'?data.error:'Не удалось обновить заказ.');
    return data;
  }
  const safeMessage=e=>e.name==='TypeError'||e.name==='TimeoutError'?'Не удалось связаться с мастерской. Попробуйте ещё раз.':e.message;
  function card(r) {
    const el=node('article','','order-card');
    el.append(node('h2','Заказ № '+r.number),node('span',label(r.stage,r.method),'order-stage'));
    if(r.test)el.append(node('p','Тестовый заказ','order-meta'));
    return el;
  }
  const form=$('#tracking'),fragment=location.hash.slice(1);
  if(form) {
    if(/^[0-9a-f]{12}$/i.test(fragment))form.elements.number.value=fragment.toUpperCase();
    form.onsubmit=async event=>{
      event.preventDefault();results.replaceChildren();notice.textContent='Ищем заказ…';form.querySelector('button').disabled=true;
      try {const r=await api('order-track',Object.fromEntries(new FormData(form)));results.append(card(r));notice.textContent='';}
      catch(e){notice.textContent=safeMessage(e);}finally{form.querySelector('button').disabled=false;}
    };
    return;
  }
  const token=/^admin\.([\w-]{43})$/.exec(fragment)?.[1],refresh=$('#refresh');
  if(!token){refresh.hidden=true;notice.textContent='Откройте заказы из личного кабинета мастерской по ссылке из Telegram.';return;}
  function ownerCard(r) {
    const el=card(r),items=node('ul');
    el.append(node('p',new Date(r.created).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК · '+money(r.total),'order-meta'),
      node('p',[r.name,r.phone,r.address].filter(Boolean).join(' · ')));
    for(const item of r.items)items.append(node('li',[item.name+' × '+item.qty,item.format,item.color,item.caption,item.year,money(item.amount)].filter(Boolean).join(' · ')));
    el.append(items,node('p',r.notified?'Telegram · уведомление отправлено':'Telegram · отправка пока не подтверждена','order-meta'));
    if(r.method!=='digital')el.append(node('p','Упаковка · '+(r.pack==='gift'?'подарочная':'обычная')));
    if(r.promo)el.append(node('p','Промокод · '+r.promo));
    if(r.method!=='digital') {
      const box=node('div','','order-update'),select=node('select'),button=node('button','Сохранить статус'),message=node('p');
      message.setAttribute('role','status');select.setAttribute('aria-label','Статус заказа '+r.number);
      for(const stage of ['preparing','sent','delivered'])select.add(new Option(label(stage,r.method),stage,false,stage===r.stage));
      button.onclick=async()=>{select.disabled=button.disabled=true;try{
        const result=await api('order-office',{action:'update',token,id:r.id,stage:select.value});
        el.querySelector('.order-stage').textContent=label(result.stage,r.method);message.textContent='Статус сохранён.';
      }catch(e){message.textContent=safeMessage(e);}finally{select.disabled=button.disabled=false;}};
      box.append(select,button);el.append(box,message);
    }
    const link=node('a','Макеты и HD-файлы');link.href='print-order.html#'+r.id;el.append(link);return el;
  }
  refresh.onclick=async()=>{refresh.disabled=true;notice.textContent='Загружаем заказы…';try{
    const {rows}=await api('order-office',{action:'list',token});results.replaceChildren(...rows.map(ownerCard));notice.textContent='Оплаченных заказов · '+rows.length;
  }catch(e){notice.textContent=safeMessage(e);}finally{refresh.disabled=false;}};
  refresh.click();
})();
