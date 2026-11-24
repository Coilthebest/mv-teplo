'use strict';
const names = {review:'Отзыв',suggestion:'Предложение'};
const dates = new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Moscow'});
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bounded(value,max) { return typeof value==='string' ? value.slice(0,max) : ''; }
function publishedItems(data) {
  if(data?.version!==2||!Array.isArray(data.items))throw Error('Invalid public feedback response');
  return data.items.filter(p=>p&&Object.hasOwn(names,p.type)&&!p.hidden&&Number.isFinite(Date.parse(p.date))).map(p=>({
    type:p.type,name:bounded(p.name,50),text:bounded(p.text,1000),date:new Date(p.date).toISOString(),
    reply:bounded(p.reply,2000),
    // Never put an unmasked address into the build output, even if the API regresses.
    email:typeof p.email==='string'&&p.email.length<=254&&/^[^@*]*\*{5}[^@*]*@[^@\s]+$/.test(p.email)?p.email:'',
    verified:p.verified===true,rating:Number.isInteger(p.rating)&&p.rating>=1&&p.rating<=5?p.rating:null
  })).sort((a,b)=>b.date.localeCompare(a.date));
}
function card(p) {
  const stars=p.type==='review'&&p.rating ? `<p class="rating-stars" aria-label="${p.rating} из 5">${'★'.repeat(p.rating)}${'☆'.repeat(5-p.rating)}</p>` : '';
  const email=p.email?`<p class="feedback-author-email">${escape(p.email)}</p>`:'';
  const reply=p.reply?`<div class="feedback-reply"><strong>Ответ Teplo</strong><p>${escape(p.reply)}</p></div>`:'';
  return `<article class="feedback-entry"><h3>${names[p.type]} · ${escape(p.name||'Гость')}</h3>${stars}${email}<time datetime="${p.date}">${escape(dates.format(new Date(p.date)))}</time><p>${escape(p.text)}</p>${reply}</article>`;
}
function replaceBlock(html,name,content) {
  const start=`<!-- feedback:${name}:start -->`,end=`<!-- feedback:${name}:end -->`;
  if(html.split(start).length!==2||html.split(end).length!==2)throw Error(`Missing or duplicate feedback ${name} markers`);
  const before=html.indexOf(start)+start.length,after=html.indexOf(end);
  if(after<before)throw Error('Invalid feedback markers');
  return html.slice(0,before)+'\n'+content+'\n          '+html.slice(after);
}
function renderSnapshot(html,data) {
  const items=publishedItems(data);
  const rated=items.filter(p=>p.type==='review'&&p.verified&&p.rating!==null);
  const count=rated.length,average=count?rated.reduce((s,p)=>s+p.rating,0)/count:0;
  const word=count%10===1&&count%100!==11?'оценка':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'оценки':'оценок';
  const rating=`<div class="feedback-rating" aria-label="Средняя оценка опубликованных отзывов"><strong id="feedback-average">${count?average.toFixed(1).replace('.',','):'—'}</strong><div><span class="rating-stars" aria-hidden="true" style="--rating-percent:${average/5*100}%">★★★★★</span><p id="feedback-rating-count">${count?`${count} ${word} · из 5`:'Пока нет подтверждённых оценок'}</p></div></div>`;
  const list=`<p id="feedback-empty" class="feedback-muted" role="status"${items.length?' hidden':''}>Поделитесь впечатлениями — ваш отзыв может стать первым.</p>\n<div id="feedback-list" class="feedback-list" data-prerendered="true">${items.slice(0,5).map(card).join('\n')}</div>\n<button class="button button-outline" id="feedback-more" type="button" hidden>Показать ещё</button>`;
  return {html:replaceBlock(replaceBlock(html,'rating',rating),'items',list),count:items.length,ratingCount:count};
}
module.exports={renderSnapshot,publishedItems};
