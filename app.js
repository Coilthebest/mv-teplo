'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const phoneLayout = matchMedia('(max-width: 680px)');
  const previewParts = ['.preview-top', '#preview-stage', '#gift-views', '.stories'].map($);
  function placePreview() {
    const anchor = phoneLayout.matches ? $('#drop-zone') : $('.preview-bottom');
    anchor.before(...previewParts);
  }
  placePreview();
  phoneLayout.addEventListener('change', placePreview);
  const canvas = $('#artwork-canvas');
  const ctx = canvas.getContext('2d');
  const products = {
    digital: { name: 'Электронная версия в HD-качестве', formats: ['PNG · электронный файл'] },
    frame: { name: 'История в рамке', formats: ['10 × 15 см'] },
    magnet: { name: 'Маленькая история на магните', formats: ['7 × 5 см', '6 × 9 см (рекомендуем)', '10 × 7 см', '13 × 9 см', '15 × 10 см'], defaultFormat: '6 × 9 см (рекомендуем)' },
    keychain: { name: 'История, которая всегда с вами', formats: ['Прямоугольный · 3 × 4 см'] },
    paper: { name: 'История без рамки', formats: ['10 × 15 см'] },
    tshirt: { name: 'Футболка с вашей историей', formats: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], defaultFormat: 'M' },
  };
  const paperMaterials = {
    matte: { name: 'Матовая бумага', productName: 'Постер без рамки', formats: products.paper.formats },
    sticker: { name: 'Наклейка', productName: 'Наклейка с вашей историей', formats: products.paper.formats },
  };
  const tshirtColors = {
    white: { name: 'Белый', hex: '#fffdf8', ink: '#62351f' },
    yellow: { name: 'Жёлтый', hex: '#f4d23b', ink: '#52361f' },
    blue: { name: 'Синий', hex: '#283e9b', ink: '#fff9ed' },
    red: { name: 'Красный', hex: '#bd3d38', ink: '#fff9ed' },
    black: { name: 'Чёрный', hex: '#272b2e', ink: '#fff9ed' },
  };
  const state = { upload: null, product: 'frame', material: 'matte', shirtColor: 'white', shirtSize: 'M', sourceFile: null, sourceHash: null, editingCartId: null, illustration: null, illustrationFile: null, shirtPrint: null, job: null, generating: false, legacy: false };
  const AI = window.TeploIllustration;
  let aiConfig = { ready: false };
  let draftTimer;
  const slots = Array(10).fill(null);
  const slotImages = Array(10).fill(null);
  let activeSlot = 0;
  let restoring = true;
  let warnedAboutStorage = false;
  let storyId = null;
  let photoHash = null;
  const slotButtons = slots.map((_, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'story-slot';
    button.addEventListener('click', () => selectSlot(index, true));
    $('#story-grid').append(button);
    return button;
  });
  const tshirtExample = new Image();
  const defaultDisclaimer = $('.preview-disclaimer').textContent;
  let uploadUrl = null;
  let uploadVersion = 0;
  let drawScheduled = false;
  let toastTimeout;
  let savingCart = false;

  function notify(message) {
    clearTimeout(toastTimeout);
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
  }

  function setStatus(message, isError = false) {
    $('#upload-status').textContent = message;
    $('#upload-status').classList.toggle('error', isError);
  }

  function setPressed(elements, key, value) {
    elements.forEach((button) => {
      const selected = button.dataset[key] === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function resetUpload() {
    uploadVersion++;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = null;
    state.upload = null;
    state.sourceFile = null;
    state.sourceHash = null;
    state.illustration = null; state.illustrationFile = null; state.sealedArtwork = null; state.shirtPrint = null; state.job = null; state.legacy = false;
    clearTimeout(draftTimer); storyId = null; photoHash = null; $('#ai-retry').hidden = true;
    aiStatus(aiConfig.ready ? 'Загрузите фото — создадим одну иллюстрацию. Надпись и год можно менять без повторной обработки.' : 'Создание иллюстраций временно недоступно. Попробуйте позже.');
    $('#photo-input').value = '';
    $('#upload-label').textContent = 'Загрузите своё фото';
    setStatus('');
  }

  function updatePreviewMode() {
    renderSlots();
    const hasPhoto = Boolean(state.upload);
    const hasArtwork = Boolean(state.illustration || state.legacy);
    const isTshirt = state.product === 'tshirt';
    const mode = $('#preview-mode');
    mode.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'dot';
    mode.append(dot, document.createTextNode(state.illustration ? aiConfig.test ? 'Проверочный образец · без генерации' : 'Ваша иллюстрация · надпись добавляет Teplo' : hasPhoto ? state.generating ? 'Рисуем вашу иллюстрацию · обычно 1–2 минуты' : 'Исходное фото · обработка ещё не готова' : isTshirt ? 'Пример футболки · загрузите своё фото' : 'Начнём с вашей фотографии'));
    $('#preview-stage').classList.toggle('is-empty', !hasPhoto && !isTshirt);
    $('#preview-empty').hidden = hasPhoto || isTshirt;
    $('#stage-annotation').textContent = 'Ваш момент. Ваша история.';
    $('.preview-disclaimer').textContent = state.illustration ? isTshirt ? 'Принт без внешней бумажной подложки. Проверьте светлые детали на эскизе: цвет и посадка готовой футболки могут отличаться. HD-файл иллюстрации сохраняется отдельно.' : defaultDisclaimer : isTshirt
      ? hasPhoto ? 'Здесь показана футболка с вашим исходным изображением. Фон фото в демоверсии сохраняется; PNG с прозрачностью примеряется без подложки. Цвет и посадка готового изделия могут отличаться.' : 'Так может выглядеть футболка с готовой иллюстрацией без бумажной подложки. Загрузите своё фото, чтобы собрать личный эскиз. Цвет и посадка готового изделия могут отличаться.'
      : defaultDisclaimer;
    $('#view-selection').disabled = !hasArtwork;
    $('#add-to-cart').disabled = !hasArtwork || savingCart || state.generating;
  }

  function selectedProductName() {
    return state.product === 'paper' ? paperMaterials[state.material].productName : products[state.product].name;
  }

  function updateProduct() {
    const key = state.product;
    setPressed($$('.product-option'), 'product', key);
    $('#preview-stage').dataset.product = key;
    $('#preview-stage').dataset.material = state.material;
    $('#product-name').textContent = selectedProductName();
    $('#paper-options').hidden = key !== 'paper';
    $('#tshirt-options').hidden = key !== 'tshirt';
    $('.format-label').textContent = key === 'tshirt' ? 'Размер футболки' : 'Формат';
    updateTshirtControls();
    $$('input[name="paper-material"]').forEach((input) => { input.checked = input.value === state.material; });
    const formats = key === 'paper' ? paperMaterials[state.material].formats : products[key].formats;
    $('#product-format').replaceChildren(...formats.map((text) => {
      const option = document.createElement('option');
      option.value = text;
      option.textContent = key === 'magnet' ? `${text} — ${TeploPricing.money(TeploPricing.unitPrice({ product: key, format: text }))}` : text;
      return option;
    }));
    $('#product-format').value = key === 'tshirt' ? state.shirtSize : products[key].defaultFormat || formats[0];
    updateProductSpec();
    updatePreviewMode();
  }

  function updateTshirtControls() {
    setPressed($$('.tshirt-color'), 'shirtColor', state.shirtColor);
    $('#tshirt-color-name').textContent = tshirtColors[state.shirtColor].name;
  }

  function setProduct(key, material = state.material) {
    if (!products[key]) return;
    state.product = key;
    if (paperMaterials[material]) state.material = material;
    updateProduct();
  }

  function currentSpec() {
    const format = $('#product-format').value;
    if (state.product === 'tshirt') return `${tshirtColors[state.shirtColor].name} · размер ${format}`;
    return state.product === 'paper' ? `${paperMaterials[state.material].name} · ${format}` : format;
  }

  function currentCanvasHeight() {
    if (state.product === 'digital' && state.illustration) return 1200;
    if (state.product === 'tshirt') return 1080;
    if (state.product === 'magnet') {
      const dimensions = $('#product-format').value.match(/(\d+) × (\d+)/);
      if (dimensions) return Math.round(900 * Number(dimensions[2]) / Number(dimensions[1]));
    }
    return ['frame', 'paper', 'digital'].includes(state.product) ? 1350 : 1200;
  }

  function updateProductSpec() {
    if (state.product === 'tshirt') state.shirtSize = $('#product-format').value;
    queueDraft();
    $('#product-spec').textContent = currentSpec();
    $('#preview-stage').dataset.orientation = currentCanvasHeight() < 900 ? 'landscape' : 'portrait';
    updatePurchase();
    scheduleDraw();
  }

  function updateCaption() {
    $('#caption-count').textContent = `${Array.from($('#caption').value).length} / 32`;
    canvas.setAttribute('aria-label', state.product === 'tshirt' ? `${state.upload ? 'Ваше фото на футболке' : 'Пример футболки'} · ${currentSpec()}` : state.upload ? `Ваше фото: ${$('#caption').value || 'без названия'}, ${$('#year').value || 'без года'}` : 'Загрузите фотографию для предпросмотра');
    scheduleDraw();
    queueDraft();
  }

  function aiStatus(text, error = false) {
    $('#ai-status').textContent = text; $('#ai-status').classList.toggle('error', error);
  }
  function renderSlots() {
    slotButtons.forEach((button, i) => {
      const record = slots[i];
      const blob = record?.generatedFile || record?.sourceFile;
      if (slotImages[i]?.blob !== blob || !button.firstChild) {
        if (slotImages[i]) URL.revokeObjectURL(slotImages[i].url);
        slotImages[i] = null;
        if (blob) {
          const url = URL.createObjectURL(blob);
          slotImages[i] = { blob, url };
          const img = new Image();
          img.src = url; img.alt = '';
          button.replaceChildren(img);
        } else button.textContent = '+';
      }
      const label = record ? (record.caption || 'Открыть фото') : 'Добавить фото';
      button.title = label;
      button.setAttribute('aria-label', 'Ячейка ' + (i + 1) + '. ' + label);
      button.setAttribute('aria-pressed', String(activeSlot === i));
      button.disabled = state.generating || restoring || savingCart;
    });
    $('#stories-count').textContent = slots.filter(Boolean).length + ' из 10';
  }

  function persistDraft() {
    if (!state.sourceFile || restoring || activeSlot < 0) return;
    const saved = { storyId, photoHash, sourceFile: state.sourceFile, generatedFile: state.illustrationFile, sealedArtwork: state.sealedArtwork,
      job: state.job, legacy: state.legacy, caption: $('#caption').value, year: $('#year').value, yearLines: $('#year-lines').checked,
      product: state.product, material: state.material, format: $('#product-format').value,
      shirtColor: state.shirtColor, shirtSize: state.shirtSize, qty: $('#item-quantity').value, test: Boolean(aiConfig.test) };
    slots[activeSlot] = saved;
    renderSlots();
    return AI.draft('put', saved, activeSlot).then(result => {
      if (result === null && !warnedAboutStorage) {
        warnedAboutStorage = true;
        notify('Браузер не смог сохранить черновик. Скачайте готовую иллюстрацию перед закрытием страницы.');
      }
    });
  }

  function queueDraft() {
    clearTimeout(draftTimer);
    if (!restoring && state.sourceFile) draftTimer = setTimeout(persistDraft, 350);
  }

  function setActiveSlot(index) {
    activeSlot = index;
    if (index >= 0) {
      try { localStorage.setItem('teplo-active-story', String(index)); } catch {}
    }
  }

  function clearEditor() {
    resetUpload();
    state.editingCartId = null;
    $('#item-quantity').value = 1;
    $('#caption').value = ''; $('#year').value = ''; $('#year-lines').checked = true;
    state.material = 'matte'; state.shirtColor = 'white'; state.shirtSize = 'M';
    $('#summary-image').removeAttribute('src');
    setProduct('frame'); updateCaption();
  }

  async function restoreRecord(saved) {
    if (!await loadUpload(saved.sourceFile, { confirmGeneration: false })) return;
    storyId = saved.storyId || crypto.randomUUID();
    photoHash = saved.photoHash || null;
    $('#caption').value = saved.caption || ''; $('#year').value = saved.year || ''; $('#year-lines').checked = saved.yearLines !== false;
    state.job = saved.job || null;
    state.legacy = Boolean(saved.legacy);
    if (saved.generatedFile instanceof Blob) {
      await applyIllustration(saved.generatedFile); state.sealedArtwork = saved.sealedArtwork;
      aiStatus('Иллюстрация готова. Выберите подарок или измените надпись.');
    } else if (!state.job || !aiConfig.ready) {
      $('#ai-retry').hidden = false;
      $('#ai-retry').textContent = state.job ? 'Продолжить ожидание' : 'Создать иллюстрацию';
    }
    state.shirtColor = tshirtColors[saved.shirtColor] ? saved.shirtColor : 'white';
    state.shirtSize = saved.shirtSize || 'M';
    setProduct(saved.product || 'frame', saved.material || 'matte');
    if (saved.format) $('#product-format').value = saved.format;
    $('#item-quantity').value = saved.qty || 1;
    updateProductSpec(); updatePreviewMode(); updateCaption(); updatePurchase();
  }

  async function selectSlot(index, pick = false) {
    if (state.generating || restoring || savingCart) return;
    if (index === activeSlot && slots[index] && state.upload) return;
    persistDraft();
    setActiveSlot(index);
    clearEditor();
    const saved = slots[index];
    if (!saved) {
      renderSlots();
      if (pick) $('#photo-input').click();
      return;
    }
    restoring = true; $('.builder').inert = true;
    try { await restoreRecord(saved); }
    catch { aiStatus('Не удалось открыть сохранённую иллюстрацию.', true); }
    finally { restoring = false; $('.builder').inert = false; renderSlots(); }
    if (state.job && aiConfig.ready) runGeneration();
  }
  async function applyIllustration(blob) {
    const image = await AI.loadImage(blob);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Получилось изображение слишком низкого разрешения.');
    state.sourceHash = null; state.illustrationFile = blob; state.illustration = image; state.shirtPrint = AI.printVignette(image); state.legacy = false;
  }
  async function runGeneration() {
    if (!state.upload || state.generating) return;
    const dialog = $('#drawing-dialog');
    const time = $('#drawing-time');
    time.textContent = 'Обычно это занимает 1–2 минуты.';
    dialog.showModal();
    state.generating = true; $('#ai-panel').setAttribute('aria-busy', 'true'); $('#ai-retry').hidden = true;
    $('#photo-input').disabled = true; $('#reset-button').disabled = true; updatePreviewMode(); updatePurchase();
    let completed = false;
    const version = uploadVersion;
    aiStatus('Рисуем вашу иллюстрацию. Обычно это занимает 1–2 минуты.');
    const waitNotice = setTimeout(() => { time.textContent = 'Рисунок занимает чуть больше времени. Ещё немного…'; }, 120000);
    try {
      aiConfig = await AI.config();
      if (!aiConfig.ready) { aiStatus('Создание иллюстраций временно недоступно. Попробуйте позже.', true); return; }
      if (state.job) aiStatus('Продолжаем обработку вашего фото. Обычно рисунок готов за 1–2 минуты.');
      let response = state.job ? { status: 'processing', job: state.job, retryAfter: 3 } : await AI.start(state.upload);
      if (response.job) { state.job = response.job; await persistDraft(); }
      const deadline = Date.now() + 10 * 60 * 1000;
      while (response.status === 'processing') {
        if (!state.job) throw new Error('Не получен номер обработки. Новую автоматически не запускаем.');
        if (Date.now() > deadline) { const error = new Error('Обработка занимает дольше обычного. Можно продолжить ожидание этой же иллюстрации.'); error.network = true; throw error; }
        await new Promise(resolve => setTimeout(resolve, Math.max(3, Math.min(15, response.retryAfter || 5)) * 1000));
        if (version !== uploadVersion) return;
        response = await AI.poll(state.job);
      }
      if (version !== uploadVersion) return;
      try { await applyIllustration(AI.imageBlob(response.image)); } catch (error) { error.keepJob = true; throw error; }
      state.sealedArtwork = response.sealedArtwork; state.job = null;
      await persistDraft(); aiStatus(aiConfig.test ? 'Проверочный ответ получен. Это заранее сохранённый образец, без новой обработки.' : 'Иллюстрация готова. Добавьте название и год — они меняются без новой обработки.');
      completed = true;
    } catch (error) {
      if (!error.network && !error.keepJob && error.code !== 'image_no_output') state.job = null;
      await persistDraft();
      aiStatus(error.message + (error.requestId ? ` Код обращения: ${error.requestId}` : ''), true);
      $('#ai-retry').textContent = state.job ? 'Проверить готовый рисунок' : 'Повторить обработку'; $('#ai-retry').hidden = false;
    } finally {
      clearTimeout(waitNotice);
      dialog.close();
      state.generating = false; $('#ai-panel').setAttribute('aria-busy', 'false'); $('#photo-input').disabled = false; $('#reset-button').disabled = false;
      updatePreviewMode(); updatePurchase(); updateCaption();
      if (completed && version === uploadVersion) {
        const ready = $('#ready-dialog');
        ready.showModal();
        const timer = setTimeout(() => ready.close(), 3200);
        ready.addEventListener('close', () => clearTimeout(timer), { once: true });
      }
    }
  }

  function scheduleDraw() {
    if (drawScheduled) return;
    drawScheduled = true;
    queueMicrotask(() => { drawScheduled = false; draw(); });
  }

  function drawCover(image, x, y, width, height) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
  }

  function drawContain(image, x, y, width, height, context = ctx) {
    const scale = Math.min(width / (image.naturalWidth || image.width), height / (image.naturalHeight || image.height));
    const w = (image.naturalWidth || image.width) * scale;
    const h = (image.naturalHeight || image.height) * scale;
    context.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  }

  function tint(hex, target, amount) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${[16, 8, 0].map((shift) => Math.round(((n >> shift) & 255) * (1 - amount) + target * amount)).join(',')})`;
  }

  function drawTshirtLabel(ctx, title, year, ink) {
    const line = (text, y, size, spacing, italic) => {
      const letters = Array.from(text);
      ctx.font = `${italic ? 'italic ' : ''}${size}px Georgia, serif`;
      const width = letters.reduce((sum, letter) => sum + ctx.measureText(letter).width, 0) + Math.max(0, letters.length - 1) * spacing;
      ctx.save();
      ctx.translate(250, y);
      const scale = Math.min(1, 210 / Math.max(width, 1));
      ctx.scale(scale, scale);
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      let x = -width / 2;
      letters.forEach((letter) => { ctx.fillText(letter, x, 0); x += ctx.measureText(letter).width + spacing; });
      ctx.restore();
    };
    if (title) line(title.toLocaleUpperCase('ru-RU'), 400, 10.5, 3.8, false);
    if (year) {
      const y = title ? 420 : 404;
      line(year, y, 8, 3.6, false);
      if ($('#year-lines').checked) {
        ctx.fillStyle = ink;
        ctx.fillRect(216, y - 3, 12, .7);
        ctx.fillRect(272, y - 3, 12, .7);
      }
    }
  }

  function drawTshirt(ctx) {
    const color = tshirtColors[state.shirtColor];
    const image = state.shirtPrint || state.upload || tshirtExample;
    ctx.save();
    ctx.translate(0, 12);
    ctx.scale(1.8, 1.8);
    const fabric = ctx.createLinearGradient(40, 60, 450, 530);
    fabric.addColorStop(0, tint(color.hex, 255, 0.12));
    fabric.addColorStop(0.35, color.hex);
    fabric.addColorStop(0.7, tint(color.hex, 0, 0.04));
    fabric.addColorStop(1, tint(color.hex, 0, 0.11));
    const outline = new Path2D('M172 46C192 71 215 82 250 82S308 71 328 46L390 75L468 180L403 226L369 181L380 522Q250 549 120 522L131 181L97 226L32 180L110 75Z');
    ctx.fillStyle = fabric;
    ctx.fill(outline);
    ctx.strokeStyle = tint(color.hex, 0, 0.2);
    ctx.lineWidth = 1.2;
    ctx.stroke(outline);
    const collar = new Path2D('M172 46C192 71 215 82 250 82S308 71 328 46L321 62C304 87 281 100 250 100S196 87 179 62Z');
    ctx.fillStyle = tint(color.hex, 0, 0.09);
    ctx.fill(collar);
    ctx.strokeStyle = tint(color.hex, 0, 0.16);
    ctx.lineWidth = 0.8;
    ctx.stroke(collar);
    ctx.strokeStyle = tint(color.hex, 255, 0.24);
    ctx.lineWidth = 1.6;
    ctx.stroke(new Path2D('M181 56C201 82 220 91 250 91S299 82 319 56'));
    ctx.strokeStyle = tint(color.hex, 0, 0.13);
    ctx.lineWidth = 1;
    ctx.stroke(new Path2D('M110 75L143 175M390 75L357 175M49 180L99 215M451 180L401 215M131 509Q250 531 369 509'));
    ctx.globalAlpha = 0.35;
    ctx.stroke(new Path2D('M140 221L153 346L144 460M359 221L346 346L355 460'));
    ctx.globalAlpha = 1;
    // Transparent PNGs keep their alpha; uploaded photos keep their original background.
    if (image.naturalWidth || image.width) drawContain(image, 145, 190, 210, 185, ctx);
    const title = state.upload ? $('#caption').value.trim() : 'MUSTANG';
    const year = state.upload ? $('#year').value.trim() : '2025';
    drawTshirtLabel(ctx, title, year, color.ink);
    ctx.restore();
  }

  function drawUpload(image) {
    const landscape = canvas.height < canvas.width;
    const offsetY = (canvas.height - 1200) * 0.4;
    const imageHeight = landscape ? canvas.height - 190 : 790;
    const imageTop = landscape ? 35 : 125 + offsetY;
    const centerY = landscape ? imageTop + imageHeight / 2 : 520 + offsetY;
    const radiusY = landscape ? imageHeight * 0.47 : 365;
    ctx.save();
    // This is a local layout sketch, deliberately not presented as AI artwork.
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const noise = 1 + 0.04 * Math.sin(i * 2.7) + 0.023 * Math.cos(i * 4.1);
      const x = 450 + Math.cos(a) * 345 * noise;
      const y = centerY + Math.sin(a) * radiusY * noise;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    drawCover(image, 75, imageTop, 750, imageHeight);
    ctx.restore();
  }

  function spacedWidth(text, spacing) {
    const letters = Array.from(text);
    return letters.reduce((sum, letter) => sum + ctx.measureText(letter).width, 0) + Math.max(0, letters.length - 1) * spacing;
  }

  function centeredText(text, y, size, spacing, face, italic = false) {
    const maxWidth = 740;
    let fontSize = size;
    let letterSpacing = spacing;
    ctx.font = `${italic ? 'italic ' : ''}${fontSize}px ${face}`;
    while (spacedWidth(text, letterSpacing) > maxWidth && fontSize > 13) {
      fontSize -= 1;
      letterSpacing = Math.max(1, letterSpacing - 0.15);
      ctx.font = `${italic ? 'italic ' : ''}${fontSize}px ${face}`;
    }
    const total = spacedWidth(text, letterSpacing);
    let x = (900 - total) / 2;
    for (const letter of Array.from(text)) {
      ctx.fillText(letter, x, y);
      x += ctx.measureText(letter).width + letterSpacing;
    }
    return total;
  }

  function giftView() {
    return state.product === 'paper' && state.material === 'sticker' ? 'sticker' : state.product;
  }

  function horizontalGradient(context, left, right, colors) {
    const gradient = context.createLinearGradient(left, 0, right, 0);
    colors.forEach(([at, color]) => gradient.addColorStop(at, color));
    return gradient;
  }

  function renderGift(target, view, poster) {
    const g = target.getContext('2d');
    g.save();
    g.scale(target.width / 900, target.height / 1080);
    g.clearRect(0, 0, 900, 1080);
    if (view === 'tshirt') {
      drawTshirt(g);
    } else if (view === 'sticker') {
      // Same glass silhouette and label placement as the collection example.
      g.translate(155, 6);
      g.scale(2.45, 2.45);
      g.fillStyle = horizontalGradient(g, 59, 181, [[0,'#192b23'],[.27,'#526143'],[.57,'#344831'],[1,'#172921']]);
      g.fill(new Path2D('M101 20h38v101c0 26 42 40 42 76v209c0 13-15 17-61 17s-61-4-61-17V197c0-36 42-50 42-76Z'));
      g.strokeStyle = '#ffffff29'; g.lineWidth = 4;
      g.stroke(new Path2D('M109 94v30c0 30-38 45-38 75v198'));
      g.fillStyle = horizontalGradient(g, 99, 141, [[0,'#674337'],[.4,'#ad7d59'],[1,'#603e31']]);
      g.fillRect(99,17,42,77);
      g.drawImage(poster,65,218,110,147);
      g.fillStyle = horizontalGradient(g,65,175,[[0,'#40281030'],[.3,'#ffffff05'],[.75,'#ffffff00'],[1,'#40281026']]);
      g.fillRect(65,218,110,147);
    } else if (view === 'keychain') {
      g.translate(450,550); g.rotate(-.09);
      g.fillStyle = '#bb976b'; g.beginPath(); g.roundRect(-218,-202,436,576,21); g.fill();
      g.drawImage(poster,-205,-189,410,547);
      g.strokeStyle = '#93948c'; g.lineWidth = 15;
      g.beginPath(); g.arc(0,-345,97,0,2*Math.PI); g.stroke();
      g.strokeStyle = '#d4d4c9'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#705b45'; g.beginPath(); g.arc(0,-174,12,0,2*Math.PI); g.fill();
      g.strokeStyle = '#a8a89e'; g.lineWidth = 9; g.beginPath(); g.roundRect(-9,-251,18,80,9); g.stroke();
    } else {
      g.translate(450,540); g.rotate(.042);
      g.fillStyle = horizontalGradient(g,-320,320,[[0,'#bc966d'],[.26,'#ddbf96'],[.72,'#b9946e'],[1,'#d7b78d']]);
      g.fillRect(-323,-478,646,956);
      // Fill the entire 10 × 15 opening with a centred print crop.
      const width = poster.height * 2 / 3;
      g.drawImage(poster,(poster.width-width)/2,0,width,poster.height,-310,-465,620,930);
    }
    g.restore();
  }

  function draw() {
    const gallery = $('#gift-views');
    gallery.hidden = !state.illustration;
    const selected = giftView();
    const buttons = $$('[data-gift-view]');
    const showMockup = Boolean(state.illustration && buttons.some(button => button.dataset.giftView === selected));
    $('#preview-stage').classList.toggle('gift-mockup', showMockup);
    let poster;
    if (state.illustration) {
      poster = AI.compose(state.illustration, $('#caption').value, $('#year').value, $('#year-lines').checked);
      for (const button of buttons) {
        renderGift(button.querySelector('canvas'), button.dataset.giftView, poster);
        button.setAttribute('aria-pressed', String(button.dataset.giftView === selected));
      }
      if (showMockup) {
        if (canvas.height !== 1080) canvas.height = 1080;
        renderGift(canvas, selected, poster);
        canvas.setAttribute('aria-label', selectedProductName() + ' · ' + currentSpec());
        return;
      }
    }
    const height = currentCanvasHeight();
    const landscape = height < canvas.width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, 900, height);
    if (state.product === 'tshirt') {
      canvas.setAttribute('aria-label', `${state.upload ? 'Ваше фото на футболке' : 'Пример футболки MUSTANG 2025'} · ${currentSpec()}`);
      drawTshirt(ctx);
      return;
    }
    if (!state.upload) return;
    if (state.illustration) {
      if (state.product === 'magnet' || state.product === 'digital') {
        AI.fitPaper(ctx, poster, canvas.width, height);
      } else {
        ctx.fillStyle = '#f3e6d7'; ctx.fillRect(0, 0, 900, height);
        drawContain(poster, 0, 0, 900, height);
      }
      return;
    }
    const paper = ctx.createLinearGradient(0, 0, 900, height);
    paper.addColorStop(0, '#f6ead7');
    paper.addColorStop(1, '#f0dfc5');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, 900, height);
    drawUpload(state.upload);
    const titleY = height - (landscape ? 115 : 190);
    const dateY = height - (landscape ? 52 : 118);
    const rawTitle = $('#caption').value.trim();
    const date = $('#year').value.trim();
    const font = 'Georgia, serif';
    const title = rawTitle.toLocaleUpperCase('ru-RU');
    ctx.fillStyle = '#62351f';
    ctx.textBaseline = 'alphabetic';
    if (title) centeredText(title, titleY, landscape ? 25 : 29, landscape ? 5 : 7, font);
    if (date) {
      const width = centeredText(date, dateY, landscape ? 22 : 26, landscape ? 5 : 6.5, font, true);
      ctx.strokeStyle = '#9e7c5e';
      ctx.lineWidth = 1.1;
      const edge = Math.min(365, width / 2 + 37);
      if ($('#year-lines').checked && edge < 340) {
        ctx.beginPath();
        ctx.moveTo(450 - edge - 67, dateY - 8); ctx.lineTo(450 - edge, dateY - 8);
        ctx.moveTo(450 + edge, dateY - 8); ctx.lineTo(450 + edge + 67, dateY - 8);
        ctx.stroke();
      }
    }
  }

  async function loadUpload(file, { confirmGeneration = true } = {}) {
    if (!file || savingCart) return;
    if (state.generating) { notify('Дождитесь текущей иллюстрации, затем можно заменить фото.'); return; }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setStatus('Подойдёт JPG, PNG или WebP. Пожалуйста, выберите фотографию в одном из этих форматов.', true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setStatus('Файл больше 15 МБ. Попробуйте уменьшить фотографию и загрузить снова.', true);
      return;
    }
    const requestId = ++uploadVersion;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    setStatus('Загружаем фото…');
    try {
      image.src = objectUrl;
      await image.decode();
      if (requestId !== uploadVersion) { URL.revokeObjectURL(objectUrl); return; }
      if (image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('too_large');
      if (confirmGeneration) {
        const dialog = $('#confirm-photo');
        const preview = $('#confirm-photo-image');
        dialog.returnValue = '';
        preview.src = objectUrl;
        const closed = new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
        dialog.showModal();
        await closed;
        preview.removeAttribute('src');
        $('#photo-input').value = '';
        if (dialog.returnValue !== 'generate' || requestId !== uploadVersion) {
          URL.revokeObjectURL(objectUrl);
          setStatus(state.sourceFile ? state.sourceFile.name : '');
          return;
        }
      }
      if (uploadUrl) URL.revokeObjectURL(uploadUrl);
      uploadUrl = objectUrl;
      storyId = crypto.randomUUID(); photoHash = null; state.editingCartId = null;
      state.upload = image;
      state.sourceFile = file;
      state.sourceHash = null;
      state.illustration = null; state.illustrationFile = null; state.sealedArtwork = null; state.shirtPrint = null; state.job = null; state.legacy = false;
      $('#upload-label').textContent = 'Заменить фотографию';
      setStatus(`${file.name} · оригинал загружен.`);
      updatePreviewMode();
      updateCaption();
      if (confirmGeneration) {
        await persistDraft();
        if (requestId !== uploadVersion) return;
        if (aiConfig.ready) runGeneration();
        else { aiStatus('Создание иллюстраций временно недоступно. Попробуйте позже.'); $('#ai-retry').textContent = 'Проверить подключение'; $('#ai-retry').hidden = false; }
      }
      return true;
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== uploadVersion) return;
      setStatus(error.message === 'too_large' ? 'Очень большой размер изображения. Уменьшите фото до 64 мегапикселей или меньше.' : 'Не получилось открыть фото. Попробуйте другой JPG, PNG или WebP.', true);
    }
  }

  function openSelection() {
    if (!state.upload) return;
    draw();
    $('#summary-image').src = canvas.toDataURL('image/png');
    $('#summary-caption').textContent = $('#caption').value.trim() || 'Без надписи';
    $('#summary-year').textContent = $('#year').value.trim() || 'Без даты';
    $('#summary-product').textContent = selectedProductName();
    $('#summary-format').textContent = currentSpec();
    $('#summary-format').previousElementSibling.textContent = state.product === 'tshirt' ? 'Цвет и размер' : 'Формат';
    $('#summary-image').alt = state.product === 'tshirt' ? `Эскиз футболки: ${currentSpec()}` : 'Собранный вами эскиз';
    $('#selection-dialog').showModal();
  }

  function updatePurchase() {
    const P = window.TeploPricing;
    const price = P.unitPrice({ product: state.product, format: $('#product-format').value });
    const isDigital = state.product === 'digital';
    if (isDigital) $('#item-quantity').value = 1;
    $('#item-quantity').disabled = isDigital;
    $('#selected-price').textContent = P.money(price);
    $('#preview-price').textContent = P.money(price * P.quantity($('#item-quantity').value));
    $('#digital-help').hidden = !isDigital;
    $('#add-to-cart').innerHTML = state.editingCartId ? 'Обновить в корзине <span aria-hidden="true">✓</span>' : 'Добавить в корзину <span aria-hidden="true">+</span>';
    $('#cancel-cart-edit').hidden = !state.editingCartId;
    $('#add-to-cart').disabled = savingCart || state.generating || !(state.illustration || state.legacy);
  }

  function endCartEdit() { state.editingCartId = null; updatePurchase(); }

  async function addToCart() {
    if (!state.upload || !state.sourceFile || savingCart || state.generating || !(state.illustration || state.legacy)) return;
    savingCart = true; renderSlots();
    const button = $('#add-to-cart');
    const file = state.sourceFile;
    const editId = state.editingCartId;
    const item = {
      product: state.product,
      material: state.product === 'paper' ? state.material : '',
      format: $('#product-format').value,
      shirtColor: state.product === 'tshirt' ? state.shirtColor : '',
      colorName: state.product === 'tshirt' ? tshirtColors[state.shirtColor].name : '',
      caption: $('#caption').value.trim(), year: $('#year').value.trim(), yearLines: $('#year-lines').checked,
      qty: state.product === 'digital' ? 1 : TeploPricing.quantity($('#item-quantity').value),
      sourceFile: file, storyId,
      generatedFile: state.illustrationFile, sealedArtwork: state.sealedArtwork,
      testArtwork: Boolean(aiConfig.test && state.illustration),
    };
    button.disabled = true;
    button.textContent = 'Сохраняем вашу историю…';
    try {
      draw();
      const previewPromise = new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('preview_failed')), 'image/webp', .9));
      const artwork = state.illustrationFile || file;
      const digest = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      const hash = state.sourceHash || await digest(artwork);
      item.photoHash = photoHash || await digest(file);
      if (state.sourceFile === file) photoHash = item.photoHash;
      if (state.sourceFile === file) state.sourceHash = hash;
      item.artworkKey = JSON.stringify(item.year && !item.yearLines ? [hash, item.caption, item.year, false] : [hash, item.caption, item.year]);
      item.preview = await previewPromise;
      await window.TeploCart.add(item, editId);
      endCartEdit();
      $('#item-quantity').value = 1;
      updatePurchase();
      notify(editId ? 'Товар обновлён в корзине.' : 'Добавили в корзину. Можно выбрать ещё вещь с этим фото.');
      window.TeploCart.open();
    } catch (error) {
      const messages = { quantity_limit: 'Для одного варианта можно добавить до 99 штук.', cart_full: 'В корзине уже 50 вариантов. Удалите лишнее или увеличьте количество имеющихся.', removed_item: 'Этот товар уже удалён. Добавьте его в корзину заново.' };
      notify(messages[error.message] || 'Не удалось сохранить товар. Проверьте доступное место в браузере и попробуйте ещё раз.');
      if (error.message === 'removed_item') endCartEdit();
    } finally { savingCart = false; renderSlots(); updatePurchase(); queueDraft(); }
  }

  document.addEventListener('teplo:notice', event => notify(event.detail));
  document.addEventListener('teplo:edit-cart', async event => {
    const { item, copy } = event.detail;
    if (restoring || state.generating || savingCart) { notify('Дождитесь окончания обработки.'); return; }
    persistDraft();
    const matching = item.storyId ? slots.findIndex(record => record?.storyId === item.storyId) : -1;
    // If all slots are occupied, an older cart item can be edited outside the gallery.
    setActiveSlot(matching >= 0 ? matching : slots.findIndex(record => !record));
    restoring = true; $('.builder').inert = true;
    clearEditor();
    try {
      if (!await loadUpload(item.sourceFile, { confirmGeneration: false })) return;
      storyId = item.storyId || storyId; photoHash = item.photoHash || null;
      if (item.generatedFile instanceof Blob) { await applyIllustration(item.generatedFile); state.sealedArtwork = item.sealedArtwork; }
      else state.legacy = true;
    } catch { notify('Не удалось открыть эскиз из корзины.'); return; }
    finally { restoring = false; $('.builder').inert = false; renderSlots(); }
    aiStatus(state.illustration ? 'Этот рисунок уже создан. Название, год и товар можно менять без новой генерации.' : 'Сохранённый эскиз с исходным фото. Можно запустить создание иллюстрации.');
    $('#ai-retry').hidden = Boolean(state.illustration);
    state.editingCartId = copy ? null : item.id;
    $('#caption').value = item.caption;
    $('#year').value = item.year; $('#year-lines').checked = item.yearLines !== false;
    if (item.shirtColor && tshirtColors[item.shirtColor]) state.shirtColor = item.shirtColor;
    if (item.product === 'tshirt') state.shirtSize = item.format;
    setProduct(item.product, item.material || 'matte');
    $('#product-format').value = item.format;
    $('#item-quantity').value = copy ? 1 : item.qty;
    updateProductSpec(); updateCaption(); updatePurchase();
    $('#caption').focus({ preventScroll: true });
    notify(copy ? 'Рисунок уже здесь. Выберите другую вещь для него.' : 'Измените товар и нажмите «Обновить в корзине».');
  });
  document.addEventListener('teplo:cart-removed', event => { if (state.editingCartId === event.detail) endCartEdit(); });
  document.addEventListener('teplo:cart-cleared', endCartEdit);
  $('#cancel-cart-edit').addEventListener('click', () => { endCartEdit(); notify('Теперь можно добавить этот эскиз как новый товар.'); });
  $('#item-quantity').addEventListener('input', () => { updatePurchase(); queueDraft(); });
  $('#item-quantity').addEventListener('change', () => { $('#item-quantity').value = TeploPricing.quantity($('#item-quantity').value); updatePurchase(); });
  $('#add-to-cart').addEventListener('click', addToCart);

  $$('[data-gift-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.giftView;
    if (view === 'sticker') setProduct('paper', 'sticker');
    else setProduct(view);
  }));
  $$('.product-option').forEach((button) => button.addEventListener('click', () => setProduct(button.dataset.product)));
  $$('[data-choose-product]').forEach((link) => link.addEventListener('click', () => {
    setProduct(link.dataset.chooseProduct, link.dataset.chooseMaterial);
  }));
  $('#caption').addEventListener('input', updateCaption);
  $('#year-lines').addEventListener('change', updateCaption);
  $('#year').addEventListener('input', () => {
    $('#year').value = $('#year').value.replace(/\D/g, '').slice(0, 4);
    updateCaption();
  });
  $('#product-format').addEventListener('change', updateProductSpec);
  $$('.tshirt-color').forEach((button) => button.addEventListener('click', () => {
    if (!tshirtColors[button.dataset.shirtColor]) return;
    state.shirtColor = button.dataset.shirtColor;
    updateTshirtControls();
    updateProductSpec();
  }));
  $$('input[name="paper-material"]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) setProduct('paper', input.value);
  }));
  $('#photo-input').addEventListener('change', (event) => loadUpload(event.target.files[0]));
  $('#ai-retry').addEventListener('click', runGeneration);
  $('#preview-upload').addEventListener('click', () => $('#photo-input').click());
  const zone = $('#drop-zone');
  ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', (event) => loadUpload(event.dataTransfer.files[0]));
  document.addEventListener('dragover', (event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('drop', (event) => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  $('#reset-button').addEventListener('click', () => {
    if (restoring || state.generating || savingCart) return;
    if (activeSlot >= 0) {
      slots[activeSlot] = null;
      AI.draft('delete', null, activeSlot);
    }
    clearEditor(); renderSlots();
    notify('Начнём новую историю. Загрузите свою фотографию.');
  });
  document.addEventListener('teplo:next-story', () => {
    if (restoring || state.generating || savingCart) return;
    const empty = slots.findIndex(record => !record);
    if (empty >= 0) selectSlot(empty, true);
    else { slotButtons[0].focus(); notify('Все 10 ячеек заняты. Выберите рисунок или освободите ячейку кнопкой «Сначала».'); }
  });
  $('#view-selection').addEventListener('click', openSelection);
  $('#close-dialog').addEventListener('click', () => $('#selection-dialog').close());
  $('#dialog-back').addEventListener('click', () => $('#selection-dialog').close());
  $('#privacy-button').addEventListener('click', () => $('#privacy-dialog').showModal());
  $('#close-privacy').addEventListener('click', () => $('#privacy-dialog').close());
  $('#drawing-dialog').addEventListener('cancel', event => event.preventDefault());
  $$('dialog:not(#drawing-dialog)').forEach((dialog) => dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  window.addEventListener('pagehide', () => { clearTimeout(draftTimer); persistDraft(); });

  async function initialize() {
    tshirtExample.decoding = 'async';
    tshirtExample.addEventListener('load', () => { if (state.product === 'tshirt') scheduleDraw(); });
    tshirtExample.src = 'assets/mustang-tshirt-print.png';
    setProduct('frame');
    updatePreviewMode();
    updateCaption();
    aiConfig = await AI.config();
    $('#ai-badge').textContent = aiConfig.test ? 'Проверка интерфейса' : aiConfig.ready ? 'Иллюстрация из вашего фото' : 'Осталось подключить обработку';
    $('#ai-test-note').hidden = !aiConfig.test;
    aiStatus(aiConfig.ready ? 'Загрузите фото — создадим одну иллюстрацию. Название и год меняются без новой обработки.' : 'Создание иллюстраций временно недоступно. Попробуйте позже.');
    const records = await Promise.all(slots.map((_, index) => AI.draft('get', null, index)));
    records.forEach((saved, index) => {
      if (saved?.sourceFile instanceof Blob && Boolean(saved.test) === Boolean(aiConfig.test)) {
        if (!saved.generatedFile && Date.now() - saved.savedAt >= 23 * 60 * 60 * 1000) saved.job = null;
        slots[index] = saved;
      }
    });
    let index = 0;
    try { index = Number(localStorage.getItem('teplo-active-story')) || 0; } catch {}
    restoring = false; $('.builder').inert = false;
    await selectSlot(Number.isInteger(index) && index >= 0 && index < slots.length ? index : 0);
  }
  $('.builder').inert = true;
  initialize();
})();
