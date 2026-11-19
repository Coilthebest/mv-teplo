'use strict';
function markTeploPreview(data, width, height, channels, stride, offset) {
  const maskWidth = 144, maskHeight = 48;
  const encoded = atob('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');
  const mask = new Uint8Array(maskWidth * maskHeight);
  for (let i = 0; i < encoded.length; i += 3) {
    const index = encoded.charCodeAt(i) * 256 + encoded.charCodeAt(i + 1);
    mask[index] = encoded.charCodeAt(i + 2);
  }
  const scale = width / 440;
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y / scale + 20) / 108);
    const my = Math.floor((y / scale + 20) % 108);
    if (my >= maskHeight) continue;
    for (let x = 0; x < width; x++) {
      const mx = Math.floor((x / scale + (row % 2 ? 84 : 6)) % 184);
      if (mx >= maskWidth || !mask[my * maskWidth + mx]) continue;
      const p = offset + y * stride + x * channels;
      const alpha = mask[my * maskWidth + mx] / 255 * .24;
      const tone = data[p] * .30 + data[p+1] * .59 + data[p+2] * .11 > 145 ? 73 : 247;
      for (let c = 0; c < 3; c++) data[p+c] += Math.round((tone - data[p+c]) * alpha);
    }
  }
}
if (typeof module !== 'undefined') module.exports = markTeploPreview;
