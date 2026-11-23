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

function teploFabricTint(hex, target, amount) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${[16, 8, 0].map((shift) => Math.round(((n >> shift) & 255) * (1 - amount) + target * amount)).join(',')})`;
}

function paintTeploCotton(ctx, hex) {
  const outline = new Path2D('M187 51 Q156 58 119 74 Q108 80 99 95 L38 175 Q34 181 40 185 L94 217 Q99 219 103 214 L128 181 Q132 237 128 328 L121 504 Q121 518 133 521 Q247 537 367 521 Q380 518 379 504 L372 328 Q368 236 372 181 L397 214 Q401 220 407 217 L460 185 Q467 181 461 175 L401 95 Q391 79 381 74 Q342 58 313 51 Q250 72 187 51 Z');
  ctx.save();
  const fabric = ctx.createLinearGradient(45, 98, 455, 162);
  for (const [at, target, strength] of [[0,0,.11],[.15,255,.04],[.22,0,.07],[.34,255,.05],[.6,255,.02],[.77,0,.055],[.85,255,.035],[1,0,.12]]) {
    fabric.addColorStop(at, teploFabricTint(hex, target, strength));
  }
  ctx.shadowColor = 'rgba(72, 48, 30, .20)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = fabric;
  ctx.fill(outline);
  ctx.restore();
  const neck = new Path2D('M187 51 Q250 67 313 51 C306 75 284 94 250 95 C217 95 194 77 187 51Z');
  const rib = ctx.createLinearGradient(250, 52, 250, 95);
  rib.addColorStop(0, teploFabricTint(hex, 0, .21));
  rib.addColorStop(.72, teploFabricTint(hex, 0, .09));
  rib.addColorStop(1, hex);
  ctx.fillStyle = rib;
  ctx.fill(neck);
}

function paintTeploShirtPreview(ctx, image, item) {
  const color = teploShirtColors[item.shirtColor] || teploShirtColors.white;
  ctx.translate(0, 12);
  ctx.scale(1.8, 1.8);
  paintTeploCotton(ctx, color.hex);
  paintTeploShirtPrint(ctx, image, item);
}

function horizontalGradient(context, left, right, colors) {
  const gradient = context.createLinearGradient(left, 0, right, 0);
  colors.forEach(([at, color]) => gradient.addColorStop(at, color));
  return gradient;
}

function roundedBox(g,x,y,w,h,r){
  g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);
  g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();
}
function paintTeploProductPreview(target, view, item) {
  const g = target.getContext('2d');
  const {poster, printLayout} = item;
  g.save();
  g.scale(target.width / 900, target.height / 1080);
  g.clearRect(0, 0, 900, 1080);
  if (view === 'tshirt') {
    paintTeploShirtPreview(g, item.shirtPrint, item);
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
    paintTeploSticker(g, poster, 65, 218, 110, 165, printLayout);
    g.fillStyle = horizontalGradient(g,65,175,[[0,'#40281030'],[.3,'#ffffff05'],[.75,'#ffffff00'],[1,'#40281026']]);
    g.fillRect(65,218,110,165);
  } else if (view === 'keychain') {
    g.translate(450,550);
    const insert = teploKeychainSize(item.format);
    const bodyWidth = insert.width + 26;
    g.fillStyle = '#bb976b'; g.beginPath(); roundedBox(g,-bodyWidth/2,-202,bodyWidth,576,21); g.fill();
    const inner = insert.width;
    g.fillStyle = '#f7e8d4';
    g.fillRect(-inner/2,-189,inner,547);
    paintTeploPaperPrint(g, poster, -inner/2, -189, inner, insert.height, printLayout);
    g.strokeStyle = '#93948c'; g.lineWidth = 15;
    g.beginPath(); g.arc(0,-345,97,0,2*Math.PI); g.stroke();
    g.strokeStyle = '#d4d4c9'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#705b45'; g.beginPath(); g.arc(0,-174,12,0,2*Math.PI); g.fill();
    g.strokeStyle = '#a8a89e'; g.lineWidth = 9; g.beginPath(); roundedBox(g,-9,-251,18,80,9); g.stroke();
  } else {
    g.translate(450,540);
    g.fillStyle = horizontalGradient(g,-320,320,[[0,'#bc966d'],[.26,'#ddbf96'],[.72,'#b9946e'],[1,'#d7b78d']]);
    g.fillRect(-323,-478,646,956);
    // Fill the entire 10 × 15 opening with a centred print crop.
    paintTeploFramePrint(g, poster, -310, -465, 620, 930, printLayout);
  }
  g.restore();
}
