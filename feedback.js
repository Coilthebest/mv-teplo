'use strict';
(() => {
  const endpoint = 'https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  const formatDate = new Intl.DateTimeFormat('ru-RU', {dateStyle:'medium',timeZone:'Europe/Moscow'});

  async function request(route, data) {
    const response = await fetch(endpoint+route, {
      method:data ? 'POST' : 'GET', cache:'no-store',
      headers:data ? {'Content-Type':'application/json'} : undefined,
      body:data ? JSON.stringify(data) : undefined, signal:AbortSignal.timeout(18000)
    });
    const result = await response.json();
    if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'Сервис временно недоступен.');
    return result;
  }

  function postCard(post) {
    const card = document.createElement('article');
    card.className = 'feedback-entry';
    const title = document.createElement('h3');
    title.textContent = (post.type === 'question' ? 'Вопрос' : 'Отзыв')+' · '+(post.name || 'Анонимно');
    const date = document.createElement('time');
    date.dateTime = post.date;
    date.textContent = formatDate.format(new Date(post.date));
    const text = document.createElement('p');
    text.textContent = post.text;
    card.append(title,date,text);
    if (post.reply) {
      const reply = document.createElement('div');
      reply.className = 'feedback-reply';
      const label = document.createElement('strong');
      label.textContent = 'Ответ Teplo';
      const body = document.createElement('p');
      body.textContent = post.reply;
      reply.append(label,body);
      card.append(reply);
    }
    return card;
  }

  function initForm(form) {
    const list = document.querySelector('#feedback-list');
    const empty = document.querySelector('#feedback-empty');
    const more = document.querySelector('#feedback-more');
    const status = document.querySelector('#feedback-status');
    const send = document.querySelector('#feedback-send');
    const {type,text} = form.elements;
    let posts = [], shown = 0, draft, sending = false;

    function showNext() {
      const next = posts.slice(shown,shown+4);
      list.append(...next.map(postCard));
      shown += next.length;
      more.hidden = shown >= posts.length;
    }

    function updateButton() {
      const question = type.value === 'question';
      send.textContent = question ? 'Задать вопрос' : 'Отправить отзыв';
      text.placeholder = question ? 'О чём хотите спросить?' : 'Расскажите о вашем заказе';
    }

    function formData() {
      const values = new FormData(form);
      return {type:values.get('type'),name:values.get('name'),text:values.get('text'),
        website:values.get('website'),consent:values.has('consent')};
    }

    more.addEventListener('click',showNext);
    type.addEventListener('change',updateButton);
    updateButton();
    request('feedback').then(result => {
      posts = result.items;
      empty.hidden = posts.length > 0;
      if (!posts.length) empty.textContent = 'Здесь появятся отзывы и ответы мастерской.';
      showNext();
      send.disabled = !result.available;
      if (!result.available) status.textContent = 'Форма временно недоступна.';
    }).catch(() => {
      empty.textContent = 'Не удалось загрузить сообщения.';
      send.disabled = false;
    });

    form.addEventListener('submit',async event => {
      event.preventDefault();
      if (sending || send.disabled) return;
      const data = formData();
      const key = JSON.stringify(data);
      if (draft?.key !== key) draft = {key,id:crypto.randomUUID()};
      sending = true;
      send.disabled = true;
      delete status.dataset.error;
      status.textContent = 'Отправляем…';
      try {
        await request('feedback-submit',{...data,id:draft.id});
        if (JSON.stringify(formData()) === key) {
          form.reset();
          updateButton();
        }
        draft = null;
        status.textContent = 'Спасибо! Сообщение отправлено. Мы проверим его перед публикацией.';
      } catch (e) {
        status.dataset.error = '';
        status.textContent = e instanceof TypeError || e.name === 'TimeoutError'
          ? 'Не удалось связаться с мастерской. Попробуйте отправить ещё раз.' : e.message;
      } finally {
        sending = false;
        send.disabled = false;
      }
    });
  }

  function initModeration() {
    const [id,signature] = location.hash.slice(1).split('.');
    const form = document.querySelector('#moderation-form');
    const status = document.querySelector('#moderation-status');
    const preview = document.querySelector('#moderation-preview');
    const reply = document.querySelector('#moderation-reply');
    const publish = form.querySelector('[value=publish]');
    const hide = form.querySelector('[value=hide]');
    if (!id || !signature) {
      status.textContent = 'Откройте ссылку из уведомления Telegram.';
      return;
    }
    history.replaceState(null,'',location.pathname);
    async function run(action) {
      publish.disabled = hide.disabled = true;
      try {
        const result = await request('feedback-moderation',{id,signature,action,reply:reply.value});
        status.textContent = result.published ? 'Сообщение опубликовано.' : 'Сообщение скрыто с сайта.';
        preview.replaceChildren(postCard({...result.entry,reply:result.reply}));
        reply.value = result.reply;
        hide.hidden = !result.published;
        publish.textContent = result.published ? 'Сохранить ответ' : 'Опубликовать';
        form.hidden = false;
      } catch (e) {
        status.textContent = e.message;
      } finally {
        publish.disabled = hide.disabled = false;
      }
    }
    form.addEventListener('submit',event => {
      event.preventDefault();
      run(event.submitter?.value || 'publish');
    });
    run('read');
  }

  const form = document.querySelector('#feedback-form');
  if (form) initForm(form);
  if (document.querySelector('#feedback-admin')) initModeration();
})();
