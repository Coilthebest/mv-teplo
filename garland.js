'use strict';

window.setupGarland = ({ stories, upload, busy, onChange }) => {
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
  let applied = [];
  let appliedPosters = [];
  let mainFormat = '5';
  let loadingMain = false;
  let mainVersion = 0;
  let previewVersion = 0;
  const previewUrls = [];

  function clearPreviews() {
    for (const url of previewUrls.splice(0)) URL.revokeObjectURL(url);
  }

  async function composePosters(chosen) {
    await TeploMockups.ready;
    return Promise.all(chosen.map(async art => {
      try {
        const image = await TeploIllustration.loadImage(art.preview);
        const composed = TeploIllustration.compose(image, art.caption, art.year, art.yearLines);
        const copy = document.createElement('canvas'); copy.width = 360; copy.height = 480;
        copy.getContext('2d').drawImage(composed, 0, 0, copy.width, copy.height);
        return copy;
      } catch { return null; }
    }));
  }

  function examples(count) {
    const examples = TeploMockups.examples();
    return Array.from({length:count}, (_,i) => examples[i % examples.length]);
  }

  async function drawGarlandPreview() {
    const version = ++previewVersion;
    const target = $('garland-preview-canvas');
    const count = Number(format);
    const chosen = selected.map(id => available.get(id)).filter(Boolean);
    target.height = count === 10 ? 770 : 400;
    $('garland-preview-label').textContent = chosen.length ? `Предпросмотр: ${chosen.length} из ${count} ваших иллюстраций` : 'Пример оформления гирлянды';
    await TeploMockups.ready;
    const posters = chosen.length ? await composePosters(chosen) : examples(count);
    if (version === previewVersion) TeploMockups.paintGarland(target, posters, count);
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
    submit.textContent = 'Применить выбор';
    status.textContent = available.size ? 'Выбрано ' + selected.length + ' из ' + format : 'Загрузите фото и дождитесь готовых иллюстраций.';
    void drawGarlandPreview();
  }

  function open() {
    if (busy() || dialog.open) return;
    if (!returningFromUpload) {
      format = mainFormat;
      selected = applied.map(art => art.objectId);
    }
    returningFromUpload = false;
    available = new Map();
    stories().forEach((story, index) => {
      if (!story?.sealedArtwork?.objectId || !(story.generatedFile instanceof Blob)) return;
      const { caption, year, yearLines, sealedArtwork: { objectId } } = story;
      available.set(objectId, { objectId, caption, year, yearLines, slot: index + 1, preview: story.generatedFile });
    });
    // Preserve an edited set's original files and captions even if its drafts were removed.
    (editItem?.artworks || []).forEach(art => { if (!available.has(art.objectId)) available.set(art.objectId, art); });
    applied.forEach(art => { if (!available.has(art.objectId)) available.set(art.objectId, art); });
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
  dialog.addEventListener('close', () => { previewVersion++; clearPreviews(); });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  $('garland-upload').addEventListener('click', () => {
    returningFromUpload = true;
    dialog.close();
    document.getElementById('constructor').scrollIntoView({ block: 'start' });
    upload();
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
      const posters = await composePosters(artworks);
      if (posters.some(poster => !poster)) throw Error('preview_failed');
      mainVersion++;
      mainFormat = format;
      applied = artworks;
      appliedPosters = posters;
      loadingMain = false;
      dialog.close();
      onChange();
    } catch {
      saving = false;
      draw();
      status.textContent = 'Не удалось подготовить гирлянду. Попробуйте ещё раз.';
    } finally {
      saving = false;
      formats.forEach(input => { input.disabled = false; });
      submit.disabled = false;
      $('garland-upload').disabled = false;
      $('garland-close').disabled = false;
    }
  });
  return {
    open,
    get format() { return mainFormat; },
    get count() { return applied.length; },
    get ready() { return !loadingMain && applied.length === Number(mainFormat) && appliedPosters.length === Number(mainFormat) && appliedPosters.every(Boolean); },
    setFormat(value) {
      if (!['5', '10'].includes(value) || value === mainFormat) return;
      mainFormat = value;
      applied = applied.slice(0, Number(value));
      appliedPosters = appliedPosters.slice(0, Number(value));
      returningFromUpload = false;
    },
    paint(target, thumbnail = false) {
      const count = thumbnail ? 5 : Number(mainFormat);
      TeploMockups.paintGarland(target, applied.length ? appliedPosters.slice(0,count) : examples(count), count);
    },
    item(qty, preview) {
      if (!this.ready) throw Error('invalid_item');
      return { product: 'garland', format: mainFormat, qty, artworks: [...applied], artworkKey: JSON.stringify(applied.map(art => art.artworkKey)), preview };
    },
    async edit(item) {
      const version = ++mainVersion;
      returningFromUpload = false;
      editItem = item;
      mainFormat = item.format;
      applied = [...item.artworks];
      appliedPosters = [];
      loadingMain = true;
      onChange();
      const posters = await composePosters(applied);
      if (version !== mainVersion) return;
      appliedPosters = posters.slice(0, applied.length);
      loadingMain = false;
      onChange();
    },
    clear() {
      mainVersion++; mainFormat = '5'; editItem = null; applied = []; appliedPosters = []; loadingMain = false; returningFromUpload = false;
    }
  };
};
