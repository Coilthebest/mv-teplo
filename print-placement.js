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
