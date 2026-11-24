'use strict';

// The photographic shells are display assets. The actual print is still composed
// from the customer's illustration, caption, format and placement settings.
window.TeploMockups = (() => {
  const shells = {};
  const background = new Image();
  const sampleImages = ['couple-art.webp', 'lia-art.webp', 'balloon-art.webp', 'disneyland-family-art.webp', 'mountains-art.webp'].map(name => {
    const image = new Image();
    image.src = `assets/${name}`;
    return image;
  });
  const available = image => image && image.complete && image.naturalWidth > 0;
  // Measured printable rectangles, relative to the isolated product's outer bounds.
  const surfaces = {
    frame: { opening: [.068, .051, .864, .9], maxWidth: 650, maxHeight: 960 },
    magnet: { opening: [.025, .022, .95, .95], maxWidth: 470, maxHeight: 700 },
    keychain: { opening: [.067, .418, .86, .542], maxWidth: 440, maxHeight: 920 },
    sticker: { opening: [.027, .402, .944, .469], maxWidth: 360, maxHeight: 975 },
    tshirt: { maxWidth: 840, maxHeight: 940 },
    'garland-card': { opening: [.10, .231, .799, .665] },
  };
  function readImage(image, src) {
    if (src) image.src = src;
    return image.decode().catch(() => null);
  }
  const ready = Promise.all([
    readImage(background, 'assets/preview-travertine.webp'),
    ...Object.keys(surfaces).map(name => {
      const image = shells[name] = new Image();
      return readImage(image, `assets/mock-${name}.webp`);
    }),
    ...sampleImages.map(image => readImage(image)),
  ]);
  const examples = () => sampleImages.filter(available);
  const shadeCache = new Map();
  function shirtFor(color) {
    const source = shells.tshirt;
    if (color === 'white' || !teploShirtColors[color]) return source;
    if (shadeCache.has(color)) return shadeCache.get(color);
    const tinted = document.createElement('canvas');
    tinted.width = source.naturalWidth; tinted.height = source.naturalHeight;
    const ctx = tinted.getContext('2d');
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, tinted.width, tinted.height);
    const value = parseInt(teploShirtColors[color].hex.slice(1), 16);
    const rgb = [value >> 16 & 255, value >> 8 & 255, value & 255];
    for (let p = 0; p < pixels.data.length; p += 4) {
      for (let c = 0; c < 3; c++) pixels.data[p + c] = Math.min(255, pixels.data[p + c] * (rgb[c] / 255) + (255 - pixels.data[p + c]) * .05);
    }
    ctx.putImageData(pixels, 0, 0); shadeCache.set(color, tinted);
    return tinted;
  }
  function placeShell(g, image, x, y, w, h) {
    g.save();
    g.shadowColor = '#76532c40'; g.shadowBlur = 20; g.shadowOffsetX = 12; g.shadowOffsetY = 18;
    g.drawImage(image, x, y, w, h);
    g.restore();
  }
  function fit(w, h, maxw, maxh) {
    const scale = Math.min(maxw / w, maxh / h);
    return [w * scale, h * scale];
  }
  function printArea(g, view, item, x, y, w, h) {
    const [u, v, p, q] = surfaces[view].opening;
    const left = x + w * u, top = y + h * v, width = w * p, height = h * q;
    g.save();
    if (view === 'magnet' || view === 'garland-card') {
      g.beginPath(); roundedBox(g, left, top, width, height, Math.min(width, height) * (view === 'magnet' ? .105 : .05)); g.clip();
    } else if (view === 'sticker') {
      const curve = height * .023;
      g.beginPath(); g.moveTo(left, top+curve); g.quadraticCurveTo(left+width/2,top-curve,left+width,top+curve);
      g.lineTo(left+width,top+height-curve); g.quadraticCurveTo(left+width/2,top+height+curve,left,top+height-curve); g.closePath(); g.clip();
    }
    const painter = view === 'frame' ? paintTeploFramePrint : view === 'sticker' ? paintTeploSticker : paintTeploPaperPrint;
    painter(g, item.poster, left, top, width, height, item.printLayout);
    // Soft photographic sheen on the real material, with the illustration visible.
    if (view === 'magnet' || view === 'keychain' || view === 'sticker') {
      g.fillStyle = horizontalGradient(g, left, left + width, [[0,'#5a3b231f'],[.08,'#ffffff14'],[.25,'#ffffff00'],[.8,'#ffffff00'],[1,'#48301b20']]);
      g.fillRect(left, top, width, height);
    }
    g.restore();
  }
  function paint(target, view, item) {
    const shell = shells[view];
    if (view === 'paper' || view === 'digital') {
      const g = target.getContext('2d');
      g.clearRect(0, 0, target.width, target.height); g.save();
      g.scale(target.width / 900, target.height / 1080);
      const h = 900, w = view === 'paper' ? 600 : 675;
      g.shadowColor = '#76532c40'; g.shadowBlur = 18; g.shadowOffsetX = 10; g.shadowOffsetY = 14;
      g.fillStyle = '#f6e4cf'; g.fillRect((900-w)/2, 90, w, h);
      g.shadowColor = 'transparent';
      paintTeploPaperPrint(g, item.poster, (900-w)/2, 90, w, h, item.printLayout);
      g.restore(); return;
    }
    if (!available(shell)) return paintTeploProductPreview(target, view, item);
    const g = target.getContext('2d');
    g.clearRect(0, 0, target.width, target.height); g.save();
    g.scale(target.width / 900, target.height / 1080);
    const {maxWidth, maxHeight} = surfaces[view];
    let ratio = shell.naturalWidth / shell.naturalHeight;
    if (view === 'magnet') {
      const [, mw, mh] = (item.format || '').match(/(\d+)\s*×\s*(\d+)/) || ['', 6, 9];
      ratio = Number(mw) / Number(mh);
    }
    if (view === 'sticker') ratio = (2 / 3) * surfaces.sticker.opening[3] / surfaces.sticker.opening[2];
    if (view === 'keychain') {
      const insert = teploKeychainSize(item.format || 'Акриловый · 40 × 56 мм');
      ratio = insert.width / insert.height * surfaces.keychain.opening[3] / surfaces.keychain.opening[2];
    }
    const [w, h] = fit(ratio, 1, maxWidth, maxHeight);
    const x = (900 - w) / 2, y = (1080 - h) / 2;
    placeShell(g, view === 'tshirt' ? shirtFor(item.shirtColor || 'white') : shell, x, y, w, h);
    if (view === 'tshirt') {
      g.translate(x - w * 34 / 432, y - h * 51 / 474);
      g.scale(w / 432, h / 474);
      if (item.shirtPrint) paintTeploShirtPrint(g, item.shirtPrint, item);
    } else if (item.poster) printArea(g, view, item, x, y, w, h);
    g.restore();
  }
  function paintGarland(target, posters, count = 5) {
    const g = target.getContext('2d');
    g.clearRect(0, 0, target.width, target.height);
    const rows = count > 5 ? 2 : 1;
    const w = 1000, h = 385 * rows;
    // Fit within both thumbnail and larger, responsive garland dialog canvases.
    const scale = Math.min(target.width / w, target.height / h);
    g.save(); g.translate((target.width - w * scale)/2, (target.height - h * scale)/2); g.scale(scale, scale);
    const shell = shells['garland-card'];
    for (let row = 0; row < rows; row++) {
      const top = row * 385;
      const ropeY = x => top + 42 + 40 * (1 - ((x-500)/500)**2);
      g.beginPath(); g.moveTo(0, top+42); g.quadraticCurveTo(500,top+122,1000,top+42);
      g.strokeStyle='#ad885b'; g.lineWidth=5; g.stroke(); g.strokeStyle='#e6cba0'; g.lineWidth=1.4; g.stroke();
      for (let i = 0; i < 5; i++) {
        const center = 100 + i * 200, cardWidth = 172, cardHeight = 282;
        const image = posters[row * 5 + i];
        g.save(); g.translate(center, ropeY(center)); g.rotate((i-2)*-.038);
        const x = -cardWidth/2, y = -31;
        if (available(shell)) {
          placeShell(g,shell,x,y,cardWidth,cardHeight);
          if (image) printArea(g,'garland-card',{poster:image},x,y,cardWidth,cardHeight);
        } else {
          g.fillStyle='#fffdf7'; g.fillRect(x,0,cardWidth,244);
          if(image) paintTeploPaperPrint(g,image,x+10,10,cardWidth-20,224);
          g.fillStyle='#c6a475'; g.fillRect(-7,-26,14,40);
        }
        g.restore();
      }
    }
    g.restore();
  }
  function withBackground(target) {
    const out = document.createElement('canvas'); out.width = target.width; out.height = target.height;
    const g = out.getContext('2d');
    g.fillStyle='#f3e2ca';g.fillRect(0,0,out.width,out.height);
    if (available(background)) {
      const scale = Math.max(out.width/background.naturalWidth, out.height/background.naturalHeight);
      const w=background.naturalWidth*scale,h=background.naturalHeight*scale;
      g.drawImage(background,(out.width-w)/2,(out.height-h)/2,w,h);
    }
    g.drawImage(target,0,0); return out;
  }
  return { ready, paint, paintGarland, examples, withBackground };
})();
