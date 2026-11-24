'use strict';
(() => {
  const endpoint='https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  const names={review:'Отзыв',suggestion:'Предложение',question:'Вопрос'};
  const dateFormat=new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeZone:'Europe/Moscow'});
  async function request(route,data) {
    const response=await fetch(endpoint+route,{method:data?'POST':'GET',cache:'no-store',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Сервис временно недоступен.');
    return result;
  }
  function element(tag,text,className) {
    const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
  }
  function card(post) {
    const article=element('article','','feedback-entry');
    article.append(element('h3',(names[post.type]||'Сообщение')+' · '+(post.name||'Гость')));
    if(post.type==='review'&&Number.isInteger(post.rating)&&post.rating>=1&&post.rating<=5){
      const stars=element('p','★'.repeat(post.rating)+'☆'.repeat(5-post.rating),'rating-stars');
      stars.setAttribute('aria-label',post.rating+' из 5');article.append(stars);
    }
    if(post.email)article.append(element('p',post.email,'feedback-author-email'));
    const time=element('time',dateFormat.format(new Date(post.date)));time.dateTime=post.date;article.append(time,element('p',post.text));
    if(post.reply){const reply=element('div','','feedback-reply');reply.append(element('strong','Ответ Teplo'),element('p',post.reply));article.append(reply);}
    return article;
  }
  function setupForm(form) {
    const send=form.querySelector('button[type="submit"]'),status=form.querySelector('.feedback-status');
    const stars=form.querySelector('.feedback-stars');
    let sending=false,draft=null,available=false;
    function update(){
      const isReview=form.elements.type.value==='review';
      if(stars){
        stars.hidden=!isReview;
        form.querySelector('input[name="rating"]').required=isReview;
        const value=Number(new FormData(form).get('rating'));
        stars.querySelectorAll('.star-options label').forEach((label,index)=>label.classList.toggle('filled',index<value));
        stars.querySelector('output').textContent=value?value+' из 5':'Выберите оценку';
      }
      send.textContent='Подтвердить почту и отправить';
    }
    form.addEventListener('change',update);update();
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(sending||!available)return;
      const fields=new FormData(form);
      const data={type:fields.get('type'),name:fields.get('name')||'',email:fields.get('email'),rating:fields.get('type')==='review'?Number(fields.get('rating')):null,text:fields.get('text'),website:fields.get('website')||'',consent:true};
      const key=JSON.stringify(data);if(draft?.key!==key)draft={key,id:crypto.randomUUID()};
      sending=true;send.disabled=true;delete status.dataset.error;status.textContent='Отправляем письмо подтверждения…';
      try{
        const result=await request('feedback-submit',{...data,id:draft.id});
        if(!result.confirmationRequired)throw Error('Подтверждение почты пока подключается. Попробуйте позже.');
        status.textContent='Письмо отправлено. Откройте ссылку в почте и подтвердите отправку. Проверьте также папку «Спам». Ссылка действует 24 часа.';
        form.reset();draft=null;update();
      }catch(e){status.dataset.error='';status.textContent=e.message;}
      finally{sending=false;send.disabled=!available;}
    });
    return value=>{
      available=value;send.disabled=!value;
      if(!value)status.textContent='Подтверждение почты подключается. Форма станет доступна после подключения.';
    };
  }
  async function publicFeedback(){
    const setters=[...document.querySelectorAll('#feedback-form,#question-form')].map(setupForm);
    const list=document.querySelector('#feedback-list'),more=document.querySelector('#feedback-more');
    let posts=[],shown=0;
    const questionsPanel=document.querySelector('#customer-questions');
    questionsPanel.addEventListener('toggle',()=>{questionsPanel.querySelector('.question-summary-action').textContent=questionsPanel.open?'Скрыть вопросы −':'Открыть вопросы +';});
    function next(){const batch=posts.slice(shown,shown+5);list.append(...batch.map(card));shown+=batch.length;more.hidden=shown>=posts.length;}
    more.addEventListener('click',next);
    try{
      const result=await request('feedback');
      posts=(result.items||[]).filter(p=>p.type!=='question');
      const questions=(result.items||[]).filter(p=>p.type==='question');
      document.querySelector('#feedback-empty').hidden=posts.length>0;
      document.querySelector('#feedback-empty').textContent='Поделитесь впечатлениями — ваш отзыв может стать первым.';
      document.querySelector('#questions-empty').hidden=questions.length>0;
      document.querySelector('#questions-list').replaceChildren(...questions.map(card));
      list.replaceChildren();shown=0;next();
      const rated=posts.filter(p=>p.type==='review'&&p.verified&&Number.isInteger(p.rating)&&p.rating>=1&&p.rating<=5);
      const average=rated.length?rated.reduce((sum,p)=>sum+p.rating,0)/rated.length:0;
      document.querySelector('#feedback-average').textContent=rated.length?average.toFixed(1).replace('.',','):'—';
      document.querySelector('.feedback-rating .rating-stars').style.setProperty('--rating-percent',(average/5*100)+'%');
      const count=rated.length,word=count%10===1&&count%100!==11?'оценка':count%10>=2&&count%10<=4&&(count%100<12||count%100>14)?'оценки':'оценок';
      document.querySelector('#feedback-rating-count').textContent=count?`${count} ${word} · из 5`:'Пока нет подтверждённых оценок';
      setters.forEach(set=>set(result.version===2&&result.verificationRequired===true&&result.available));
    }catch(e){
      // Keep published HTML reviews visible when the live service is unavailable.
      if(!list.children.length){const empty=document.querySelector('#feedback-empty');empty.hidden=false;empty.textContent='Не удалось обновить отзывы. Попробуйте позже.';}
      setters.forEach(set=>set(false));
    }
  }
  async function confirm(){
    const [id,token]=location.hash.slice(1).split('.');history.replaceState(null,'',location.pathname);
    const button=document.querySelector('#confirm-feedback-send'),status=document.querySelector('#confirm-feedback-status');
    if(!id||!token){status.textContent='Откройте ссылку из письма Teplo.';return;}
    button.hidden=false;
    button.addEventListener('click',async()=>{
      button.disabled=true;status.textContent='Подтверждаем почту и передаём сообщение мастерской…';
      try{await request('feedback-verify',{id,token});status.textContent='Почта подтверждена! Сообщение передано мастерской и появится на сайте после проверки.';button.hidden=true;}
      catch(e){status.textContent=e.message;button.disabled=false;}
    });
  }
  async function admin(){
    let [id,signature]=location.hash.slice(1).split('.');history.replaceState(null,'',location.pathname);
    let token=id==='admin'?signature:null;
    const status=document.querySelector('#moderation-status'),list=document.querySelector('#moderation-list');
    const filter=document.querySelector('#moderation-filter');
    let rows=[];
    function draw(){
      list.replaceChildren();
      const visible=rows.filter(row=>filter.value==='all'||row.entry.type===filter.value);
      if(!visible.length)list.append(element('p','Сообщений пока нет.'));
      for(const row of visible){
        const item=card({...row.entry,reply:row.reply});
        item.append(element('p',row.published?'Опубликовано':row.entry.email&&!row.entry.verifiedAt?'Ожидает подтверждения почты':'Скрыто с сайта','moderation-state'));
        const label=element('label','Ответ Teplo');const reply=document.createElement('textarea');reply.value=row.reply;reply.maxLength=1000;reply.rows=3;label.append(reply);item.append(label);
        const actions=element('div','','feedback-actions');
        for(const [action,title] of [['publish',row.published?'Сохранить ответ':'Опубликовать'],['hide','Скрыть с сайта'],...(token?[['delete','Удалить навсегда']]:[])]){
          const button=element('button',title,'button '+(action==='publish'?'button-primary':'button-outline'));button.type='button';
          button.disabled=(action==='hide'&&!row.published)||(action==='publish'&&row.entry.email&&!row.entry.verifiedAt);
          button.addEventListener('click',async()=>{
            if(action==='delete'&&!window.confirm('Удалить это сообщение навсегда? Восстановить его в кабинете будет невозможно.'))return;
            actions.querySelectorAll('button').forEach(b=>b.disabled=true);
            try{
              const result=await request(token?'feedback-admin':'feedback-moderation',{id:row.id,adminToken:token,signature,action,reply:reply.value});
              if(action==='delete'){if(!result.deleted)throw Error('Не удалось удалить сообщение.');rows=rows.filter(item=>item.id!==row.id);status.textContent='Сообщение удалено.';}
              else{row.published=result.published;row.reply=result.reply;status.textContent=action==='hide'?'Сообщение скрыто. Его можно опубликовать снова.':'Публикация сохранена.';}draw();
            }catch(e){status.textContent=e.message;draw();}
          });actions.append(button);
        }item.append(actions);list.append(item);
      }
    }
    async function load(){
      try{
        if(token){const result=await request('feedback-admin',{adminToken:token,action:'list'});rows=result.items;}
        else if(id&&signature){
          const result=await request('feedback-moderation',{id,signature,action:'read'});rows=[{id,...result}];
          if(result.adminUrl){const link=element('a','Открыть все сообщения','button button-outline');link.href=result.adminUrl;link.addEventListener('click',async event=>{event.preventDefault();token=new URL(result.adminUrl).hash.slice(1).split('.')[1];document.querySelector('#moderation-navigation').replaceChildren();await load();});document.querySelector('#moderation-navigation').replaceChildren(link);}
        }else{status.textContent='Откройте защищённую ссылку из уведомления Telegram. Ссылка на одно сообщение также позволяет перейти ко всем сообщениям.';return;}
        status.textContent='Всего сообщений: '+rows.length;draw();
      }catch(e){status.textContent=e.message;}
    }
    filter.addEventListener('change',draw);document.querySelector('#moderation-refresh').addEventListener('click',load);await load();
  }
  if(document.querySelector('#feedback-form'))publicFeedback();
  if(document.querySelector('#feedback-confirm'))confirm();
  if(document.querySelector('#feedback-admin'))admin();
})();
