const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'movie.html', 'tvshow.html', 'saved.html', 'passcode.html', 'offline.html', 'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'sw.js', 'scripts', 'stylesheets']) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
// Generate deterministic PNG brand icons without a runtime image dependency.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const value of buffer) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
fs.mkdirSync(path.join(output, 'icons'), { recursive: true });
for (const size of [192, 512]) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = x / size, py = y / size;
    const mark = (px >= .35 && px <= .44 && py >= .28 && py <= .72) || (px >= .35 && px <= .65 && py >= .28 && py <= .37) || (px >= .35 && px <= .60 && py >= .46 && py <= .55);
    const i = y * (size * 4 + 1) + 1 + x * 4;
    raw.set(mark ? [255, 255, 255, 255] : [203, 15, 51, 255], i);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(output, 'icons', `icon-${size}.png`), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
console.log('Built public website and app icons.');
