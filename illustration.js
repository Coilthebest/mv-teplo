let state = {
  file: null,
  dataUrl: '',
  preview: '',
  sealed: null,
  busy: false,
  timer: null,
  status: null,
};

async function config() {
  try { const r = await fetch('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m/api/illustrations/config', { cache: 'no-store' }); if (!r.ok) throw new Error(); return await r.json(); }
  catch { return { ready: false, unavailable: true }; }
}

async function call(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Создание иллюстрации временно недоступно.');
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function generate(image) {
  return call('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m/api/illustrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image }) });
}
function poll(id) {
  return call('https://functions.yandexcloud.net/d4e6gbqek4evf54etp5m/api/illustrations?job=' + encodeURIComponent(id));
}

function showStatus(text, isError = false) {
  const box = document.getElementById('illustration-status') || document.querySelector('[data-illustration-status]');
  if (!box) return;
  box.textContent = text;
  box.hidden = !text;
  box.dataset.state = isError ? 'error' : 'info';
}

function setBusy(flag) {
  state.busy = flag;
  const btn = document.getElementById('generate-btn') || document.querySelector('[data-generate-illustration]');
  if (btn) btn.disabled = flag;
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Неверный формат изображения.'));
      img.onload = () => {
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function waitJob(job, delay = 5) {
  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    try {
      const res = await poll(job);
      if (res.status === 'completed' && res.image) {
        state.preview = res.image;
        state.sealed = res.sealedArtwork || null;
        window.dispatchEvent(new CustomEvent('teplo:illustration-ready', { detail: res }));
        showStatus('');
        setBusy(false);
        return;
      }
      waitJob(job, res.retryAfter || 5);
    } catch (err) {
      showStatus(err.message || 'Ошибка при получении иллюстрации.', true);
      setBusy(false);
    }
  }, delay * 1000);
}

async function runGeneration() {
  if (state.busy || !state.dataUrl) return;
  setBusy(true);
  showStatus('Рисуем вашу иллюстрацию…');
  try {
    const res = await generate(state.dataUrl);
    if (res.status === 'completed' && res.image) {
      state.preview = res.image;
      state.sealed = res.sealedArtwork || null;
      window.dispatchEvent(new CustomEvent('teplo:illustration-ready', { detail: res }));
      showStatus('');
      setBusy(false);
    } else if (res.status === 'processing' && res.job) {
      waitJob(res.job, res.retryAfter || 5);
    } else {
      throw new Error('Не удалось запустить обработку.');
    }
  } catch (err) {
    showStatus(err.message || 'Соединение прервалось. Новую обработку автоматически не запускаем.', true);
    setBusy(false);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const cfg = await config();
  if (!cfg.ready) {
    showStatus('Создание иллюстраций временно недоступно. Попробуйте позже.', true);
    return;
  }
  const input = document.getElementById('photo-upload') || document.querySelector('input[type="file"]');
  if (input) {
    input.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        state.file = file;
        state.dataUrl = await compressImage(file);
        showStatus('');
      } catch (err) {
        showStatus(err.message, true);
      }
    });
  }
  const btn = document.getElementById('generate-btn') || document.querySelector('[data-generate-illustration]');
  if (btn) {
    btn.addEventListener('click', runGeneration);
  }
});
