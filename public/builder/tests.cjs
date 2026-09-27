const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const V = require('./validation.js');
const Z = require('./zip.js');
const { server, allowedFile } = require('./serve.cjs');

const root = path.resolve(__dirname, '../..');
const original = Object.fromEntries(Object.entries(V.editableFiles).map(([key, name]) => [key, JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))]));
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'src/data/metadata.json'), 'utf8'));
const counts = Object.fromEntries(metadata.map(item => [item.number, item.verses_count]));
const assets = new Set(fs.readdirSync(path.join(root, 'public/discovery-images')).map(name => `public/discovery-images/${name}`));
const clone = value => JSON.parse(JSON.stringify(value));
const check = docs => V.validateWorkspace(docs, original, counts, assets);

test('local server finds the repository automatically and is read-only', async () => {
  assert.equal(allowedFile('src/data/challengeRules.json'), true);
  assert.equal(allowedFile('src/data/verses/001_001.json'), true);
  assert.equal(allowedFile('../package.json'), false);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = `http://127.0.0.1:${server.address().port}`;
    const manifest = await (await fetch(`${address}/__builder_manifest`)).json();
    assert.equal(manifest.verseCount, 6236);
    const data = await (await fetch(`${address}/__builder_file/src/data/verses/001_001.json`)).json();
    assert.ok(data.text?.ar);
    assert.equal((await fetch(`${address}/__builder_file/../package.json`)).status, 404);
    assert.equal((await fetch(`${address}/__builder_manifest`, { method: 'POST' })).status, 405);
    const foreignHostStatus = await new Promise((resolve, reject) => {
      http.get(`${address}/__builder_manifest`, { headers: { Host: 'other.local' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(foreignHostStatus, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('current contribution data validates without blocking old issues', () => {
  const before = JSON.stringify(original);
  const result = check(clone(original));
  assert.deepEqual(result.errors, []);
  assert.equal(JSON.stringify(original), before, 'validation must not normalize or mutate Quran data');
  assert.ok(result.warnings.some(item => item.includes('قديم')));
});

test('bad ayah reference and repeated IDs prevent export', () => {
  const docs = clone(original);
  docs.challenge.verses['2:999'] = { recommended: ['2:18'] };
  docs.searches.items.push({ ...docs.searches.items[0] });
  const result = check(docs);
  assert.ok(result.errors.some(item => item.includes('2:999')));
  assert.ok(result.errors.some(item => item.includes('معرّفات مكررة')));
});

test('new path overlap is blocked; an unchanged old overlap is a warning', () => {
  const docs = clone(original);
  docs.topics.chains.push({ id: 'new-overlap', title: 'تجربة', verses: ['1:1'], topicIds: [], tags: [] });
  assert.ok(check(docs).errors.some(item => item.includes('تداخل جديد')));
  const legacy = clone(docs);
  const result = V.validateWorkspace(legacy, legacy, counts, assets);
  assert.ok(result.warnings.some(item => item.includes('تداخل قديم')));
  assert.ok(!result.errors.some(item => item.includes('تداخل جديد')));
});

test('missing image and broken topic link are rejected', () => {
  const docs = clone(original);
  docs.backs.images.push({ id: 'example', name: 'صورة', src: '/discovery-images/absent.webp' });
  docs.backs.verseToImage['2:18'] = 'example';
  docs.topics.topics[0].links.push({ targetTopicId: 'missing-topic', label: '' });
  const result = check(docs);
  assert.ok(result.errors.some(item => item.includes('WebP')));
  assert.ok(result.errors.some(item => item.includes('missing-topic')));
});

test('a staged WebP asset satisfies an image mapping without changing Quran data', () => {
  const docs = clone(original);
  const imagePath = '/discovery-images/test.webp';
  docs.backs.images.push({ id: 'sample', name: 'تجربة', src: imagePath });
  docs.backs.verseToImage['2:18'] = 'sample';
  const withImage = new Set([...assets, `public${imagePath}`]);
  const result = V.validateWorkspace(docs, original, counts, withImage);
  assert.deepEqual(result.errors, []);
});

test('safe gradients and cinema fields are checked', () => {
  const docs = clone(original);
  docs.discovery.backgrounds[0].gradient = 'linear-gradient(url(https://bad.example/a))';
  docs.cinema.items[0].textStyle.fontScale = 20;
  const result = check(docs);
  assert.ok(result.errors.some(item => item.includes('تدرج CSS')));
  assert.ok(result.errors.some(item => item.includes('حجم الخط')));
});

test('single ZIP contains byte-exact backup and parsed proposal', async () => {
  const source = fs.readFileSync(path.join(root, V.editableFiles.challenge));
  const proposal = JSON.stringify({ ...original.challenge, marker: 'test' }, null, 2);
  const zip = new Uint8Array(await (await Z.createZip([
    { path: `backup/${V.editableFiles.challenge}`, data: source },
    { path: `proposed/${V.editableFiles.challenge}`, data: proposal },
  ])).arrayBuffer());
  const entries = new Map();
  let offset = 0;
  while (offset + 30 < zip.length && new DataView(zip.buffer, offset).getUint32(0, true) === 0x04034b50) {
    const view = new DataView(zip.buffer, offset);
    const length = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const name = new TextDecoder().decode(zip.slice(offset + 30, offset + 30 + nameLength));
    const data = zip.slice(offset + 30 + nameLength + extraLength, offset + 30 + nameLength + extraLength + length);
    assert.equal(Z.crc32(data), view.getUint32(14, true));
    entries.set(name, data);
    offset += 30 + nameLength + extraLength + length;
  }
  assert.deepEqual(Buffer.from(entries.get(`backup/${V.editableFiles.challenge}`)), source);
  assert.equal(JSON.parse(new TextDecoder().decode(entries.get(`proposed/${V.editableFiles.challenge}`))).marker, 'test');
});
