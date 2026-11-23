'use strict';

(async () => {
  const status = document.querySelector('#status');
  const order = location.hash.slice(1);
  if (!/^[a-f0-9]{48}$/.test(order)) {
    status.textContent = 'Откройте ссылку на макеты из сообщения о заказе.';
    return;
  }
  const number = order.slice(0, 12).toUpperCase();
  const orderNumber = document.querySelector('#order-number');
  orderNumber.textContent = 'Заказ № ' + number;
  orderNumber.hidden = false;

  const endpoint = 'https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m?route=';
  async function request(route, body = {}) {
    const response = await fetch(endpoint + route, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({order, ...body}),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw Error('order_unavailable');
    return response.json();
  }

  let delivery;
  try {
    const payment = await request('payment-status');
    if (payment.status !== 'paid') {
      status.textContent = 'Макеты доступны после подтверждения оплаты.';
      return;
    }
    delivery = payment.delivery;
  } catch {
    status.textContent = 'Не удалось открыть заказ. Обновите страницу, чтобы попробовать снова.';
    return;
  }

  const frames = (delivery?.files || []).map((item, index) => ({item, index}))
    .filter(({item}) => item.product === 'frame');
  if (!frames.length) {
    status.textContent = 'В этом заказе нет фото в рамках.';
    return;
  }
  status.textContent = 'Подготовьте JPG и отправьте его в печать в формате 10 × 15 см.';
  const list = document.querySelector('#prints');
  for (const [position, {item, index}] of frames.entries()) {
    const label = [item.caption, item.year].filter(Boolean).join(' · ') || 'Фото в рамке';
    const card = document.createElement('article');
    const title = document.createElement('h2');
    title.textContent = label;
    const spec = document.createElement('p');
    const layout = item.printLayout || {scale: 100, x: 0, y: 0};
    spec.textContent = '10 × 15 см · масштаб ' + layout.scale + '% · X ' + layout.x + '%, Y ' + layout.y + '%';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Подготовить макет';
    const feedback = document.createElement('p');
    feedback.setAttribute('role', 'status');
    card.append(title, spec, button, feedback);
    list.append(card);

    button.addEventListener('click', async () => {
      button.disabled = true;
      feedback.textContent = 'Загружаем HD-иллюстрацию…';
      let picture;
      try {
        if (Date.now() + 60000 >= delivery.expires) delivery = (await request('payment-status')).delivery;
        const chunks = [];
        for (let part = 0; ; part++) {
          const result = await request('payment-file', {ticket: delivery.ticket, expires: delivery.expires, index, part});
          chunks.push(Uint8Array.from(atob(result.data), character => character.charCodeAt(0)));
          if (result.last) break;
        }
        picture = await createImageBitmap(new Blob(chunks, {type: 'image/png'}));
        const poster = TeploIllustration.compose(picture, item.caption, item.year, item.yearLines);
        const canvas = document.createElement('canvas');
        canvas.width = 1182;
        canvas.height = 1773;
        paintTeploFramePrint(canvas.getContext('2d'), poster, 0, 0, canvas.width, canvas.height, layout);
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', 'Предпросмотр макета в рамке');
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.96));
        if (!blob) throw Error('jpeg_export_failed');
        const url = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = url;
        download.download = 'Teplo-' + number + '-10x15-' + (position + 1) + '.jpg';
        download.textContent = 'Скачать JPG для печати';
        button.replaceWith(canvas, download);
        feedback.textContent = '';
      } catch {
        button.disabled = false;
        feedback.textContent = 'Не удалось собрать макет. Попробуйте ещё раз.';
      } finally {
        picture?.close();
      }
    });
  }
})();
