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
    const payment = await request('payment-prints');
    if (payment.status !== 'paid') {
      status.textContent = 'Макеты доступны после подтверждения оплаты.';
      return;
    }
    delivery = payment.delivery;
  } catch {
    status.textContent = 'Не удалось открыть заказ. Обновите страницу, чтобы попробовать снова.';
    return;
  }

  const files = delivery?.files || [];
  if (!files.length) {
    status.textContent = 'В этом заказе нет макетов.';
    return;
  }
  status.hidden = true;
  const names = {
    frame:'Рамка', magnet:'Магнит', keychain:'Брелок', tshirt:'Футболка',
    garland:'Арт-гирлянда', digital:'HD-иллюстрация',
  };
  const fileNames = {
    frame:'frame', magnet:'magnet', keychain:'keychain', tshirt:'shirt',
    paper:'paper', garland:'garland', digital:'hd',
  };
  const productName = item => item.product === 'paper'
    ? item.material === 'sticker' ? 'Наклейка' : 'Матовое фото'
    : names[item.product] || 'Макет';
  const colorFor = item => teploShirtColors[item.shirtColor] || teploShirtColors.white;

  function surface(item) {
    const mmAt300 = 300 / 25.4;
    if (item.product === 'magnet') {
      const [, w, h] = (item.format || '').match(/(\d+)\s*×\s*(\d+)/) || ['', 6, 9];
      return {width:Math.round(Number(w) * 10 * mmAt300), height:Math.round(Number(h) * 10 * mmAt300)};
    }
    if (item.product === 'keychain') {
      const insert = teploKeychainSize(item.format);
      const bodyHeight = item.format?.includes('40 × 56') ? 56 : 40;
      const density = 2 * mmAt300 * bodyHeight / 576;
      return {width:Math.round(insert.width * density), height:Math.round(insert.height * density)};
    }
    if (item.product === 'frame' || item.product === 'paper') return {width:1182, height:1773};
    return {width:1200, height:1600};
  }

  function productPreview(view, item) {
    const canvas = document.createElement('canvas');
    canvas.width = 450;
    canvas.height = 540;
    TeploMockups.paint(canvas, view, item);
    return TeploMockups.withBackground(canvas);
  }

  function render(picture, item, canvas) {
    const ctx = canvas.getContext('2d');
    if (item.product === 'tshirt') {
      const {left, top, width, height} = teploShirtPrintArea;
      const factor = 6;
      canvas.width = factor * width;
      canvas.height = factor * height;
      ctx.setTransform(factor, 0, 0, factor, -factor * left, -factor * top);
      const shirtPrint = TeploIllustration.printVignette(picture);
      paintTeploShirtPrint(ctx, shirtPrint, item);
      return productPreview('tshirt', {...item, shirtPrint});
    }
    const {width, height} = surface(item);
    canvas.width = width;
    canvas.height = height;
    const poster = TeploIllustration.compose(picture, item.caption, item.year, item.yearLines);
    let paint = paintTeploPaperPrint;
    if (item.product === 'frame') paint = paintTeploFramePrint;
    if (item.product === 'paper' && item.material === 'sticker') paint = paintTeploSticker;
    paint(ctx, poster, 0, 0, width, height, item.printLayout);
    if (item.product === 'frame') return productPreview('frame', {...item, poster});
    if (item.product === 'magnet') return productPreview('magnet', {...item, poster});
    if (item.product === 'keychain') return productPreview('keychain', {...item, poster});
    if (item.product === 'paper' && item.material === 'sticker') return productPreview('sticker', {...item, poster});
    if (item.product === 'paper' && item.material === 'matte') return productPreview('paper', {...item, poster});
  }

  let activeRefresh;
  async function image(index) {
    if (Date.now() + 60000 >= delivery.expires) {
      activeRefresh ||= request('payment-prints').then(payment => {
        if (!payment.delivery) throw Error('order_unavailable');
        delivery = payment.delivery;
      }).finally(() => { activeRefresh = null; });
      await activeRefresh;
    }
    const {ticket, expires} = delivery;
    const chunks = [];
    for (let part = 0; ; part++) {
      const result = await request('payment-file', {ticket, expires, index, part, scope:'print'});
      chunks.push(Uint8Array.from(atob(result.data), character => character.charCodeAt(0)));
      if (result.last) break;
    }
    return TeploIllustration.loadImage(new Blob(chunks, {type:'image/png'}));
  }

  const pending = new Map();
  function prepare(index) {
    if (pending.has(index)) return pending.get(index);
    const task = (async () => {
      const item = files[index];
      const canvas = document.createElement('canvas');
      await TeploMockups.ready;
      const preview = render(await image(index), item, canvas);
      const extension = item.product === 'tshirt' ? 'png' : 'jpg';
      const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
      const [blob, previewBlob] = await Promise.all([
        new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.96)),
        preview ? new Promise(resolve => preview.toBlob(resolve, 'image/png')) : null,
      ]);
      canvas.width = canvas.height = 1;
      if (preview) preview.width = preview.height = 1;
      if (blob?.type !== mimeType) throw Error('print_export_failed');
      if (preview && previewBlob?.type !== 'image/png') throw Error('preview_export_failed');
      const line = String(item.line).padStart(2, '0');
      const variant = item.artwork ? '-' + String(item.artwork).padStart(2, '0') : '';
      const detail = item.product === 'tshirt' ? [item.format, item.shirtColor].filter(Boolean).join('-') : '';
      const suffix = detail ? '-' + detail.replace(/[^a-z0-9-]/gi, '') : '';
      const stem = 'Teplo-' + number + '-' + line + variant + '-' + fileNames[item.product] + suffix;
      return {blob, name:stem + '.' + extension, previewBlob, previewName:stem + '-preview.png'};
    })();
    pending.set(index, task);
    task.catch(() => pending.delete(index));
    return task;
  }

  const create = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  };
  const urls = new Set();
  function localUrl(blob) {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    return url;
  }
  addEventListener('pagehide', event => {
    if (event.persisted) return;
    for (const url of urls) URL.revokeObjectURL(url);
  });

  const list = document.querySelector('#prints');
  for (const [index, item] of files.entries()) {
    const card = document.createElement('article');
    const line = item.artwork ? item.line + '.' + item.artwork : item.line;
    const title = create('h2', line + '. ' + productName(item));
    const label = [item.caption, item.year].filter(Boolean).join(' · ');
    const layout = item.printLayout || {scale:100, x:0, y:0};
    let format = item.format;
    if (item.artwork) format = 'Иллюстрация ' + item.artwork + ' из ' + item.format;
    if (item.product === 'tshirt') format = 'Размер ' + item.format + ' · ' + colorFor(item).name;
    const detail = create('p', [format, 'Количество: ' + item.quantity].filter(Boolean).join(' · '));
    const placement = create('p', 'Масштаб ' + layout.scale + '% · X ' + layout.x + '%, Y ' + layout.y + '%');
    placement.className = 'placement';
    const button = create('button', 'Подготовить макет');
    button.type = 'button';
    const feedback = create('p', '');
    feedback.setAttribute('role', 'status');
    card.append(title);
    if (label) card.append(create('p', label));
    card.append(detail, placement, button, feedback);
    list.append(card);

    button.addEventListener('click', async () => {
      button.disabled = true;
      feedback.textContent = 'Собираем макет…';
      try {
        const {blob, name, previewBlob, previewName} = await prepare(index);
        const url = localUrl(blob);
        const image = document.createElement('img');
        image.src = previewBlob ? localUrl(previewBlob) : url;
        image.alt = 'Макет · ' + productName(item);
        const download = create('a', previewBlob ? 'Файл для печати' : 'Скачать JPG для печати');
        if (item.product === 'digital') download.textContent = 'Скачать HD JPG';
        download.href = url;
        download.download = name;
        if (previewBlob) {
          const figure = document.createElement('figure');
          figure.className = 'product-preview';
          figure.append(image, create('figcaption', 'Как видел клиент'));
          const previewDownload = create('a', 'Скачать как на превью');
          previewDownload.href = image.src;
          previewDownload.download = previewName;
          const actions = document.createElement('div');
          actions.className = 'download-actions';
          download.className = 'download-print';
          actions.append(previewDownload, download);
          button.replaceWith(figure, actions);
        } else {
          button.replaceWith(image, download);
        }
        feedback.textContent = '';
      } catch {
        button.disabled = false;
        feedback.textContent = 'Не удалось собрать макет. Попробуйте ещё раз.';
      }
    });
  }

  const archive = document.querySelector('#download-all');
  const archiveStatus = document.querySelector('#archive-status');
  archive.hidden = false;
  archive.addEventListener('click', async () => {
    archive.disabled = true;
    try {
      const entries = [];
      for (let index = 0; index < files.length; index++) {
        archiveStatus.textContent = 'Готовим макет ' + (index + 1) + ' из ' + files.length + '…';
        const {blob, name, previewBlob, previewName} = await prepare(index);
        entries.push({name:'Для печати/' + name, bytes:new Uint8Array(await blob.arrayBuffer())});
        if (previewBlob) {
          entries.push({name:'Вид изделия/' + previewName, bytes:new Uint8Array(await previewBlob.arrayBuffer())});
        }
      }
      const download = create('a', 'Скачать ZIP с макетами');
      download.href = localUrl(orderZip(entries));
      download.download = 'Teplo-' + number + '-prints.zip';
      archive.replaceWith(download);
      archiveStatus.textContent = 'Архив готов.';
    } catch {
      archive.disabled = false;
      archiveStatus.textContent = 'Не удалось собрать архив. Попробуйте ещё раз.';
    }
  });
})();
