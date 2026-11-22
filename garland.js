'use strict';

window.setupGarland = ({ stories, upload, busy }) => {
  const $ = id => document.getElementById(id);
  const dialog = $('garland-dialog');
  const list = $('garland-stories');
  const submit = $('garland-submit');
  const status = $('garland-status');
  const formats = [...dialog.querySelectorAll('input[name="garland-format"]')];

  let available = new Map();
  let selected = [];
  let editItem = null;
  let format = '5';
  let saving = false;
  let returningFromUpload = false;
  const previewUrls = [];

  function clearPreviews() {
    for (const url of previewUrls.splice(0)) URL.revokeObjectURL(url);
  }

  function draw(focusId) {
    clearPreviews();
    list.replaceChildren();
    for (const [id, story] of available) {
      const position = selected.indexOf(id);
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = position >= 0;
      input.disabled = saving || (position < 0 && selected.length >= Number(format));

      const image = new Image();
      const url = URL.createObjectURL(story.preview);
      previewUrls.push(url);
      image.src = url;
      image.alt = '';

      const title = document.createElement('span');
      title.textContent = [story.caption || 'Иллюстрация ' + story.slot, story.year].filter(Boolean).join(' · ');
      label.append(input, image, title);
      if (position >= 0) {
        const order = document.createElement('b');
        order.className = 'garland-order';
        order.textContent = position + 1;
        order.setAttribute('aria-label', 'Позиция ' + (position + 1));
        label.append(order);
      }
      input.addEventListener('change', () => {
        selected = input.checked ? [...selected, id] : selected.filter(key => key !== id);
        draw(id);
      });
      list.append(label);
      if (focusId === id) input.focus({ preventScroll: true });
    }
    formats.forEach(input => { input.checked = input.value === format; input.disabled = saving; });
    $('garland-upload').disabled = saving;
    $('garland-close').disabled = saving;
    submit.disabled = saving || selected.length !== Number(format);
    submit.textContent = editItem ? 'Обновить в корзине' : 'Добавить в корзину';
    status.textContent = available.size ? 'Выбрано ' + selected.length + ' из ' + format : 'Загрузите фото и дождитесь готовых иллюстраций.';
  }

  function open(item = null) {
    if (busy() || dialog.open) return;
    if (item || !returningFromUpload) {
      editItem = item;
      format = item?.format || '5';
      selected = item?.artworks.map(art => art.objectId) || [];
    }
    returningFromUpload = false;
    available = new Map();
    stories().forEach((story, index) => {
      if (!story?.sealedArtwork?.objectId || !(story.generatedFile instanceof Blob)) return;
      const { caption, year, yearLines, sealedArtwork: { objectId } } = story;
      available.set(objectId, { objectId, caption, year, yearLines, slot: index + 1, preview: story.generatedFile });
    });
    // Preserve an edited set's original files and captions even if its drafts were removed.
    (editItem?.artworks || []).forEach(art => available.set(art.objectId, art));
    selected = selected.filter(id => available.has(id));
    draw();
    dialog.showModal();
  }

  formats.forEach(input => input.addEventListener('change', () => {
    format = input.value;
    selected = selected.slice(0, Number(format));
    draw();
  }));
  $('garland-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', clearPreviews);
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('garland-upload').addEventListener('click', () => {
    returningFromUpload = true;
    dialog.close();
    document.getElementById('constructor').scrollIntoView({ block: 'start' });
    upload();
  });
  document.querySelectorAll('[data-open-garland]').forEach(button => button.addEventListener('click', event => {
    event.preventDefault();
    open();
  }));
  document.addEventListener('teplo:edit-cart', event => {
    if (event.detail.item.product === 'garland') open(event.detail.item);
  });
  submit.addEventListener('click', async () => {
    if (saving || selected.length !== Number(format)) return;
    saving = true;
    draw();
    try {
      const artworks = selected.map(id => {
        const art = available.get(id);
        return { ...art, artworkKey: JSON.stringify([id, art.caption || '', art.year || '', art.yearLines !== false]) };
      });
      const artworkKey = JSON.stringify(artworks.map(art => art.artworkKey));
      await TeploCart.add({ product: 'garland', format, qty: editItem?.qty || 1, artworks, artworkKey, preview: artworks[0].preview }, editItem?.id);
      dialog.close();
      TeploCart.open();
    } catch {
      saving = false;
      draw();
      status.textContent = 'Не удалось сохранить гирлянду. Проверьте корзину и попробуйте ещё раз.';
    } finally {
      saving = false;
      formats.forEach(input => { input.disabled = false; });
      submit.disabled = false;
      $('garland-upload').disabled = false;
      $('garland-close').disabled = false;
    }
  });
};
