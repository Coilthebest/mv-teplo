'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const mount = '/function/storage/teplo-hd';
const bucket = 'https://storage.yandexcloud.net/mv-teplo-hd/';
const stages = ['preparing','sent','delivered'];
const numberPattern = /^[0-9a-f]{12}$/i;
const secretPattern = /^[0-9a-f]{48}$/;
const sign = (value, key) => crypto.createHmac('sha256',key).update(value).digest('base64url');
function same(a,b) {
  return typeof a==='string' && typeof b==='string' && a.length===b.length &&
    /^[\w-]+$/.test(a) && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
function fail(status,message) {throw Object.assign(Error(message),{status});}
async function read(file) {
  try {return JSON.parse(await fs.readFile(path.join(mount,file),'utf8'));}
  catch(e) {if(e.code==='ENOENT')return null;throw e;}
}
function orderFile(id,kind) {return 'test-order-'+id+'-'+kind+'.json';}
async function ids() {
  return (await fs.readdir(mount)).map(name=>/^test-order-([a-f0-9]{48})-paid\.json$/.exec(name)?.[1]).filter(Boolean);
}
async function record(id) {
  const [order,progress] = await Promise.all([read(orderFile(id,'items')),read(orderFile(id,'progress'))]);
  if(!order)return null;
  const method=order.recipient?.deliveryMethod || (order.items.some(row=>row.product!=='digital')?'pickup':'digital');
  return {order,method,number:id.slice(0,12).toUpperCase(),stage:method==='digital'?'digital':progress?.stage||'preparing'};
}
async function customer(body) {
  const phone=require('./checkout-rules').phone(body.phone),number=String(body.number||'').trim();
  if(!phone||!numberPattern.test(number))fail(400,'Укажите телефон и 12 символов номера заказа.');
  const matches=(await ids()).filter(id=>id.startsWith(number.toLowerCase()));
  for(const id of matches) {
    const r=await record(id);
    if(r && require('./checkout-rules').phone(r.order.recipient.phone)===phone)
      return {number:r.number,stage:r.stage,method:r.method,test:r.order.test};
  }
  fail(404,'Заказ с такими данными не найден.');
}
async function manage(body,env) {
  if(!env.TELEGRAM_BOT_TOKEN || !same(body.token,sign('teplo-feedback-admin-v2',env.TELEGRAM_BOT_TOKEN)))
    fail(403,'Откройте кабинет по личной ссылке из Telegram.');
  if(body.action==='list') {
    const rows=[];
    const all=await ids();
    for(let i=0;i<all.length;i+=20)await Promise.all(all.slice(i,i+20).map(async id=>{
      const r=await record(id);
      if(!r)return;
      const recipient=r.order.recipient,pricing=require('./cart-pricing');
      const notice=await read(orderFile(id,'telegram-0'));
      rows.push({id,number:r.number,created:r.order.started,total:r.order.total,test:r.order.test,stage:r.stage,
        notified:Boolean(notice?.messageId),method:r.method,name:recipient.name,phone:recipient.phone,address:recipient.pickup?.address||recipient.doorAddress||recipient.manualAddress||'',
        pack:r.order.pack,promo:r.order.promoCode,items:r.order.items.map(item=>({name:pricing.productName(item),format:item.format,color:item.shirtColor,
          qty:item.qty,caption:item.caption,year:item.year,amount:item.unit*item.qty-(item.discount||0)}))});
    }));
    return {rows:rows.sort((a,b)=>b.created-a.created)};
  }
  if(body.action!=='update'||!secretPattern.test(body.id)||!stages.includes(body.stage))fail(400,'Проверьте статус.');
  if(!await read(orderFile(body.id,'paid')))fail(404,'Оплаченный заказ не найден.');
  const r=await record(body.id);
  if(!r||r.method==='digital')fail(400,'У электронного заказа нет доставки.');
  await fs.writeFile(path.join(mount,orderFile(body.id,'progress')),JSON.stringify({stage:body.stage,updated:Date.now()}));
  return {stage:body.stage};
}
function live(env) {return env.TEPLO_PAYMENT_MODE==='live' && /^live_/.test(env.YOOKASSA_SECRET_KEY||'') && /^\d+$/.test(env.YOOKASSA_SHOP_ID||'');}
async function provider(env,subpath,payload,key) {
  if(!live(env))fail(409,'Покупка пакетов откроется после подключения боевой кассы.');
  const authorization='Basic '+Buffer.from(env.YOOKASSA_SHOP_ID+':'+env.YOOKASSA_SECRET_KEY).toString('base64');
  const r=await fetch('https://api.yookassa.ru/v3/payments'+subpath,{method:payload?'POST':'GET',redirect:'error',
    headers:{Authorization:authorization,...(payload?{'Content-Type':'application/json','Idempotence-Key':key}:{})},
    body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
  if(!r.ok)fail(503,'Касса временно недоступна. Повторите попытку.');
  return r.json();
}
async function credits(route,body,env) {
  if(!secretPattern.test(body.pack||''))fail(400,'Не найден пакет генераций.');
  const pack=body.pack,metadata=sign('generation-pack:'+pack,env.YOOKASSA_SECRET_KEY||'disabled');
  const file='generation-payment-'+pack+'.json';
  if(route==='credit-create') {
    const pending=await read(file);
    if(pending) {
      const current=await provider(env,'/'+encodeURIComponent(pending.id));
      if(current.test!==false||current.metadata?.generation_pack!==metadata)fail(409,'Проверьте пакет.');
      return {url:current.status==='pending'&&current.confirmation?.confirmation_url||'https://mv-teplo.ru/credits.html#'+pack};
    }
    const p=await provider(env,'',{amount:{value:'50.00',currency:'RUB'},capture:true,payment_method_data:{type:'sbp'},
      description:'Teplo · 10 генераций иллюстраций',metadata:{generation_pack:metadata},
      confirmation:{type:'redirect',return_url:'https://mv-teplo.ru/credits.html#'+pack}},metadata);
    if(p.test!==false||!p.id||!p.confirmation?.confirmation_url)fail(503,'Проверьте состояние платежа.');
    await fs.writeFile(path.join(mount,file),JSON.stringify({id:p.id}));
    return {url:p.confirmation.confirmation_url};
  }
  const payment=await read(file);
  if(!payment)fail(404,'Пакет не найден.');
  const p=await provider(env,'/'+encodeURIComponent(payment.id));
  if(p.test!==false||p.id!==payment.id||p.metadata?.generation_pack!==metadata||p.amount?.currency!=='RUB'||p.amount.value!=='50.00')fail(409,'Не удалось подтвердить пакет.');
  if(p.status==='succeeded'&&p.paid) {
    await fs.writeFile(path.join(mount,'generation-paid-'+pack+'.json'),JSON.stringify({id:p.id}));
    return {status:'paid'};
  }
  return {status:p.status};
}
function visitor(ip,env) {
  if(!ip||!env.ANYMODEL_API_KEY)fail(503,'Не удалось определить лимит генераций.');
  return sign('generation-ip:'+ip,env.ANYMODEL_API_KEY);
}
function challenge(ip,env) {
  const nonce=crypto.randomBytes(12).toString('hex'),end=Date.now()+180000;
  const token=end+'.'+nonce;
  return {ticket:token+'.'+sign(visitor(ip,env)+':'+token,env.ANYMODEL_API_KEY),sale:live(env)};
}
function verify(ip,env,proof) {
  const ticket=proof?.ticket||'';
  const match=/^(\d{13})\.([a-f0-9]{24})\.([\w-]{43})$/.exec(ticket);
  if(!match||Number(match[1])<Date.now()||!Number.isInteger(proof.counter)||proof.counter<0||
    !same(match[3],sign(visitor(ip,env)+':'+match[1]+'.'+match[2],env.ANYMODEL_API_KEY))||
    crypto.createHash('sha256').update(ticket+':'+proof.counter).digest().readUInt16BE(0)>=32)
    fail(403,'Обновите страницу и повторите проверку перед созданием иллюстрации.');
  return match[2];
}
async function mutate(key,iam,change) {
  if(!iam)throw Error('storage_identity');
  const url=bucket+key+'.json',headers={Authorization:'Bearer '+iam};
  for(let attempt=0;attempt<8;attempt++) {
    const current=await fetch(url,{headers,signal:AbortSignal.timeout(6000)});
    if(!current.ok&&current.status!==404)throw Error('quota_read');
    const old=current.ok?await current.json():[];
    if(!current.ok)await current.body?.cancel();
    const etag=current.headers.get('etag');
    if(current.ok&&!etag)throw Error('quota_version');
    const next=change(old);
    if(!next)return false;
    const saved=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json',
      ...(etag?{'If-Match':etag}:{'If-None-Match':'*'})},body:JSON.stringify(next),signal:AbortSignal.timeout(6000)});
    await saved.body?.cancel();
    if(saved.ok)return true;
    if(![409,412].includes(saved.status))throw Error('quota_write');
  }
  fail(429,'Идёт другой запрос. Повторите немного позже.');
}
async function reserve(ip,env,iam,proof,packs) {
  const id=visitor(ip,env),nonce=verify(ip,env,proof);
  const day=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  const take=(key,limit)=>mutate(key,iam,old=>{
    if(old.includes(nonce))fail(409,'Эта попытка уже начата.');
    return old.length<limit?[...old,nonce]:null;
  });
  const key='generation-free-'+day+'-'+id;
  if(await take(key,3))return {key,nonce};
  for(const pack of Array.isArray(packs)?packs.slice(0,12):[]) {
    if(!secretPattern.test(pack)||!await read('generation-paid-'+pack+'.json'))continue;
    const key='generation-use-'+pack;
    if(await take(key,10))return {key,nonce};
  }
  fail(429,'Сегодня использованы 3 бесплатные генерации. Лимит обновится в 00:00 по Москве.');
}
async function release(reservation,iam) {
  if(reservation)await mutate(reservation.key,iam,old=>old.filter(n=>n!==reservation.nonce));
}
module.exports={challenge,reserve,release,customer,manage,credits};
