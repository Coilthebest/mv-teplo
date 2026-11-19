'use strict';
(() => {
  const asData = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  const asBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('image_export_failed')), 'image/png'));
  async function loadImage(blob) {
    const url = URL.createObjectURL(blob); const image = new Image(); image.decoding = 'async';
    try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
  }
  async function config() {
    try { const r = await fetch('https://teplo-api.donbaserg.workers.dev/api/illustrations/config', { cache: 'no-store' }); if (!r.ok) throw new Error(); return await r.json(); }
    catch { return { ready: false, unavailable: true }; }
  }
  async function call(path, options) {
    let response;
    try { response = await fetch(path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(60000) }); }
    catch { const error = new Error('Соединение прервалось. Новую обработку автоматически не запускаем.'); error.network = true; throw error; }
    let body;
    try { body = await response.json(); } catch { const error = new Error('Не удалось прочитать ответ сервера. Новую обработку автоматически не запускаем.'); error.network = true; throw error; }
    if (!response.ok) { const error = new Error(body.error?.message || 'Не удалось обработать фото.'); error.code = body.error?.code; error.requestId = body.error?.requestId; error.network = body.error?.retryable !== false && response.status >= 500 && !['gateway_timeout','image_no_output'].includes(error.code); throw error; }
    return body;
  }
  async function start(image) {
    const resize = document.createElement('canvas');
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    resize.width = Math.round(image.naturalWidth * scale); resize.height = Math.round(image.naturalHeight * scale);
    resize.getContext('2d').drawImage(image, 0, 0, resize.width, resize.height);
    const photo = resize.toDataURL('image/jpeg', .92);
    return call('https://teplo-api.donbaserg.workers.dev/api/illustrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: photo }) });
  }
  function poll(job) { return call('https://teplo-api.donbaserg.workers.dev/api/illustrations?job=' + encodeURIComponent(job)); }
  function imageBlob(data) {
    const match = /^data:(image\/(?:bmp|png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(data || '');
    if (!match) throw new Error('Сервер не вернул изображение.');
    const binary = atob(match[2]); const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: match[1] });
  }
  let database;
  async function db() {
    if (database) return database;
    database = new Promise((resolve, reject) => { const r = indexedDB.open('teplo-illustration', 1); r.onupgradeneeded = () => r.result.createObjectStore('draft'); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
    return database;
  }
  async function draft(action, value, slot = 0) {
    try {
      const database = await db();
      return await new Promise((resolve, reject) => {
        const tx = database.transaction('draft', action === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('draft');
        const key = slot === 0 ? 'current' : 'story:' + slot;
        const request = action === 'get' ? store.get(key) : action === 'delete' ? store.delete(key) : store.put({ ...value, savedAt: Date.now() }, key);
        let result; request.onsuccess = () => { result = request.result; }; tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = reject;
      });
    } catch { return null; }
  }
  function fitPaper(ctx, image, width, height) {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    const w = Math.round(sourceWidth * scale);
    const h = Math.round(sourceHeight * scale);
    const x = Math.floor((width - w) / 2);
    const y = Math.floor((height - h) / 2);
    // Continue only the outer paper grain, mirroring alternate strips at each seam.
    function extend(vertical, farEdge, gap) {
      if (gap <= 0) return;
      const span = vertical ? sourceHeight : sourceWidth;
      const sample = Math.max(1, Math.round(span * .035));
      const step = Math.max(1, Math.round(sample * scale));
      const start = farEdge ? span - sample : 0;
      const boundary = vertical ? (farEdge ? y + h : y) : (farEdge ? x + w : x);
      for (let offset = 0, flip = true; offset < gap; offset += step, flip = !flip) {
        const dest = farEdge ? boundary + offset : boundary - offset - step;
        ctx.save();
        if (vertical) {
          ctx.translate(x, dest + (flip ? step : 0));
          ctx.scale(1, flip ? -1 : 1);
          ctx.drawImage(image, 0, start, sourceWidth, sample, 0, 0, w, step);
        } else {
          ctx.translate(dest + (flip ? step : 0), y);
          ctx.scale(flip ? -1 : 1, 1);
          ctx.drawImage(image, start, 0, sample, sourceHeight, 0, 0, step, h);
        }
        ctx.restore();
      }
    }
    extend(false, false, x);
    extend(false, true, width - x - w);
    extend(true, false, y);
    extend(true, true, height - y - h);
    ctx.drawImage(image, x, y, w, h);
  }
  function compose(image, title, year, yearLines = true) {
    const poster = document.createElement('canvas'); poster.width = 1200; poster.height = 1600;
    const ctx = poster.getContext('2d'); ctx.fillStyle = '#f3e6d7'; ctx.fillRect(0, 0, 1200, 1600); fitPaper(ctx, image, 1200, 1600);
    function line(text, y, size, spacing) {
      const letters = Array.from(text); let total;
      do { ctx.font = `${size}px Georgia, serif`; total = letters.reduce((sum, letter) => sum + ctx.measureText(letter).width, 0) + Math.max(0, letters.length - 1) * spacing; if (total <= 900) break; size--; spacing = Math.max(2, spacing - .1); } while (size > 16);
      ctx.fillStyle = '#68503b'; ctx.textBaseline = 'alphabetic'; let x = (1200 - total) / 2;
      for (const letter of letters) { ctx.fillText(letter, x, y); x += ctx.measureText(letter).width + spacing; }
      return total;
    }
    title = String(title || '').trim().toLocaleUpperCase('ru-RU'); year = String(year || '').trim();
    if (title) line(title, 1360, 47, 12);
    if (year) {
      const y = title ? 1422 : 1360;
      const edge = line(year, y, 30, 12) / 2 + 30;
      if (yearLines) {
        ctx.fillStyle = '#9e7c5e';
        ctx.fillRect(600 - edge - 62, y - 10, 62, 1.5);
        ctx.fillRect(600 + edge, y - 10, 62, 1.5);
      }
    }
    return poster;
  }
  function printVignette(image) {
    const canvas = document.createElement('canvas'); const width = 900, height = Math.max(1, Math.round(width * image.naturalHeight / image.naturalWidth)); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height), data = pixels.data, count = width * height;
    // Sample blank paper around the perimeter, away from the painted scene.
    const samples = [[], [], []];
    for (let x = 4; x < width - 4; x += 8) {
      for (const y of [4, height - 5]) {
        const offset = (y * width + x) * 4;
        samples.forEach((values, channel) => values.push(data[offset + channel]));
      }
    }
    const background = samples.map(values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)]);
    const visited = new Uint8Array(count); const queue = new Int32Array(count); let head = 0, tail = 0;
    function add(p) {
      if (visited[p]) return; visited[p] = 1;
      const offset = p * 4;
      const d = Math.hypot(data[offset]-background[0], data[offset+1]-background[1], data[offset+2]-background[2]);
      if (d < 48 || data[offset+3] === 0) { data[offset+3] = 0; queue[tail++] = p; }
    }
    for (let x = 0; x < width; x++) { add(x); add(count - width + x); }
    for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
    while (head < tail) { const p = queue[head++], x = p % width; if (x) add(p - 1); if (x < width - 1) add(p + 1); if (p >= width) add(p - width); if (p < count - width) add(p + width); }
    ctx.putImageData(pixels, 0, 0);
    // Ignore isolated paper-grain specks when finding the visible print bounds.
    const rows = new Uint16Array(height), columns = new Uint16Array(width);
    for (let i = 0; i < count; i++) {
      if (data[i * 4 + 3] > 100) { rows[Math.floor(i / width)]++; columns[i % width]++; }
    }
    const bounds = (values, threshold) => {
      const first = values.findIndex(value => value >= threshold);
      const last = values.findLastIndex(value => value >= threshold);
      return first < 0 ? [0, values.length] : [Math.max(0, first - 4), Math.min(values.length, last + 5)];
    };
    const [left, right] = bounds(columns, Math.ceil(height * .01));
    const [top, bottom] = bounds(rows, Math.ceil(width * .01));
    const trimmed = document.createElement('canvas');
    trimmed.width = right - left; trimmed.height = bottom - top;
    trimmed.getContext('2d').drawImage(canvas, -left, -top);
    return trimmed;
  }
  window.TeploIllustration = Object.freeze({ config, start, poll, imageBlob, loadImage, compose, fitPaper, printVignette, asBlob, asData, draft });
})();
