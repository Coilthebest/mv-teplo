'use strict';
// Position a print in surface-relative coordinates. The product shell stays fixed.
let teploPaperTile;
function paperTexture(ctx) {
  if (!teploPaperTile) {
    teploPaperTile = document.createElement('canvas');
    teploPaperTile.width = teploPaperTile.height = 128;
    const g = teploPaperTile.getContext('2d');
    const grain = g.createImageData(128,128);
    let seed = 17;
    for (let i=0;i<grain.data.length;i+=4) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
      const shade = (seed >>> 28) - 7;
      grain.data.set([246+shade,228+shade,207+shade,255],i);
    }
    g.putImageData(grain,0,0);
  }
  return ctx.createPattern(teploPaperTile,'repeat');
}
function placeTeploPrint(ctx, left, top, width, height, layout, paint) {
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();
    ctx.fillStyle = paperTexture(ctx);
    ctx.fillRect(left, top, width, height);
    if (!layout || (layout.scale === 100 && !layout.x && !layout.y)) { paint(); return; }
    const cx = left + width / 2, cy = top + height / 2;
    ctx.translate(cx + width * layout.x / 400, cy + height * layout.y / 400);
    ctx.scale(layout.scale / 100, layout.scale / 100);
    ctx.translate(-cx, -cy);
    paint();
  } finally { ctx.restore(); }
}

function paintTeploFramePrint(ctx, poster, left, top, width, height, layout) {
  const crop = poster.height * 2 / 3;
  placeTeploPrint(ctx, left, top, width, height, layout, () => {
    ctx.drawImage(poster, (poster.width - crop) / 2, 0, crop, poster.height, left, top, width, height);
  });
}

const teploShirtColors = {
    white: { name: 'Белый', hex: '#fffdf8', ink: '#62351f' },
    yellow: { name: 'Жёлтый', hex: '#f4d23b', ink: '#52361f' },
    blue: { name: 'Синий', hex: '#283e9b', ink: '#fff9ed' },
    red: { name: 'Красный', hex: '#bd3d38', ink: '#fff9ed' },
    black: { name: 'Чёрный', hex: '#272b2e', ink: '#fff9ed' },
  };

const teploShirtPrintArea = {left:128, top:100, width:244, height:415};

function paintTeploContainedImage(ctx, image, left, top, width, height) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  ctx.drawImage(image, left + (width - w) / 2, top + (height - h) / 2, w, h);
}

function paintTeploPaperPrint(ctx, poster, left, top, width, height, layout) {
  placeTeploPrint(ctx, left, top, width, height, layout, () => {
    paintTeploContainedImage(ctx, poster, left, top, width, height);
  });
}

function paintTeploSticker(ctx, poster, left, top, width, height, layout) {
  placeTeploPrint(ctx, left, top, width, height, layout, () => {
    ctx.drawImage(poster, left, top, width, height);
  });
}

function teploKeychainSize(format) {
  return {width: format?.includes('40 × 56') ? 576 * 40 / 56 - 26 : 410, height:547};
}

function paintTeploShirtLabel(ctx, title, year, ink, yearLines) {
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
    if (yearLines) {
      ctx.fillStyle = ink;
      ctx.fillRect(216, y - 3, 12, .7);
      ctx.fillRect(272, y - 3, 12, .7);
    }
  }
}


function paintTeploShirtPrint(ctx, image, item) {
  const color = teploShirtColors[item.shirtColor] || teploShirtColors.white;
  const {left, top, width, height} = teploShirtPrintArea;
  const {scale, x, y} = item.printLayout || {scale:100, x:0, y:0};
  const factor = scale / 100;
  const imageWidth = image.naturalWidth || image.width || 210;
  const imageHeight = image.naturalHeight || image.height || 185;
  const halfPrint = Math.min(210, 185 * imageWidth / imageHeight) * factor / 2;
  const horizontalRoom = factor <= 1.12 ? 120 - 105 * factor : Math.max(2.4, (120 - halfPrint) * (factor - 1.12) / .38);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.translate(250 + x / 100 * horizontalRoom, 305 + y / 100 * (190 - 120 * factor));
  ctx.scale(factor, factor);
  ctx.translate(-250, -305);
  if (image.naturalWidth || image.width) paintTeploContainedImage(ctx, image, 145, 190, 210, 185);
  paintTeploShirtLabel(ctx, item.caption || '', item.year || '', color.ink, item.yearLines !== false);
  ctx.restore();
}
