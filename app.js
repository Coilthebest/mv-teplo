'use strict';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const phoneLayout = matchMedia('(max-width: 680px)');
  const editor = $('#workshop-editor');
  const editorGroups = {
    caption: $('#caption').closest('.control-group'),
    product: $('#product-format').closest('.control-group')
  };
  const mobileParts = ['.preview-top', '#preview-stage', '.workshop-tools', '#garland-picker',
    '.preview-bottom', '.preview-actions', '#cart-add-error', '#cancel-cart-edit',
    '#workshop-placement', '.stories'].map($);
  // Keep the live controls (and their listeners) when rotating a phone or resizing.
  const homes = new Map();
  for (const node of [...mobileParts, $('#print-controls'), ...Object.values(editorGroups)]) {
    const anchor = document.createComment('workshop');
    node.before(anchor);
    homes.set(node, anchor);
  }
  function placePreview() {
    if (phoneLayout.matches) {
      $('#drop-zone').before(...mobileParts);
      $('#workshop-placement').append($('#print-controls'));
      $('.workshop-fields').append(...Object.values(editorGroups));
    } else {
      if (editor.open) editor.close();
      for (const [node, anchor] of homes) anchor.after(node);
      for (const group of Object.values(editorGroups)) group.hidden = false;
    }
  }
  for (const button of $$('[data-editor]')) {
    button.addEventListener('click', () => {
      for (const [key, group] of Object.entries(editorGroups)) group.hidden = key !== button.dataset.editor;
      $('#workshop-editor-title').textContent = button.textContent;
      editor.showModal();
      $('.workshop-fields').scrollTop = 0;
    });
  }
  $('#workshop-done').addEventListener('click', () => editor.close());
  $('.examples-jump').addEventListener('click', () => { if (editor.open) editor.close(); });
  new IntersectionObserver(([entry]) => {
    document.body.classList.toggle('workshop-in-view', entry.isIntersecting);
  }).observe($('.builder'));
  placePreview();
  phoneLayout.addEventListener('change', placePreview);
  const canvas = $('#artwork-canvas');
  const ctx = canvas.getContext('2d');
  const products = {
    digital: { name: 'Электронная версия в HD-качестве', formats: ['PNG · электронный файл'] },
    frame: { name: 'История в рамке', formats: ['10 × 15 см'] },
    magnet: { name: TeploPricing.names.magnet, formats: Object.keys(TeploPricing.magnets), defaultFormat: '6 × 9 см (рекомендуем)' },
    keychain: { name: 'История, которая всегда с вами', formats: ['Прямоугольный · 3 × 4 см', 'Акриловый · 40 × 56 мм'] },
    paper: { name: 'Наклейка с вашей историей', formats: ['10 × 15 см'] },
    tshirt: { name: 'Футболка с вашей историей', formats: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], defaultFormat: 'M' },
    garland: { name: 'Арт-гирлянда воспоминаний', formats: ['5', '10'], defaultFormat: '5' },
  };
  const tshirtColors = teploShirtColors;
  const state = { upload: null, product: 'frame', material: 'sticker', shirtColor: 'white', shirtSize: 'M', sourceFile: null, sourceHash: null, editingCartId: null, illustration: null, illustrationFile: null, shirtPrint: null, job: null, generating: false, legacy: false };
  const AI = window.TeploIllustration;
  function layout(value={}) {
    const bound=(v,min,max,initial)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):initial;
    return {scale:bound(value.scale,65,150,100),x:bound(value.x,-100,100,0),y:bound(value.y,-100,100,0)};
  }
  state.layouts = {};
  function placement(view = giftView()) {
    return state.layouts[view] || (state.layouts[view] = layout());
  }
  let exampleShirtPrint = null;
  const choiceExample=new Image();
  choiceExample.onload=()=>{ exampleShirtPrint = AI.printVignette(choiceExample); scheduleDraw(); };
  choiceExample.src='assets/couple-art.webp';
  let aiConfig = { ready: false };
  const canOrderArtwork = () => Boolean(state.illustration && state.sealedArtwork?.objectId);
  const canOrderProduct = () => state.product === 'garland' ? garland.ready : canOrderArtwork();
  let draftTimer;
  const slots = Array(10).fill(null);
  const slotImages = Array(10).fill(null);
  let activeSlot = 0;
  let restoring = true;
  let warnedAboutStorage = false;
  let storyId = null;
  let photoHash = null;
  const slotDeleteButtons = [];
  const slotButtons = slots.map((_, index) => {
    const cell = document.createElement('div');
    cell.className = 'story-cell';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'story-slot';
    button.addEventListener('click', () => selectSlot(index, true));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'story-delete';
    remove.textContent = '×';
    remove.hidden = true;
    remove.addEventListener('click', () => requestStoryDeletion(index));
    slotDeleteButtons.push(remove);
    cell.append(button, remove);
    $('#story-grid').append(cell);
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
    mode.append(dot, document.createTextNode(state.illustration ? 'Ваша иллюстрация · надпись добавляет Teplo' : hasPhoto ? state.generating ? 'Рисуем вашу иллюстрацию · обычно 1–2 минуты' : 'Исходное фото · обработка ещё не готова' : 'Пример изделия · загрузите своё фото'));
    $('#preview-stage').classList.remove('is-empty');
    $('#preview-empty').hidden = true;
    $('#stage-annotation').textContent = 'Ваш момент. Ваша история.';
    $('.preview-disclaimer').textContent = state.illustration ? isTshirt ? 'Принт без внешней бумажной подложки. Проверьте светлые детали на эскизе: цвет и посадка готовой футболки могут отличаться. HD-файл иллюстрации сохраняется отдельно.' : defaultDisclaimer : isTshirt
      ? hasPhoto ? 'Здесь показана футболка с вашим исходным изображением. Фон исходного фото сохраняется; PNG с прозрачностью примеряется без подложки. Цвет и посадка готового изделия могут отличаться.' : 'Так может выглядеть футболка с готовой иллюстрацией без бумажной подложки. Загрузите своё фото, чтобы собрать личный эскиз. Цвет и посадка готового изделия могут отличаться.'
      : defaultDisclaimer;
    if (state.product === 'garland') {
      mode.replaceChildren(dot, document.createTextNode(garland.count ? `Ваша гирлянда · ${garland.count} из ${garland.format} иллюстраций` : 'Пример гирлянды · выберите свои иллюстрации'));
      $('.preview-disclaimer').textContent = 'Каждая иллюстрация в белой картонной рамке с деревянной прищепкой. Выберите 5 или 10 готовых рисунков.';
      $('#garland-picker-status').textContent = `Выбрано ${garland.count} из ${garland.format} иллюстраций`;
      $('#garland-pick').textContent = garland.count ? 'Изменить иллюстрации' : 'Выбрать иллюстрации';
    }
    $('#view-selection').disabled = state.product === 'garland' ? !garland.ready : !hasArtwork;
    $('#add-to-cart').disabled = !canOrderProduct() || savingCart || state.generating;
  }

  function selectedProductName() {
    return state.product === 'paper' ? TeploPricing.productName(state) : products[state.product].name;
  }

  function updateProduct() {
    const key = state.product;
    $$('.product-option[data-product]').forEach(button => {
      const selected = button.dataset.product === key && (!button.dataset.material || button.dataset.material === state.material);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#preview-stage').dataset.product = key;
    $('#preview-stage').dataset.material = state.material;
    $('#product-name').textContent = selectedProductName();
    $('#tshirt-options').hidden = key !== 'tshirt';
    $('#print-controls').hidden = key === 'garland';
    $('#garland-picker').hidden = key !== 'garland';
    $('#art-object').classList.remove('aligning');
    $('.format-label').textContent = key === 'tshirt' ? 'Размер футболки' : key === 'garland' ? 'Размер гирлянды' : 'Формат';
    updateTshirtControls();
    const formats = products[key].formats;
    $('#product-format').replaceChildren(...formats.map((text) => {
      const option = document.createElement('option');
      option.value = text;
      option.textContent = key === 'magnet' || key === 'garland' ? `${key === 'garland' ? text + ' иллюстраций' : text} — ${TeploPricing.money(TeploPricing.unitPrice({ product: key, format: text }))}` : text;
      return option;
    }));
    $('#product-format').value = key === 'tshirt' ? state.shirtSize : key === 'garland' ? garland.format : products[key].defaultFormat || formats[0];
    updateProductSpec();
    updatePreviewMode();
  }

  function updateTshirtControls() {
    for(const key of ['scale','x','y']){
      const slider=$('#print-'+key);
      slider.value=placement()[key];
      slider.previousElementSibling.value=slider.value+'%';
    }
    setPressed($$('.tshirt-color'), 'shirtColor', state.shirtColor);
    $('#tshirt-color-name').textContent = tshirtColors[state.shirtColor].name;
  }

  function setProduct(key, material = 'sticker') {
    if (!products[key]) return;
    state.product = key;
    if (key === 'paper') state.material = material === 'matte' ? 'matte' : 'sticker';
    updateProduct();
  }

  function restoreFormat(format) {
    const select = $('#product-format');
    if (Array.from(select.options).some(option => option.value === format)) select.value = format;
    else if (state.product === 'keychain') select.value = 'Акриловый · 40 × 56 мм';
  }

  function currentSpec() {
    const format = $('#product-format').value;
    if (state.product === 'tshirt') return `${tshirtColors[state.shirtColor].name} · размер ${format}`;
    if (state.product === 'garland') return `${format} иллюстраций`;
    return state.product === 'paper' ? `${TeploPricing.productName(state)} · ${format}` : format;
  }

  function currentCanvasHeight() {
    if (state.product === 'garland') return garland.format === '10' ? 770 : 400;
    if (state.product === 'digital') return 1200;
    if (state.product === 'tshirt') return 1080;
    if (state.product === 'magnet') {
      const dimensions = $('#product-format').value.match(/(\d+) × (\d+)/);
      if (dimensions) return Math.round(900 * Number(dimensions[2]) / Number(dimensions[1]));
    }
    return ['frame', 'paper', 'digital'].includes(state.product) ? 1350 : 1200;
  }

  function updateProductSpec() {
    if (state.product === 'tshirt') state.shirtSize = $('#product-format').value;
    if (state.product === 'garland') {
      garland.setFormat($('#product-format').value);
      $('#preview-stage').dataset.garlandCount = garland.format;
      updatePreviewMode();
    }
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
      const remove = slotDeleteButtons[i];
      remove.hidden = !record;
      remove.disabled = button.disabled;
      remove.title = 'Удалить фото';
      remove.setAttribute('aria-label', `Удалить фото из ячейки ${i + 1}${record?.caption ? ': ' + record.caption : ''}`);
    });
    $('#stories-count').textContent = slots.filter(Boolean).length + ' из 10';
  }

  function structuredLayouts() {
    return Object.fromEntries(Object.entries(state.layouts).map(([view, value]) => [view, layout(value)]));
  }

  function persistDraft() {
    if (!state.sourceFile || restoring || activeSlot < 0) return;
    const saved = { storyId, photoHash, sourceFile: state.sourceFile, generatedFile: state.illustrationFile, previewMarked: state.previewMarked, sealedArtwork: state.sealedArtwork,
      job: state.job, legacy: state.legacy, caption: $('#caption').value, year: $('#year').value, yearLines: $('#year-lines').checked,
      product: state.product === 'garland' ? 'frame' : state.product, material: state.material, format: state.product === 'garland' ? '10 × 15 см' : $('#product-format').value,
      shirtColor: state.shirtColor, shirtSize: state.shirtSize, layouts:structuredLayouts(), qty: $('#item-quantity').value };
    slots[activeSlot] = saved;
    renderSlots();
    return AI.draft('put', saved, activeSlot).then(result => {
      if (result === null && !warnedAboutStorage) {
        warnedAboutStorage = true;
        notify('Браузер не смог сохранить черновик. Оставьте страницу открытой, чтобы продолжить работу.');
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

  async function requestStoryDeletion(index) {
    const dialog = $('#delete-story-dialog');
    const record = slots[index];
    if (!record || dialog.open || restoring || state.generating || savingCart) return;
    const preview = $('#delete-story-image');
    const previewUrl = URL.createObjectURL(record.generatedFile || record.sourceFile);
    preview.src = previewUrl;
    dialog.returnValue = '';
    const closed = new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
    dialog.showModal();
    await closed;
    preview.removeAttribute('src');
    URL.revokeObjectURL(previewUrl);
    if (dialog.returnValue !== 'delete' || restoring || state.generating || savingCart || slots[index]?.sourceFile !== record.sourceFile) return;

    const deletingActive = index === activeSlot;
    const keepGarland = deletingActive && state.product === 'garland';
    const editId = state.editingCartId;
    const quantity = $('#item-quantity').value;
    clearTimeout(draftTimer);
    if (!deletingActive) persistDraft();
    restoring = true;
    $('.builder').inert = true;
    renderSlots();
    let removed = false;
    try {
      if (!await AI.draft('delete', null, index)) {
        notify('Не удалось удалить фото из памяти браузера. Попробуйте ещё раз.');
        return;
      }
      const objectId = slots[index]?.sealedArtwork?.objectId;
      slots[index] = null;
      if (deletingActive) {
        clearEditor();
        if (keepGarland) {
          state.editingCartId = editId;
          $('#item-quantity').value = quantity;
          setProduct('garland');
        }
      }
      if (objectId && !slots.some(item => item?.sealedArtwork?.objectId === objectId)) {
        garland.forgetDraft(objectId);
      }
      removed = true;
      scheduleDraw();
      notify('Фото удалено. Можно добавить новое в освободившуюся ячейку.');
    } finally {
      restoring = false;
      $('.builder').inert = false;
      renderSlots();
      updatePurchase();
      if (removed) slotButtons[index].focus({ preventScroll: true });
      else queueDraft();
    }
  }

  function clearEditor() {
    resetUpload();
    state.editingCartId = null;
    $('#item-quantity').value = 1;
    $('#caption').value = ''; $('#year').value = ''; $('#year-lines').checked = true;
    state.layouts={}; state.material = 'sticker'; state.shirtColor = 'white'; state.shirtSize = 'M';
    $('#summary-image').removeAttribute('src');
    $('#cart-add-error').hidden = true;
    setProduct('frame'); updateCaption();
  }

  async function restoreRecord(saved) {
    if (!await loadUpload(saved.sourceFile, { confirmGeneration: false })) return;
    storyId = saved.storyId || crypto.randomUUID();
    photoHash = saved.photoHash || null;
    $('#caption').value = saved.caption || ''; $('#year').value = saved.year || ''; $('#year-lines').checked = saved.yearLines !== false;
    state.job = saved.job || null;
    state.legacy = Boolean(saved.legacy);
    if (saved.generatedFile instanceof Blob && saved.sealedArtwork?.objectId && !saved.test) {
      await applyIllustration(saved.generatedFile, saved.previewMarked || saved.sealedArtwork?.previewMark); state.sealedArtwork = saved.sealedArtwork;
      aiStatus('Иллюстрация готова. Выберите подарок или измените надпись.');
    } else if (!state.job || !aiConfig.ready) {
      $('#ai-retry').hidden = false;
      $('#ai-retry').textContent = state.job ? 'Продолжить ожидание' : 'Создать иллюстрацию';
    }
    state.shirtColor = tshirtColors[saved.shirtColor] ? saved.shirtColor : 'white';
    state.layouts = {};
    for (const view of ['frame','magnet','keychain','paper','sticker','digital','tshirt']) {
      state.layouts[view] = layout(saved.layouts?.[view] || (view === 'tshirt' ? saved.printLayout : undefined));
    }
    state.shirtSize = saved.shirtSize || 'M';
    setProduct(saved.product || 'frame', saved.material);
    if (saved.format) restoreFormat(saved.format);
    $('#item-quantity').value = saved.qty || 1;
    updateProductSpec(); updatePreviewMode(); updateCaption(); updatePurchase();
  }

  async function selectSlot(index, pick = false) {
    if (state.generating || restoring || savingCart) return;
    if (index === activeSlot && slots[index] && state.upload) return;
    const keepGarland = state.product === 'garland';
    const garlandEditId = keepGarland ? state.editingCartId : null;
    const garlandQty = $('#item-quantity').value;
    const showGarland = () => {
      if (!keepGarland) return;
      state.editingCartId = garlandEditId;
      $('#item-quantity').value = garlandQty;
      setProduct('garland');
    };
    persistDraft();
    setActiveSlot(index);
    clearEditor();
    const saved = slots[index];
    if (!saved) {
      showGarland();
      renderSlots();
      if (pick) $('#photo-input').click();
      return;
    }
    restoring = true; $('.builder').inert = true;
    try { await restoreRecord(saved); }
    catch { aiStatus('Не удалось открыть сохранённую иллюстрацию.', true); }
    finally { restoring = false; $('.builder').inert = false; showGarland(); renderSlots(); }
    if (state.job && aiConfig.ready) runGeneration();
  }
  async function applyIllustration(blob, marked, fresh = false) {
    let image = await AI.loadImage(blob);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Получилось изображение слишком низкого разрешения.');
    if (!marked) {
      const preview = document.createElement('canvas');
      preview.width = image.naturalWidth;
      preview.height = image.naturalHeight;
      const context = preview.getContext('2d');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, preview.width, preview.height);
      markTeploPreview(pixels.data, preview.width, preview.height, 4, preview.width * 4, 0);
      context.putImageData(pixels, 0, 0);
      const markedBlob = await AI.asBlob(preview);
      image = await AI.loadImage(markedBlob);
      if (fresh) blob = markedBlob;
    }
    state.previewMarked = Boolean(marked || fresh);
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
      if (!aiConfig.ready || aiConfig.test) throw new Error('Не удалось подключиться к генерации. Попробуйте ещё раз.');
      if (state.job) aiStatus('Продолжаем обработку вашего фото. Обычно рисунок готов за 1–2 минуты.');
      let pollFailures = 0;
      let response = state.job ? { status: 'processing', job: state.job, retryAfter: 3 } : await AI.start(state.upload);
      if (response.job) { state.job = response.job; await persistDraft(); }
      const deadline = Date.now() + 10 * 60 * 1000;
      while (response.status === 'processing') {
        if (!state.job) throw new Error('Не получен номер обработки. Новую автоматически не запускаем.');
        if (Date.now() > deadline) { const error = new Error('Обработка занимает дольше обычного. Можно продолжить ожидание этой же иллюстрации.'); error.network = true; throw error; }
        await new Promise(resolve => setTimeout(resolve, Math.max(3, Math.min(15, response.retryAfter || 5)) * 1000));
        if (version !== uploadVersion) return;
        try {
          response = await AI.poll(state.job);
          pollFailures = 0;
        } catch (error) {
          if ((!error.network && error.code !== 'gateway_timeout') || ++pollFailures > 3) throw error;
          response = {status:'processing',retryAfter:3*pollFailures};
        }
      }
      if (version !== uploadVersion) return;
      if (!response.sealedArtwork?.objectId) throw new Error('Не удалось сохранить HD-иллюстрацию. Повторите обработку.');
      try { await applyIllustration(AI.imageBlob(response.image), response.sealedArtwork?.previewMark, true); } catch (error) { error.keepJob = true; throw error; }
      state.sealedArtwork = response.sealedArtwork; state.job = null;
      await persistDraft(); aiStatus('Иллюстрация готова. Добавьте название и год — они меняются без новой обработки.');
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
    paintTeploContainedImage(context, image, x, y, width, height);
  }

  function shirtPreviewOptions() {
    return {
      caption: state.upload ? $('#caption').value.trim() : '',
      year: state.upload ? $('#year').value.trim() : '',
      yearLines: $('#year-lines').checked,
      printLayout: placement('tshirt'),
      shirtColor: state.shirtColor,
      shirtPrint: state.shirtPrint || state.upload || exampleShirtPrint || tshirtExample,
    };
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

  function renderGift(target, view, poster) {
    const item = view === 'tshirt' ? shirtPreviewOptions() : {
      poster,
      format: view === state.product ? $('#product-format').value : '',
      printLayout: placement(view),
    };
    if (view === 'garland') {
      garland.paint(target, target !== canvas);
    } else TeploMockups.paint(target, view, item);
  }

  function draw() {
    drawArtwork();
    if(!matchMedia('(max-width:800px)').matches) return;
    const mini=$('#choice-canvas'),g=mini.getContext('2d');
    g.clearRect(0,0,mini.width,mini.height);
    drawContain(canvas,0,0,mini.width,mini.height,g);
    $('#choice-name').textContent=selectedProductName();
    $('#choice-spec').textContent=currentSpec();
  }
  function drawArtwork() {
    const gallery = $('#gift-views');
    const selected = giftView();
    const isGarland = selected === 'garland';
    const buttons = $$('[data-gift-view]');
    const example = (!state.upload || isGarland) && choiceExample.naturalWidth ? choiceExample : null;
    gallery.hidden = !state.illustration && !example && !isGarland;
    const showMockup = isGarland || Boolean((state.illustration || example) && (buttons.some(button => button.dataset.giftView === selected) || selected === 'paper' || selected === 'digital'));
    $('#preview-stage').classList.toggle('gift-mockup', showMockup);
    let poster = example ? AI.printInk(example) : null;
    if (state.illustration) {
      poster = AI.compose(state.illustration, $('#caption').value, $('#year').value, $('#year-lines').checked);
    }
    for (const button of buttons) {
      if (poster || button.dataset.giftView === 'garland') renderGift(button.querySelector('canvas'), button.dataset.giftView, poster);
      button.setAttribute('aria-pressed', String(button.dataset.giftView === selected));
    }
    if (isGarland) {
      if (canvas.width !== 1000) canvas.width = 1000;
      if (canvas.height !== currentCanvasHeight()) canvas.height = currentCanvasHeight();
      garland.paint(canvas);
      canvas.setAttribute('aria-label', selectedProductName() + ' · ' + currentSpec());
      return;
    }
    if (canvas.width !== 900) canvas.width = 900;
    if (showMockup) {
        if (canvas.height !== 1080) canvas.height = 1080;
        renderGift(canvas, selected, poster);
        canvas.setAttribute('aria-label', selectedProductName() + ' · ' + currentSpec());
        return;
    }
    const height = currentCanvasHeight();
    const landscape = height < canvas.width;
    if (canvas.height !== height) canvas.height = height;
    ctx.clearRect(0, 0, 900, height);
    if (state.product === 'tshirt') {
      canvas.setAttribute('aria-label', `${state.upload ? 'Ваше фото на футболке' : 'Пример футболки'} · ${currentSpec()}`);
      renderGift(canvas, selected, null);
      return;
    }
    if (poster) {
      paintTeploPaperPrint(ctx, poster, 0, 0, canvas.width, height, placement());
      return;
    }
    if (!state.upload) return;
    placeTeploPrint(ctx,0,0,canvas.width,height,placement(), () => drawOriginalSketch(height,landscape));
  }

  function drawOriginalSketch(height,landscape) {
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
    if (confirmGeneration) {
      // Keep our own bytes after the iOS photo picker releases its temporary file.
      try { file = new File([await file.arrayBuffer()], file.name, { type: file.type, lastModified: file.lastModified }); }
      catch { setStatus('Не удалось прочитать фото. Выберите его ещё раз.', true); return; }
      if (requestId !== uploadVersion) return;
    }
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
        await runGeneration();
      }
      return true;
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      if (requestId !== uploadVersion) return;
      setStatus(error.message === 'too_large' ? 'Очень большой размер изображения. Уменьшите фото до 64 мегапикселей или меньше.' : 'Не получилось открыть фото. Попробуйте другой JPG, PNG или WebP.', true);
    }
  }

  function openSelection() {
    if (state.product === 'garland' ? !garland.ready : !state.upload) return;
    draw();
    $('#summary-image').src = TeploMockups.withBackground(canvas).toDataURL('image/png');
    $('#summary-caption').textContent = state.product === 'garland' ? 'Ваши выбранные иллюстрации' : $('#caption').value.trim() || 'Без надписи';
    $('#summary-year').textContent = state.product === 'garland' ? 'Сохранены на каждой карточке' : $('#year').value.trim() || 'Без даты';
    $('#summary-product').textContent = selectedProductName();
    $('#summary-format').textContent = currentSpec();
    $('#summary-format').previousElementSibling.textContent = state.product === 'tshirt' ? 'Цвет и размер' : 'Формат';
    $('#summary-image').alt = state.product === 'tshirt' ? `Эскиз футболки: ${currentSpec()}` : 'Собранный вами эскиз';
    $('#selection-dialog').showModal();
  }

  function updatePurchase() {
    const P = window.TeploPricing;
    const price = P.unitPrice({ product: state.product, material: state.material, format: $('#product-format').value });
    const isDigital = state.product === 'digital';
    if (isDigital) $('#item-quantity').value = 1;
    $('#item-quantity').disabled = isDigital;
    $('#selected-price').textContent = P.money(price);
    $('#preview-price').textContent = P.money(price * P.quantity($('#item-quantity').value));
    $('#digital-help').hidden = !isDigital;
    const action = state.editingCartId ? 'Обновить в корзине' : 'Добавить в корзину';
    const quality = state.product === 'magnet' ? ' · ' + P.names.magnet : '';
    $('#add-to-cart').textContent = action + quality;
    $('#cancel-cart-edit').hidden = !state.editingCartId;
    $('#add-to-cart').disabled = savingCart || state.generating || !canOrderProduct();
  }

  function endCartEdit() { state.editingCartId = null; updatePurchase(); }

  async function addToCart() {
    if (savingCart || state.generating || !canOrderProduct() || (state.product !== 'garland' && (!state.upload || !state.sourceFile))) return;
    $('#cart-add-error').hidden = true;
    savingCart = true; renderSlots();
    const button = $('#add-to-cart');
    const file = state.sourceFile;
    const editId = state.editingCartId;
    try {
      if (state.product === 'garland') {
        button.disabled = true;
        button.textContent = 'Сохраняем вашу гирлянду…';
        const item = garland.item(TeploPricing.quantity($('#item-quantity').value), null);
        draw();
        item.preview = await new Promise((resolve,reject) => TeploMockups.withBackground(canvas).toBlob(blob => blob ? resolve(blob) : reject(Error('preview_failed')), 'image/jpeg', .88));
        await TeploCart.add(item, editId);
        endCartEdit();
        $('#item-quantity').value = 1;
        notify(editId ? 'Гирлянда обновлена в корзине.' : 'Гирлянда добавлена в корзину.');
        TeploCart.open();
        return;
      }
      const item = {
        product: state.product,
        material: state.product === 'paper' ? state.material : '',
        format: $('#product-format').value,
        shirtColor: state.product === 'tshirt' ? state.shirtColor : '',
        printLayout:layout(placement()),
        colorName: state.product === 'tshirt' ? tshirtColors[state.shirtColor].name : '',
        caption: $('#caption').value.trim(), year: $('#year').value.trim(), yearLines: $('#year-lines').checked,
        qty: state.product === 'digital' ? 1 : TeploPricing.quantity($('#item-quantity').value),
        sourceFile: file, storyId,
        generatedFile: state.illustrationFile, previewMarked: state.previewMarked, sealedArtwork: state.sealedArtwork,
      };
      button.disabled = true;
      button.textContent = 'Сохраняем вашу историю…';
      draw();
      const thumbnail=document.createElement('canvas');
      thumbnail.width=360;thumbnail.height=Math.round(360*canvas.height/canvas.width);
      const thumb=thumbnail.getContext('2d');
      thumb.drawImage(TeploMockups.withBackground(canvas),0,0,thumbnail.width,thumbnail.height);
      item.preview=await new Promise((resolve,reject)=>thumbnail.toBlob(blob=>blob?resolve(blob):reject(Error('preview_failed')),'image/jpeg',.88));
      thumbnail.width=thumbnail.height=1;
      const artwork = state.illustrationFile || file;
      const digest = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
      const hash = state.sourceHash || await digest(artwork);
      item.photoHash = photoHash || await digest(file);
      if (state.sourceFile === file) photoHash = item.photoHash;
      if (state.sourceFile === file) state.sourceHash = hash;
      const artworkParts = item.year && !item.yearLines ? [hash,item.caption,item.year,false] : [hash,item.caption,item.year];
      const pos = item.printLayout;
      if (item.product === 'digital' && (pos.scale !== 100 || pos.x || pos.y)) artworkParts.push(pos);
      item.artworkKey = JSON.stringify(artworkParts);
      await window.TeploCart.add(item, editId);
      endCartEdit();
      $('#item-quantity').value = 1;
      updatePurchase();
      notify(editId ? 'Товар обновлён в корзине.' : 'Добавили в корзину. Можно выбрать ещё вещь с этим фото.');
      window.TeploCart.open();
    } catch (error) {
      const messages = { quantity_limit: 'Для одного варианта можно добавить до 99 штук.', cart_full: 'В корзине уже 50 вариантов. Удалите лишнее или увеличьте количество имеющихся.', removed_item: 'Этот товар уже удалён. Добавьте его в корзину заново.' };
      const hint = $('#cart-add-error');
      hint.textContent = messages[error.message] || 'Не удалось добавить товар. Попробуйте ещё раз. Код ошибки: ' + (error.name || 'cart');
      hint.hidden = false;
      if (error.message === 'removed_item') endCartEdit();
    } finally { savingCart = false; renderSlots(); updatePurchase(); queueDraft(); }
  }

  document.addEventListener('teplo:notice', event => notify(event.detail));
  document.addEventListener('teplo:edit-cart', async event => {
    const { item, copy } = event.detail;
    if (restoring || state.generating || savingCart) { notify('Дождитесь окончания обработки.'); return; }
    if (item.product === 'garland') {
      state.editingCartId = copy ? null : item.id;
      $('#item-quantity').value = copy ? 1 : item.qty;
      setProduct('garland');
      await garland.edit(item);
      notify(copy ? 'Гирлянда выбрана. Можно изменить набор иллюстраций.' : 'Измените гирлянду и нажмите «Обновить в корзине».');
      return;
    }
    persistDraft();
    const matching = item.storyId ? slots.findIndex(record => record?.storyId === item.storyId) : -1;
    // If all slots are occupied, an older cart item can be edited outside the gallery.
    setActiveSlot(matching >= 0 ? matching : slots.findIndex(record => !record));
    restoring = true; $('.builder').inert = true;
    clearEditor();
    try {
      if (!await loadUpload(item.sourceFile, { confirmGeneration: false })) return;
      storyId = item.storyId || storyId; photoHash = item.photoHash || null;
      if (item.generatedFile instanceof Blob && item.sealedArtwork?.objectId && !item.testArtwork) { await applyIllustration(item.generatedFile, item.previewMarked || item.sealedArtwork?.previewMark); state.sealedArtwork = item.sealedArtwork; }
      else state.legacy = true;
    } catch { notify('Не удалось открыть эскиз из корзины.'); return; }
    finally { restoring = false; $('.builder').inert = false; renderSlots(); }
    aiStatus(state.illustration ? 'Этот рисунок уже создан. Название, год и товар можно менять без новой генерации.' : 'Сохранённый эскиз с исходным фото. Можно запустить создание иллюстрации.');
    $('#ai-retry').hidden = canOrderArtwork();
    if (!canOrderArtwork()) $('#ai-retry').textContent = 'Создать иллюстрацию';
    state.editingCartId = copy ? null : item.id;
    $('#caption').value = item.caption;
    $('#year').value = item.year; $('#year-lines').checked = item.yearLines !== false;
    
    if (item.shirtColor && tshirtColors[item.shirtColor]) state.shirtColor = item.shirtColor;
    if (item.product === 'tshirt') state.shirtSize = item.format;
    setProduct(item.product, item.material);
    state.layouts[giftView()] = layout(item.printLayout);
    updateTshirtControls();
    restoreFormat(item.format);
    $('#item-quantity').value = copy ? 1 : item.qty;
    updateProductSpec(); updateCaption(); updatePurchase();
    (phoneLayout.matches ? $('[data-editor=caption]') : $('#caption')).focus({ preventScroll: true });
    notify(!canOrderArtwork() ? 'Создайте иллюстрацию из сохранённого фото и обновите товар в корзине.' : copy ? 'Рисунок уже здесь. Выберите другую вещь для него.' : 'Измените товар и нажмите «Обновить в корзине».');
  });
  document.addEventListener('teplo:cart-removed', event => { if (state.editingCartId === event.detail) endCartEdit(); });
  document.addEventListener('teplo:cart-cleared', endCartEdit);
  $('#cancel-cart-edit').addEventListener('click', () => { endCartEdit(); notify('Теперь можно добавить этот эскиз как новый товар.'); });
  $('#item-quantity').addEventListener('input', () => { updatePurchase(); queueDraft(); });
  $('#item-quantity').addEventListener('change', () => { $('#item-quantity').value = TeploPricing.quantity($('#item-quantity').value); updatePurchase(); });
  $('#add-to-cart').addEventListener('click', addToCart);

  $$('[data-gift-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.giftView;
    if (view === 'sticker') setProduct('paper');
    else setProduct(view);
  }));
  $$('.product-option').forEach((button) => button.addEventListener('click', () => setProduct(button.dataset.product, button.dataset.material)));
  $$('[data-choose-product]').forEach((link) => link.addEventListener('click', () => {
    setProduct(link.dataset.chooseProduct, link.dataset.chooseMaterial);
    if (link.dataset.chooseFormat) {
      $('#product-format').value = link.dataset.chooseFormat;
      updateProductSpec();
    }
  }));
  $('#caption').addEventListener('input', updateCaption);
  $('#year-lines').addEventListener('change', updateCaption);
  $('#year').addEventListener('input', () => {
    $('#year').value = $('#year').value.replace(/\D/g, '').slice(0, 4);
    updateCaption();
  });
  $('#product-format').addEventListener('change', updateProductSpec);
  const guidePanel=$('#print-controls');
  const endAlignment=()=>$('#art-object').classList.remove('aligning');
  function beginAlignment(event){
    if(event.target.type==='range' && (event.type!=='keydown' || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))) $('#art-object').classList.add('aligning');
  }
  guidePanel.addEventListener('pointerdown',beginAlignment);
  guidePanel.addEventListener('keydown',beginAlignment);
  for(const name of ['pointerup','pointercancel','keyup','blur']) window.addEventListener(name,endAlignment);
  guidePanel.addEventListener('focusout',endAlignment);
  for(const key of ['scale','x','y']){
    $('#print-'+key).addEventListener('input',event=>{
      placement()[key]=Number(event.target.value);
      updateTshirtControls();scheduleDraw();queueDraft();
    });
  }
  $('#print-reset').addEventListener('click',()=>{
    state.layouts[giftView()]=layout();updateTshirtControls();scheduleDraw();queueDraft();
  });
  $$('.tshirt-color').forEach((button) => button.addEventListener('click', () => {
    if (!tshirtColors[button.dataset.shirtColor]) return;
    state.shirtColor = button.dataset.shirtColor;
    updateTshirtControls();
    updateProductSpec();
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
    if (state.product === 'garland') {
      garland.clear(); endCartEdit(); setProduct('garland');
      notify('Выбор гирлянды сброшен. Ваши иллюстрации сохранены.');
      return;
    }
    if (activeSlot >= 0 && slots[activeSlot]) { void requestStoryDeletion(activeSlot); return; }
    clearEditor(); renderSlots();
    notify('Начнём новую историю. Загрузите свою фотографию.');
  });
  document.addEventListener('teplo:next-story', () => {
    if (restoring || state.generating || savingCart) return;
    const empty = slots.findIndex(record => !record);
    if (empty >= 0) selectSlot(empty, true);
    else { slotButtons[0].focus(); notify('Все 10 ячеек заняты. Выберите рисунок или освободите ячейку крестиком.'); }
  });
  $('#view-selection').addEventListener('click', openSelection);
  $('#close-dialog').addEventListener('click', () => $('#selection-dialog').close());
  $('#dialog-back').addEventListener('click', () => $('#selection-dialog').close());
  $('#privacy-button').addEventListener('click', () => $('#privacy-dialog').showModal());
  $('#close-privacy').addEventListener('click', () => $('#privacy-dialog').close());
  const legalDialog = $('#legal-dialog');
  $$('[data-legal-document]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    $('#legal-title').textContent = link.textContent;
    legalDialog.showModal();
  }));
  $('#close-legal').addEventListener('click', () => legalDialog.close());
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
    TeploMockups.ready.then(scheduleDraw);
    setProduct('frame');
    updatePreviewMode();
    updateCaption();
    aiConfig = await AI.config();
    $('#ai-badge').textContent = aiConfig.ready ? 'Иллюстрация из вашего фото' : 'Обработка фото временно недоступна';
    aiStatus(aiConfig.ready ? 'Загрузите фото — создадим одну иллюстрацию. Название и год меняются без новой обработки.' : 'Создание иллюстраций временно недоступно. Попробуйте позже.');
    const records = await Promise.all(slots.map((_, index) => AI.draft('get', null, index)));
    records.forEach((saved, index) => {
      if (saved?.sourceFile instanceof Blob) {
        if (!saved.generatedFile && Date.now() - saved.savedAt >= 23 * 60 * 60 * 1000) saved.job = null;
        slots[index] = saved;
      }
    });
    let index = 0;
    try { index = Number(localStorage.getItem('teplo-active-story')) || 0; } catch {}
    restoring = false; $('.builder').inert = false;
    await selectSlot(Number.isInteger(index) && index >= 0 && index < slots.length ? index : 0);
    // Public product pages open the existing builder after restoring saved photos.
    const entry = new URLSearchParams(location.search);
    const requestedProduct = entry.get('product');
    if (Object.hasOwn(products, requestedProduct)) {
      const material = entry.get('material') === 'matte' ? 'matte' : 'sticker';
      setProduct(requestedProduct, material);
      const format = entry.get('format');
      if (products[requestedProduct].formats.includes(format)) {
        $('#product-format').value = format;
        updateProductSpec();
      }
    }
  }
  const garland = window.setupGarland({
    stories() {
      persistDraft();
      return slots;
    },
    upload() {
      const empty = slots.findIndex(record => !record);
      if (empty < 0) {
        $('#story-grid').scrollIntoView({ block: 'center' });
        notify('Все ячейки заняты. Выберите фото в конструкторе или освободите ячейку крестиком.');
      } else selectSlot(empty, true);
    },
    busy: () => restoring || state.generating || savingCart,
    onChange() { if (state.product === 'garland') setProduct('garland'); }
  });
  $('#garland-pick').addEventListener('click', garland.open);
  $('.builder').inert = true;
  initialize();
})();
