'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const telegram = require('./telegram');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const types = {review:'Отзыв',suggestion:'Предложение',question:'Вопрос'};
const site = 'https://mv-teplo.ru';
const inProgress = new Set();
function error(status,message) { throw Object.assign(Error(message),{status}); }
function clean(value,max) {
  if(typeof value!=='string'||value.length>max)error(400,'Проверьте длину полей.');
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim();
}
function file(mount,folder,id) { return path.join(mount,'feedback',folder,id+'.json'); }
async function read(target) {
  try{return JSON.parse(await fs.readFile(target,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
}
async function write(target,value) {
  await fs.mkdir(path.dirname(target),{recursive:true});
  // Mounted Object Storage supports overwrite with storage.uploader, not rename/delete.
  await fs.writeFile(target,JSON.stringify(value));
}
async function locked(mount,id,operation) {
  const key=mount+'/'+id;
  if(inProgress.has(key))error(429,'Запрос обрабатывается. Повторите через минуту.');
  inProgress.add(key);
  try{return await operation();}finally{inProgress.delete(key);}
}
function sign(value,env) {
  if(!env.TELEGRAM_BOT_TOKEN)error(503,'Сервис временно недоступен.');
  return crypto.createHmac('sha256',env.TELEGRAM_BOT_TOKEN).update(value).digest('base64url');
}
function same(a,b) {return typeof a==='string'&&typeof b==='string'&&/^[A-Za-z0-9_-]{43}$/.test(a)&&/^[A-Za-z0-9_-]{43}$/.test(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function adminToken(env) {return sign('teplo-feedback-admin-v2',env);}
function emailReady(env,iamToken) {return Boolean(env.FEEDBACK_EMAIL_FROM&&iamToken);}
function maskedEmail(email) {
  if(!email)return '';
  const [local,domain]=email.split('@');
  if(local.length<=5)return '*****@'+domain;
  const start=Math.floor((local.length-5)/2);
  return local.slice(0,start)+'*****'+local.slice(start+5)+'@'+domain;
}
function publicEntry(entry,reply='') {
  return {type:entry.type,name:entry.name,text:entry.text,date:entry.date,reply,email:maskedEmail(entry.email),
    verified:Boolean(entry.verifiedAt),rating:entry.type==='review'&&Number.isInteger(entry.rating)?entry.rating:null};
}
async function files(mount,folder) {
  const names=await fs.readdir(path.join(mount,'feedback',folder)).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  return names.filter(n=>n.endsWith('.json')&&uuid.test(n.slice(0,-5))).map(n=>n.slice(0,-5));
}
async function list(mount,env,iamToken) {
  const entries=await Promise.all((await files(mount,'published')).map(id=>read(file(mount,'published',id))));
  const items=entries.filter(e=>e&&!e.hidden).map(e=>publicEntry(e,e.reply||'')).sort((a,b)=>b.date.localeCompare(a.date));
  const rated=items.filter(e=>e.type==='review'&&e.verified&&e.rating>=1&&e.rating<=5);
  return {version:2,verificationRequired:true,available:emailReady(env,iamToken)&&await telegram.ready(env),items,
    rating:{count:rated.length,average:rated.length?rated.reduce((sum,e)=>sum+e.rating,0)/rated.length:null}};
}
async function rateLimit(mount,scope) {
  const id=crypto.createHash('sha256').update(scope).digest('hex');
  await locked(mount,'rate-'+id,async()=>{
    const target=file(mount,'limits',id),now=Date.now();let value=await read(target);
    if(!value||value.until<=now)value={count:0,until:now+3600000};
    if(value.count>=4)error(429,'Слишком много запросов. Попробуйте через час.');
    value.count++;await write(target,value);
  });
}
function confirmation(entry,id,env) {return sign('feedback-email-v2:'+id+':'+entry.email+':'+entry.expires,env);}
async function submit(body,mount,env,ip,iamToken) {
  const {id,type}=body;
  if(!uuid.test(id||'')||!Object.hasOwn(types,type)||body.website!==''||body.consent!==true)error(400,'Заполните обязательные поля.');
  const name=clean(body.name,50),text=clean(body.text,1000),email=clean(body.email,254).toLowerCase();
  if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email))error(400,'Укажите действующую электронную почту.');
  if(text.length<5)error(400,'Напишите хотя бы пять символов.');
  const rating=type==='review'?Number(body.rating):null;
  if(type==='review'&&(!Number.isInteger(rating)||rating<1||rating>5))error(400,'Поставьте оценку от 1 до 5 звёзд.');
  if(!emailReady(env,iamToken))error(503,'Подтверждение почты пока недоступно. Попробуйте позже.');
  return locked(mount,id,async()=>{
    const target=file(mount,'received',id);let entry=await read(target);
    if(entry&&(entry.email!==email||entry.type!==type||entry.text!==text||entry.name!==name||entry.rating!==rating))error(409,'Сообщение изменилось. Отправьте его заново.');
    if(entry&&entry.expires<Date.now())error(410,'Срок подтверждения истёк. Заполните форму заново.');
    if(entry?.emailSentAt)return {confirmationRequired:true};
    if(!entry){
      await rateLimit(mount,'ip:'+(ip||'unknown'));await rateLimit(mount,'email:'+email);
      entry={type,name,text,email,rating,date:new Date().toISOString(),expires:Date.now()+86400000};await write(target,entry);
    }
    const url=site+'/feedback-confirm.html#'+id+'.'+confirmation(entry,id,env);
    const mailText='Вы оставили '+types[type].toLowerCase()+' на mv-teplo.ru. Чтобы передать сообщение мастерской, откройте ссылку и нажмите «Подтвердить отправку»:\n\n'+url+'\n\nСсылка действует 24 часа. Если вы не отправляли сообщение, проигнорируйте письмо.';
    const response=await fetch('https://postbox.cloud.yandex.net/v2/email/outbound-emails',{
      method:'POST',redirect:'error',headers:{'X-YaCloud-SubjectToken':iamToken,'Content-Type':'application/json'},
      body:JSON.stringify({FromEmailAddress:env.FEEDBACK_EMAIL_FROM,Destination:{ToAddresses:[email]},
        Content:{Simple:{Subject:{Data:'Подтвердите сообщение для Teplo',Charset:'UTF-8'},Body:{Text:{Data:mailText,Charset:'UTF-8'}}}}}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)error(503,'Не удалось отправить письмо. Попробуйте позже.');
    const receipt=await response.json();
    if(typeof receipt.MessageId!=='string'||!receipt.MessageId)error(503,'Не удалось подтвердить отправку письма. Попробуйте позже.');
    entry.emailMessageId=receipt.MessageId;entry.emailSentAt=new Date().toISOString();await write(target,entry);return {confirmationRequired:true};
  });
}
async function verify(body,mount,env) {
  const {id,token}=body;if(!uuid.test(id||''))error(400,'Ссылка недействительна.');
  return locked(mount,id,async()=>{
    const target=file(mount,'received',id),entry=await read(target);
    if(!entry?.email||!same(token,confirmation(entry,id,env)))error(403,'Ссылка недействительна.');
    if(!entry.verifiedAt&&entry.expires<Date.now())error(410,'Срок ссылки истёк. Отправьте сообщение ещё раз.');
    if(!entry.verifiedAt){entry.verifiedAt=new Date().toISOString();await write(target,entry);}
    if(!await read(file(mount,'delivered',id))){
      const url=site+'/feedback-admin.html#'+id+'.'+sign('teplo-feedback-v1:'+id,env);
      const dashboard=site+'/feedback-admin.html#admin.'+adminToken(env);
      const message=types[entry.type]+' Teplo\nАвтор: '+(entry.name||'Гость')+'\nПочта подтверждена: '+entry.email+(entry.rating?'\nОценка: '+entry.rating+' из 5':'')+'\n\n'+entry.text;
      const messageId=await telegram.sendMessage(message,env,{inline_keyboard:[[{text:'Открыть сообщение',url}],[{text:'Все отзывы и предложения',url:dashboard}]]});
      await write(file(mount,'delivered',id),{messageId});
    }
    return {confirmed:true};
  });
}
async function admin(body,mount,env) {
  if(!same(body.adminToken,adminToken(env)))error(403,'Откройте кабинет по защищённой ссылке из Telegram.');
  if(body.action!=='list')return moderate(body,mount,env);
  const items=await Promise.all((await files(mount,'received')).map(async id=>{
    const entry=await read(file(mount,'received',id)),published=await read(file(mount,'published',id));
    return entry?{id,entry,published:Boolean(published&&!published.hidden),reply:published?.reply||entry.reply||''}:null;
  }));
  return {items:items.filter(Boolean).sort((a,b)=>b.entry.date.localeCompare(a.entry.date))};
}
async function moderate(body,mount,env) {
  const {id,action}=body,globalAccess=same(body.adminToken,adminToken(env));
  if(!uuid.test(id||'')||(!globalAccess&&!same(body.signature,sign('teplo-feedback-v1:'+id,env))))error(403,'Ссылка модерации недействительна.');
  return locked(mount,id,async()=>{
    const target=file(mount,'received',id),entry=await read(target);if(!entry)error(404,'Сообщение не найдено.');
    const publishedFile=file(mount,'published',id);
    if(action==='delete'){
      if(!globalAccess)error(403,'Для полного удаления откройте кабинет всех сообщений.');
      const previous=await read(publishedFile);
      if(previous&&!previous.hidden)await write(publishedFile,{...previous,hidden:true});
      for(const targetFile of [publishedFile,file(mount,'delivered',id),target]){
        await fs.unlink(targetFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
      }
      return {deleted:true};
    }
    if(action==='publish'){
      if(entry.email&&!entry.verifiedAt)error(409,'Автор ещё не подтвердил почту.');
      entry.reply=clean(body.reply||'',1000);await write(target,entry);
      await write(publishedFile,{...entry,expires:undefined,emailSentAt:undefined});
    }else if(action==='hide'){
      const previous=await read(publishedFile);
      if(previous?.reply&&!entry.reply){entry.reply=previous.reply;await write(target,entry);}
      if(previous)await write(publishedFile,{...previous,hidden:true});
    }
    else if(action!=='read')error(400,'Неизвестное действие.');
    const published=await read(publishedFile);
    return {entry,published:Boolean(published&&!published.hidden),reply:entry.reply||published?.reply||'',adminUrl:site+'/feedback-admin.html#admin.'+adminToken(env)};
  });
}
module.exports={list,submit,verify,admin,moderate,maskedEmail};
