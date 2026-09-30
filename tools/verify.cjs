const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

async function run() {
  for (const file of ['index', 'movie', 'tvshow', 'saved', 'passcode']) {
    const html = fs.readFileSync(path.join(publicDir, `${file}.html`), 'utf8');
    for (const marker of ['name="description"', 'rel="canonical"', 'rel="manifest"', 'name="viewport"', 'id="main-content"']) assert.ok(html.includes(marker), `${file}: ${marker}`);
    assert.equal((html.match(/<main\b/g) || []).length, 1, `${file}: one main landmark`);
    assert.equal((html.match(/<\/main>/g) || []).length, 1, `${file}: closed main landmark`);
    assert.ok(!html.split('</head>')[0].includes('</main>'));
    for (const [, asset] of html.matchAll(/(?:src|href)="((?:scripts|stylesheets)\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(publicDir, asset)), asset);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest')));
  for (const icon of manifest.icons) {
    const bytes = fs.readFileSync(path.join(publicDir, icon.src));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
  }
  for (const file of ['server.js', '.env', '.git', 'tools', 'api']) assert.ok(!fs.existsSync(path.join(publicDir, file)), `Private file excluded: ${file}`);
  const context = vm.createContext({ URL, URLSearchParams, AbortSignal, location: {search:'?id=238'}, localStorage: {getItem:()=>'{"id":999}'}, document:{getElementById:()=>null}, window:{addEventListener:()=>{}}, navigator:{}, fetch:async url => ({ok:true,json:async()=>({id:238,title:'Test movie'})}) });
  const source = fs.readFileSync(path.join(root, 'scripts/site.js'), 'utf8').replaceAll('export ', '');
  vm.runInContext(source, context);
  assert.equal(vm.runInContext("detailUrl('tv', 1399)", context), 'tvshow.html?id=1399');
  assert.equal((await vm.runInContext("selectedTitle('movie')", context)).id, 238, 'URL wins over storage');
  context.location.search = '?id=bad';
  assert.equal(await vm.runInContext("selectedTitle('movie')", context), null);
  context.location.search = '';
  assert.equal((await vm.runInContext("selectedTitle('movie')", context)).id, 999, 'Legacy links still work');
  const base = process.env.TEST_URL || 'http://127.0.0.1:3102';
  for (const asset of ['/', '/movie.html?id=238', '/tvshow.html?id=1399', '/saved.html', '/passcode.html', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png', '/icons/icon-512.png']) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    if (asset === '/sw.js') assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  for (const asset of ['/server.js', '/.env', '/.git/config', '/tools/build.cjs']) assert.equal((await fetch(base + asset)).status, 404, asset);
  assert.equal((await fetch(base + '/', {method:'POST'})).status, 405);
  console.log('PASS: page metadata, landmarks, asset links, PNG icons, URL-based title loading, legacy links, public file isolation, HTTP routes and cache policy.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
