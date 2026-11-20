'use strict';
// Position a print in surface-relative coordinates. The product shell stays fixed.
function placeTeploPrint(ctx, left, top, width, height, layout, paint) {
  if (!layout || (layout.scale === 100 && !layout.x && !layout.y)) {
    paint();
    return;
  }
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();
    ctx.fillStyle = '#f3e6d7';
    ctx.fillRect(left, top, width, height);
    const cx = left + width / 2, cy = top + height / 2;
    ctx.translate(cx + width * layout.x / 400, cy + height * layout.y / 400);
    ctx.scale(layout.scale / 100, layout.scale / 100);
    ctx.translate(-cx, -cy);
    paint();
  } finally { ctx.restore(); }
}
