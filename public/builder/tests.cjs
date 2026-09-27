const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const V = require('./validation.js');
const Z = require('./zip.js');

const root = path.resolve(__dirname, '../..');
const original = Object.fromEntries(Object.entries(V.editableFiles).map(([key, name]) => [key, JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))]));
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'src/data/metadata.json'), 'utf8'));
const counts = Object.fromEntries(metadata.map(item => [item.number, item.verses_count]));
const assets = new Set(fs.readdirSync(path.join(root, 'public/discovery-images')).map(name => `public/discovery-images/${name}`));
const clone = value => JSON.parse(JSON.stringify(value));
const check = docs => V.validateWorkspace(docs, original, counts, assets);

test('offline snapshot matches the checked-in contribution data', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'data-snapshot.js'), 'utf8'), context);
  const snapshot = context.window.BuilderSnapshot;
  assert.equal(snapshot.version, 1);
  assert.equal(Object.keys(snapshot.verses).length, 6236);
  for (const name of Object.values(V.editableFiles)) {
    assert.equal(snapshot.originalFiles[name], fs.readFileSync(path.join(root, name), 'utf8'), name);
  }
  assert.equal(JSON.stringify(snapshot.metadata), JSON.stringify(metadata));
  for (const name of fs.readdirSync(path.join(root, 'src/data/verses')).filter(name => /^\d{3}_\d{3}\.json$/.test(name))) {
    const ref = `${Number(name.slice(0, 3))}:${Number(name.slice(4, 7))}`;
    assert.equal(snapshot.verses[ref], JSON.parse(fs.readFileSync(path.join(root, 'src/data/verses', name), 'utf8')).text.ar, ref);
  }
  assert.equal(JSON.stringify(snapshot.assets), JSON.stringify([...assets].filter(name => name.endsWith('.webp')).sort()));
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
