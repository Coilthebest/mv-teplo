'use strict';

(() => {
  const stage = document.querySelector('.memory-theatre');
  const track = document.querySelector('.memory-cards');
  const template = track?.querySelector('.hanging-memory')?.cloneNode(true);
  const toggle = document.querySelector('#motion-toggle');
  const previous = document.querySelector('#memory-prev');
  const next = document.querySelector('#memory-next');
  if (!stage || !track || !template || !toggle || !previous || !next) return;

  const stories = window.TEPLO_MEMORIES.filter((memory) => memory.key !== 'matchday-minimal');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = matchMedia('(max-width:900px)');
  const phone = matchMedia('(max-width:680px)');
  const modeButtons = [...document.querySelectorAll('[data-memory-mode]')];
  const wire = stage.querySelector('.garland-wire');
  const wirePath = wire.querySelector('path');
  const pagination = document.querySelector('.memory-pagination');
  const pageDots = stories.map(() => document.createElement('span'));
  pagination?.replaceChildren(...pageDots);
  const imageCache = new Map();
  const duration = 14000;
  const slideDuration = 1150;
  const tilts = [-5, 3, -2, 4, -3, 2, -4, 3, -2, 4];
  let cards = [];
  let offset = phone.matches ? 2 : 0;
  let layout;
  let elapsed = media.matches ? 6000 : 0;
  let cycle = 0;
  let previousTime = null;
  let frame = null;
  let inView = false;
  let userPaused = media.matches;
  let lastMode = '';
  let movement = null;
  let loading = false;

  const wrap = (index) => (index % stories.length + stories.length) % stories.length;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

  function revealAt(time) {
    if (time < 2500) return 0;
    if (time < 4800) return smooth((time - 2500) / 2300);
    if (time < 8500) return 1;
    if (time < 10800) return 1 - smooth((time - 8500) / 2300);
    return 0;
  }

  function updateMode(mode) {
    if (lastMode === mode) return;
    lastMode = mode;
    stage.dataset.mode = mode;
    const labels = { photo: 'Обычная фотография', art: 'Иллюстрация Teplo', transition: 'Проявляется ваша история' };
    document.querySelector('#motion-status').textContent = labels[mode];
    modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.memoryMode === mode)));
  }

  function paint(time) {
    const values = cards.map((card) => {
      const slot = Math.max(0, Math.min(layout.count - 1, Number(card.dataset.slot)));
      const value = revealAt(Math.max(0, time - slot * 320));
      card.style.setProperty('--reveal', value);
      card.classList.toggle('is-revealing', value > 0.005 && value < 0.995);
      return value;
    });
    updateMode(values.every((value) => value > 0.995) ? 'art' : values.every((value) => value < 0.005) ? 'photo' : 'transition');
    stage.dataset.cycle = String(cycle);
  }

  function syncControls() {
    toggle.setAttribute('aria-label', userPaused ? 'Включить анимацию' : 'Приостановить анимацию');
    toggle.setAttribute('aria-pressed', String(!userPaused));
    toggle.querySelector('span').textContent = userPaused ? 'Смотреть' : 'Пауза';
    stage.classList.toggle('is-paused', userPaused);
    previous.disabled = next.disabled = loading || Boolean(movement);
    stage.setAttribute('aria-busy', String(loading || Boolean(movement)));
    const current = wrap(offset + (layout?.phone ? 1 : 0));
    pagination?.setAttribute('aria-label', `Воспоминание ${current + 1} из ${stories.length}`);
    pageDots.forEach((dot, index) => {
      dot.classList.toggle('is-current', index === current);
      dot.classList.toggle('is-near', index === current || index === wrap(current - 1) || index === wrap(current + 1));
      dot.style.order = String(index === current ? 1 : index === wrap(current - 1) ? 0 : 2);
    });
  }

  function decodeImage(src) {
    if (!imageCache.has(src)) {
      const image = new Image();
      image.src = src;
      imageCache.set(src, image.decode().then(() => true, () => { imageCache.delete(src); return false; }));
    }
    return imageCache.get(src);
  }

  function createCard(memoryIndex, slot) {
    const memory = stories[wrap(memoryIndex)];
    const card = template.cloneNode(true);
    card.removeAttribute('style');
    card.classList.remove('is-revealing');
    card.dataset.memory = memory.key;
    card.dataset.storyIndex = String(wrap(memoryIndex));
    card.dataset.slot = String(slot);
    card.querySelector('.memory-photo').src = memory.original;
    card.querySelector('.memory-photo').alt = `Исходное фото: ${memory.description}`;
    card.querySelector('.memory-art').src = memory.src;
    card.querySelector('.memory-art').alt = `Иллюстрация Teplo: ${memory.description}`;
    card.querySelector('.memory-caption-title').textContent = memory.label;
    card.querySelector('.memory-caption-year').textContent = memory.year;
    card.style.setProperty('--memory-photo-position', memory.key === 'balloon' ? '50% 72%' : memory.key === 'disneyland' ? '50% 35%' : '50% 50%');
    return card;
  }

  // Every card rotates around this point, which lies exactly on the rope.
  function wireY(x) {
    const u = (x + 40) / (layout.width + 80);
    return layout.edgeY + 4 * layout.sag * u * (1 - u);
  }

  function placeCards(shift = 0, swing = 0, time = 0) {
    cards.forEach((card) => {
      const slot = Number(card.dataset.slot) + shift;
      const left = slot * layout.step;
      const center = layout.start + left + layout.cardWidth / 2;
      const seed = Number(card.dataset.storyIndex);
      const idle = !movement && !userPaused && !media.matches ? Math.sin(time / 1500 + seed * 0.9) * 0.6 : 0;
      const distance = Math.min(1, Math.abs(slot - 1));
      const tilt = layout.phone ? -Math.max(-1, Math.min(1, slot - 1)) * 12 + tilts[seed % tilts.length] * 0.08 : tilts[seed % tilts.length];
      const scale = layout.phone ? 1 - distance * 0.18 : 1;
      const angle = tilt + swing * (layout.phone ? 0.55 : 0.84 + (seed % 3) * 0.08) + idle * (layout.phone ? 0.3 : 1);
      card.style.left = `${left}px`;
      card.style.top = `${wireY(center) + 6}px`;
      card.style.transform = `rotate(${angle}deg) scale(${scale})`;
      card.style.zIndex = layout.phone ? String(10 - Math.round(distance * 3)) : '';
      card.dataset.anchorX = String(center);
      card.dataset.anchorY = String(wireY(center));
    });
  }

  function measure() {
    const width = stage.clientWidth;
    const count = smallScreen.matches ? 3 : 4;
    const trackWidth = track.clientWidth;
    const gap = phone.matches ? 20 : parseFloat(getComputedStyle(track).columnGap) || 14;
    const cardWidth = phone.matches ? Math.min(width * 0.54, 280) : (trackWidth - gap * (count - 1)) / count;
    const step = phone.matches ? width * 0.4 : cardWidth + gap;
    const start = phone.matches ? (width - cardWidth) / 2 - step : (width - trackWidth) / 2;
    layout = { width, count, cardWidth, step, start, phone: phone.matches, edgeY: phone.matches ? 8 : 25, sag: phone.matches ? Math.min(width * 0.105, 62) : 32 };
    track.style.left = phone.matches ? `${start}px` : '';
    cards.forEach((card) => { card.style.width = `${cardWidth}px`; });
    const cardHeight = Math.max(...cards.map((card) => card.offsetHeight));
    const height = Math.ceil(cardHeight + layout.edgeY + layout.sag + 6 + (phone.matches ? 22 : 45));
    stage.style.height = `${height}px`;
    wire.setAttribute('viewBox', `0 0 ${width} ${height}`);
    wirePath.setAttribute('d', `M -40 ${layout.edgeY} Q ${width / 2} ${layout.edgeY + 2 * layout.sag} ${width + 40} ${layout.edgeY}`);
    placeCards();
    paint(elapsed);
    syncControls();
  }

  function rebuild() {
    const count = smallScreen.matches ? 3 : 4;
    cards = Array.from({ length: count }, (_, slot) => createCard(offset + slot, slot));
    track.replaceChildren(...cards);
    measure();
  }

  function active() {
    return !document.hidden && !loading && (Boolean(movement) || (inView && !userPaused));
  }

  function reconcile() {
    previousTime = null;
    if (frame !== null) clearTimeout(frame);
    stage.dataset.running = String(active());
    frame = active() ? setTimeout(tick, 0) : null;
  }

  function finishMove() {
    if (!movement) return;
    const finished = movement;
    finished.outgoing.remove();
    cards = cards.filter((card) => card !== finished.outgoing);
    offset = wrap(offset + finished.direction);
    cards.forEach((card) => {
      card.dataset.slot = String(Number(card.dataset.slot) - finished.direction);
      card.style.opacity = '1';
    });
    cards.sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot));
    cards.forEach((card) => track.append(card));
    movement = null;
    stage.classList.remove('is-sliding');
    measure();
    syncControls();
    stage.dataset.running = String(active());
    if (!finished.automatic) document.querySelector('#memory-announcement').textContent = `На нитке: ${cards.map((card) => card.querySelector('.memory-caption-title').textContent).join(', ')}.`;
  }

  async function navigate(direction, automatic = false) {
    if (loading || movement) return;
    direction = direction < 0 ? -1 : 1;
    loading = true;
    syncControls();
    reconcile();
    const requestedCount = layout.count;
    const incomingIndex = direction > 0 ? offset + requestedCount : offset - 1;
    const memory = stories[wrap(incomingIndex)];
    const decoded = await Promise.all([decodeImage(memory.original), decodeImage(memory.src)]);
    loading = false;
    if (requestedCount !== layout.count) { syncControls(); void navigate(direction, automatic); return; }
    if (decoded.some((ok) => !ok)) { syncControls(); reconcile(); return; }
    const incoming = createCard(incomingIndex, direction > 0 ? layout.count : -1);
    incoming.style.width = `${layout.cardWidth}px`;
    incoming.style.opacity = '0';
    const outgoing = direction > 0 ? cards[0] : cards[cards.length - 1];
    cards.push(incoming);
    track.append(incoming);
    movement = { direction, incoming, outgoing, start: performance.now(), automatic };
    stage.classList.add('is-sliding');
    placeCards();
    paint(elapsed);
    syncControls();
    if (media.matches) { finishMove(); reconcile(); return; }
    reconcile();
  }

  function animateMove(time) {
    const p = clamp((time - movement.start) / slideDuration);
    const travel = smooth(p / 0.72);
    const settling = clamp((p - 0.72) / 0.28);
    const swing = movement.direction * (-7 * Math.sin(Math.PI * Math.min(p / 0.72, 1)) + (p > 0.72 ? 2.8 * Math.sin(settling * Math.PI * 2) * (1 - settling) : 0));
    placeCards(-movement.direction * travel, swing, time);
    movement.incoming.style.opacity = String(smooth(travel / 0.55));
    movement.outgoing.style.opacity = String(1 - smooth((travel - 0.45) / 0.55));
    if (p >= 1) finishMove();
  }

  function tick() {
    const time = performance.now();
    frame = null;
    if (!active()) return;
    if (movement) animateMove(time);
    else {
      if (previousTime !== null) elapsed += Math.max(0, time - previousTime);
      if (elapsed >= duration) {
        elapsed = 0;
        cycle++;
        paint(elapsed);
        void navigate(1, true);
      } else { paint(elapsed); placeCards(0, 0, time); }
    }
    previousTime = time;
    if (active() && frame === null) frame = setTimeout(tick, movement ? 16 : 32);
  }

  previous.addEventListener('click', () => { void navigate(-1); });
  next.addEventListener('click', () => { void navigate(1); });
  let swipeStart = null;
  stage.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    swipeStart = event.touches.length === 1 && !event.target.closest('button, a')
      ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  stage.addEventListener('touchcancel', () => { swipeStart = null; });
  stage.addEventListener('touchend', (event) => {
    if (!swipeStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipeStart.x;
    const dy = touch.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(dx) >= 35 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      void navigate(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
  stage.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    void navigate(event.key === 'ArrowRight' ? 1 : -1);
  });
  toggle.addEventListener('click', () => { userPaused = !userPaused; syncControls(); reconcile(); });
  modeButtons.forEach((button) => button.addEventListener('click', () => {
    userPaused = true;
    elapsed = button.dataset.memoryMode === 'art' ? 6000 : 0;
    paint(elapsed);
    syncControls();
    reconcile();
  }));
  media.addEventListener('change', () => {
    userPaused = media.matches;
    if (movement && media.matches) finishMove();
    if (media.matches) elapsed = 6000;
    paint(elapsed);
    syncControls();
    reconcile();
  });
  document.addEventListener('visibilitychange', reconcile);
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; reconcile(); }, { threshold: 0.08 }).observe(stage);
  new ResizeObserver(() => {
    if (!layout || (stage.clientWidth === layout.width && layout.count === (smallScreen.matches ? 3 : 4) && layout.phone === phone.matches)) return;
    if (movement) finishMove();
    rebuild();
    reconcile();
  }).observe(stage);

  stage.classList.add('is-carousel');
  rebuild();
  syncControls();
  // Keep the next photograph and its illustration ready before they enter.
  stories.forEach((memory) => { void decodeImage(memory.original); void decodeImage(memory.src); });
})();
