(function () {
  'use strict';

  const V = window.BuilderValidation;
  const Z = window.BuilderZip;
  const sections = [
    ['challenge', 'قواعد التحدي'], ['topics', 'الموضوعات والمسارات'],
    ['searches', 'البحوث المحفوظة'], ['cinema', 'مشاهد السينما'],
    ['discovery', 'خلفيات التصفح'], ['backs', 'صور الآيات'],
  ];
  const state = {
    files: new Map(), assets: new Set(), newAssets: new Map(), objectUrls: new Map(),
    originals: {}, docs: {}, counts: {}, chapterNames: {}, active: 'challenge',
    selected: '', query: '', previewText: '', previewRef: '1:1', loaded: false,
  };
  const byId = id => document.getElementById(id);
  const element = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const slug = value => String(value || '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
  const csv = value => String(value || '').split(/[,،\n]+/).map(part => part.trim()).filter(Boolean);
  const refsText = value => (Array.isArray(value) ? value : []).join('، ');
  const filePath = file => {
    const raw = String(file.webkitRelativePath || file.name).replace(/\\/g, '/');
    for (const root of ['src/data/', 'public/discovery-images/']) {
      const at = raw.indexOf(root);
      if (at >= 0) return raw.slice(at);
    }
    return '';
  };
  const changedKeys = () => Object.keys(V.editableFiles).filter(key => JSON.stringify(state.docs[key]) !== JSON.stringify(state.originals[key]));
  const markDraft = () => {
    const count = changedKeys().length;
    const images = referencedNewAssets().length;
    byId('draft-status').textContent = count || images
      ? `مسودة غير محفوظة في المستودع: ${count} ملف JSON و ${images} صورة جديدة. صدّر الحزمة لحفظ عملك.`
      : 'لا تغييرات. الملفات الأصلية آمنة ولم تُلمس.';
    byId('export-button').disabled = !(count || images);
    byId('validation-summary').textContent = 'تغيّرت المسودة. افحصها مجددًا قبل التصدير.';
  };
  const message = text => { byId('draft-status').textContent = text; };
  const clearObjectUrls = () => {
    state.objectUrls.forEach(url => URL.revokeObjectURL(url));
    state.objectUrls.clear();
  };

  async function importFolder(fileList) {
    const files = new Map();
    for (const file of fileList) {
      const path = filePath(file);
      if (path) files.set(path, file);
    }
    const required = [...Object.values(V.editableFiles), 'src/data/metadata.json'];
    const missing = required.filter(path => !files.has(path));
    if (missing.length) throw new Error(`هذا ليس مجلد مستودع البيانات الكامل. ملفات مفقودة: ${missing.join('، ')}`);
    const originals = {};
    for (const [key, path] of Object.entries(V.editableFiles)) {
      try { originals[key] = JSON.parse(await files.get(path).text()); }
      catch { throw new Error(`لا يمكن قراءة JSON الأصلي: ${path}`); }
    }
    const metadata = JSON.parse(await files.get('src/data/metadata.json').text());
    if (!Array.isArray(metadata) || metadata.length !== 114) throw new Error('بيانات السور المرجعية غير مكتملة.');
    const counts = {};
    const chapterNames = {};
    metadata.forEach(chapter => {
      counts[Number(chapter.number)] = Number(chapter.verses_count);
      chapterNames[Number(chapter.number)] = chapter.name?.ar || chapter.name?.en || '';
    });
    if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== 6236) throw new Error('عدد الآيات في بيانات السور لا يطابق هذه النسخة (6236).');
    if ([...files.keys()].filter(path => /^src\/data\/verses\/\d{3}_\d{3}\.json$/.test(path)).length !== 6236) throw new Error('مجلد الآيات غير مكتمل؛ اختر جذر المستودع لا مجلد JSON منفرداً.');
    clearObjectUrls();
    state.files = files;
    state.assets = new Set([...files.keys()].filter(path => path.startsWith('public/discovery-images/') && path.endsWith('.webp')));
    state.newAssets = new Map();
    state.originals = originals;
    state.docs = clone(originals);
    state.counts = counts;
    state.chapterNames = chapterNames;
    state.selected = '';
    state.loaded = true;
    byId('intro').hidden = true;
    byId('workspace').hidden = false;
    render();
    await showVerse('1:1');
  }

  function field(parent, label, value, save, options = {}) {
    const row = element('label', `field${options.wide ? ' wide' : ''}${options.type === 'checkbox' ? ' checkbox' : ''}`);
    const caption = element('span', '', label);
    const control = element(options.type === 'textarea' ? 'textarea' : options.type === 'select' ? 'select' : 'input');
    if (options.type === 'checkbox') {
      control.type = 'checkbox'; control.checked = Boolean(value);
      row.append(control, caption);
    } else {
      if (options.type && options.type !== 'textarea' && options.type !== 'select') control.type = options.type;
      if (options.type === 'select') {
        for (const [key, name] of options.choices || []) {
          const option = element('option', '', name); option.value = key; control.append(option);
        }
      }
      control.value = value ?? '';
      if (options.placeholder) control.placeholder = options.placeholder;
      if (options.dir) control.dir = options.dir;
      row.append(caption, control);
    }
    control.addEventListener(options.type === 'checkbox' || options.type === 'select' || options.type === 'color' ? 'change' : 'input', () => {
      save(options.type === 'checkbox' ? control.checked : options.type === 'number' ? Number(control.value) : control.value);
      markDraft();
      if (options.visual) renderVisualPreview();
    });
    parent.append(row);
    return control;
  }
  const arrayField = (parent, label, value, save, options = {}) => field(parent, label, refsText(value), next => save(options.refs ? expandRefs(next) : csv(next)), { type: 'textarea', wide: true, placeholder: options.placeholder || 'افصل العناصر بفاصلة، أو ضع كل عنصر في سطر' });
  const info = (parent, text) => parent.append(element('p', 'note', text));
  const action = (parent, label, click, className = 'button secondary') => {
    const button = element('button', className, label); button.type = 'button'; button.addEventListener('click', click); parent.append(button); return button;
  };
  const expandRefs = value => csv(value).flatMap(token => {
    const range = /^([1-9]\d{0,2}):([1-9]\d{0,2})-([1-9]\d{0,2})$/.exec(token);
    if (!range) return [token];
    const start = Number(range[2]); const end = Number(range[3]);
    if (end < start || end - start > 285) return [token];
    return Array.from({ length: end - start + 1 }, (_, index) => `${range[1]}:${start + index}`);
  });

  function entriesForSection() {
    const docs = state.docs;
    if (state.active === 'challenge') return [
      ...Object.keys(docs.challenge.chapters || {}).map(id => ({ id: `c:${id}`, label: `سورة ${id} · حظر عام`, subtitle: state.chapterNames[id] || '' })),
      ...Object.keys(docs.challenge.verses || {}).map(id => ({ id: `v:${id}`, label: id, subtitle: 'قاعدة آية' })),
    ].sort((a, b) => a.label.localeCompare(b.label, 'ar', { numeric: true }));
    if (state.active === 'topics') return [
      ...state.docs.topics.topics.map(item => ({ id: `t:${item.id}`, label: item.name, subtitle: `موضوع · ${item.verses?.length || 0} آيات` })),
      ...state.docs.topics.chains.map(item => ({ id: `p:${item.id}`, label: item.title, subtitle: `مسار · ${item.verses?.length || 0} آيات` })),
      ...Object.keys(state.docs.topics.chapterTopics).map(id => ({ id: `c:${id}`, label: `السورة ${id}`, subtitle: 'وسوم إضافية' })),
    ];
    if (state.active === 'searches') return state.docs.searches.items.map(item => ({ id: item.id, label: item.title, subtitle: item.query }));
    if (state.active === 'cinema') return [
      ...state.docs.cinema.items.map(item => ({ id: `s:${item.id}`, label: item.name, subtitle: 'مشهد' })),
      ...state.docs.cinema.templates.map(item => ({ id: `t:${item.id}`, label: item.name, subtitle: 'قالب' })),
    ];
    if (state.active === 'discovery') return [
      { id: 'exclusions', label: 'الاستبعادات', subtitle: 'سور وآيات' },
      ...state.docs.discovery.backgrounds.map(item => ({ id: item.id, label: item.name, subtitle: item.type === 'image' ? 'صورة خلفية' : 'تدرّج' })),
    ];
    return [
      { id: 'mappings', label: 'ربط الآيات', subtitle: `${Object.keys(state.docs.backs.verseToImage).length} روابط` },
      ...state.docs.backs.images.map(item => ({ id: item.id, label: item.name || item.id, subtitle: item.src })),
    ];
  }

  function render() {
    const tabBar = byId('tabs'); tabBar.replaceChildren();
    for (const [key, title] of sections) {
      const button = element('button', '', title); button.type = 'button';
      if (state.active === key) button.setAttribute('aria-current', 'page');
      button.addEventListener('click', () => { state.active = key; state.selected = ''; state.query = ''; byId('list-search').value = ''; render(); });
      tabBar.append(button);
    }
    byId('section-title').textContent = sections.find(item => item[0] === state.active)[1];
    const items = entriesForSection();
    if (!items.some(item => item.id === state.selected)) state.selected = items[0]?.id || '';
    const list = byId('item-list'); list.replaceChildren();
    const query = state.query.trim().toLocaleLowerCase('ar');
    const filtered = items.filter(item => `${item.label} ${item.id} ${item.subtitle}`.toLocaleLowerCase('ar').includes(query));
    if (!filtered.length) list.append(element('p', 'empty', 'لا توجد نتائج.'));
    for (const item of filtered) {
      const button = element('button', item.id === state.selected ? 'selected' : '', item.label);
      button.type = 'button'; button.append(element('small', '', item.subtitle));
      button.addEventListener('click', () => {
        state.selected = item.id; render();
        const ref = state.active === 'challenge' && item.id.startsWith('v:') ? item.id.slice(2)
          : state.active === 'topics' && item.id.startsWith('t:') ? state.docs.topics.topics.find(entry => entry.id === item.id.slice(2))?.verses?.[0]
            : state.active === 'topics' && item.id.startsWith('p:') ? state.docs.topics.chains.find(entry => entry.id === item.id.slice(2))?.verses?.[0] : '';
        if (ref && V.validRef(ref, state.counts)) { byId('preview-ref').value = ref; showVerse(ref); }
      });
      list.append(button);
    }
    renderEditor();
    renderVisualPreview();
    markDraft();
  }

  function editorHead(root, title, subtitle, remove) {
    const head = element('div', 'editor-head');
    const copy = element('div'); copy.append(element('h2', '', title), element('p', '', subtitle)); head.append(copy);
    if (remove) action(head, 'حذف من المسودة', remove, 'button danger compact');
    root.append(head);
  }
  function removeItem(remove, label) {
    if (!window.confirm(`حذف «${label}» من المسودة فقط؟ لن يتغير الملف الأصلي.`)) return;
    remove(); state.selected = ''; render();
  }

  function renderEditor() {
    const root = byId('editor'); root.replaceChildren();
    if (!state.selected) { root.append(element('p', 'empty', 'اختر عنصراً أو أضف واحداً.')); return; }
    const grid = element('div', 'editor-grid');
    if (state.active === 'challenge') {
      const [type, id] = [state.selected[0], state.selected.slice(2)];
      const doc = state.docs.challenge;
      const target = type === 'c' ? doc.chapters[id] : doc.verses[id];
      editorHead(root, type === 'c' ? `حظر السورة ${id}` : `قاعدة الآية ${id}`, 'الحظر لا يمسّ نص الآية أو ظهورها بوصفها جواباً صحيحاً.', () => removeItem(() => { delete (type === 'c' ? doc.chapters : doc.verses)[id]; }, id));
      if (type === 'v') {
        info(root, 'الموصى بها علاقة محتملة ومتبادلة في التحدي، وليست إجابة تظهر في كل جولة. المتشابهات في الصفحة الرئيسية تقرأ الروابط المباشرة فقط.');
        arrayField(grid, 'آيات موصى بها', target.recommended || [], value => { target.recommended = value; });
      }
      arrayField(grid, 'آيات محظورة كخيارات خاطئة', target.blocked || [], value => { target.blocked = value; });
    } else if (state.active === 'topics') {
      const type = state.selected[0]; const id = state.selected.slice(2); const doc = state.docs.topics;
      if (type === 't') {
        const item = doc.topics.find(entry => entry.id === id);
        editorHead(root, item.name, 'موضوع وارتباطاته بالآيات', () => removeItem(() => {
          doc.topics = doc.topics.filter(entry => entry !== item);
          doc.chains.forEach(chain => { chain.topicIds = (chain.topicIds || []).filter(value => value !== item.id); });
          Object.values(doc.chapterTopics).forEach(chapter => { chapter.topicIds = (chapter.topicIds || []).filter(value => value !== item.id); });
          doc.topics.forEach(topic => { if (topic.parentTopicId === item.id) topic.parentTopicId = ''; topic.links = (topic.links || []).filter(link => link.targetTopicId !== item.id); });
        }, item.name));
        field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
        field(grid, 'اسم الموضوع', item.name, value => { item.name = value; });
        field(grid, 'الوصف', item.description || '', value => { item.description = value; }, { type: 'textarea', wide: true });
        field(grid, 'الموضوع الأب (معرّفه)', item.parentTopicId || '', value => { item.parentTopicId = value.trim(); });
        field(grid, 'اللون', item.color || '#10b981', value => { item.color = value; }, { type: 'color' });
        arrayField(grid, 'الوسوم النصية', item.tags || [], value => { item.tags = value; });
        arrayField(grid, 'آيات الموضوع', item.verses || [], value => { item.verses = value; }, { refs: true, placeholder: '2:3-7، 18:10' });
        field(grid, 'روابط الموضوعات · معرّف | عنوان اختياري في كل سطر', (item.links || []).map(link => `${link.targetTopicId}${link.label ? ` | ${link.label}` : ''}`).join('\n'), value => {
          item.links = value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const [targetTopicId, ...label] = line.split('|'); return { targetTopicId: targetTopicId.trim(), label: label.join('|').trim() };
          });
        }, { type: 'textarea', wide: true });
      } else if (type === 'p') {
        const item = doc.chains.find(entry => entry.id === id);
        editorHead(root, item.title, 'مسار أفقي؛ موضوعاته الموروثة من الآيات تُحسب في التطبيق ولا تُنسخ هنا.', () => removeItem(() => { doc.chains = doc.chains.filter(entry => entry !== item); }, item.title));
        field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
        field(grid, 'العنوان', item.title, value => { item.title = value; });
        field(grid, 'الوصف', item.description || '', value => { item.description = value; }, { type: 'textarea', wide: true });
        arrayField(grid, 'الآيات بالترتيب · نطاق 2:3-7 متصل بالكامل', item.verses || [], value => { item.verses = value; }, { refs: true });
        arrayField(grid, 'معرّفات موضوعات يدوية إضافية', item.topicIds || [], value => { item.topicIds = value; });
        arrayField(grid, 'وسوم نصية', item.tags || [], value => { item.tags = value; });
      } else {
        const item = doc.chapterTopics[id];
        editorHead(root, `السورة ${id} · ${state.chapterNames[id] || ''}`, 'أضف الوسوم اليدوية فقط؛ الموروثة من الآيات والمسارات تبقى ديناميكية.', () => removeItem(() => { delete doc.chapterTopics[id]; }, id));
        arrayField(grid, 'معرّفات موضوعات إضافية', item.topicIds || [], value => { item.topicIds = value; });
        arrayField(grid, 'وسوم نصية', item.tags || [], value => { item.tags = value; });
        field(grid, 'ملاحظة السورة', item.note || '', value => { item.note = value; }, { type: 'textarea', wide: true });
      }
    } else if (state.active === 'searches') {
      const doc = state.docs.searches; const item = doc.items.find(entry => entry.id === state.selected);
      editorHead(root, item.title || item.id, 'بحث جاهز للمستخدم', () => removeItem(() => { doc.items = doc.items.filter(entry => entry !== item); }, item.id));
      field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
      field(grid, 'العنوان', item.title, value => { item.title = value; });
      field(grid, 'عبارة البحث', item.query, value => { item.query = value; }, { wide: true });
      arrayField(grid, 'وسوم التنظيم', item.tags || [], value => { item.tags = value; });
    } else if (state.active === 'cinema') {
      const type = state.selected[0]; const id = state.selected.slice(2); const doc = state.docs.cinema;
      const collection = type === 't' ? doc.templates : doc.items;
      const item = collection.find(entry => entry.id === id);
      item.config ||= {}; item.textStyle ||= {};
      editorHead(root, item.name, type === 't' ? 'قالب قابل لإعادة الاستخدام' : 'مشهد للعرض', () => removeItem(() => { doc[type === 't' ? 'templates' : 'items'] = collection.filter(entry => entry !== item); }, item.name));
      field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
      field(grid, 'الاسم', item.name, value => { item.name = value; });
      field(grid, 'الوصف', item.description || '', value => { item.description = value; }, { type: 'textarea', wide: true });
      field(grid, 'نوع الخلفية', item.backgroundType || 'css', value => { item.backgroundType = value; renderEditor(); }, { type: 'select', choices: [
        ['css', 'تدرج CSS'], ['youtube', 'فيديو YouTube صامت'],
        ...(!['css', 'youtube'].includes(item.backgroundType) ? [[item.backgroundType, `${item.backgroundType} · نوع قديم للقراءة فقط`]] : []),
      ] });
      if (item.backgroundType === 'youtube') {
        field(grid, 'رابط YouTube', item.config.youtubeUrl || '', value => {
          item.config.youtubeUrl = value;
          const match = /(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{8,20})/.exec(value);
          item.config.youtubeId = match?.[1] || (/^[a-zA-Z0-9_-]{8,20}$/.test(value) ? value : '');
        }, { wide: true, dir: 'ltr' });
      } else if (item.backgroundType === 'css') {
        field(grid, 'تدرج الخلفية', item.config.cssBackground || '', value => { item.config.cssBackground = value; }, { type: 'textarea', wide: true, visual: true, dir: 'ltr' });
      } else info(root, 'هذا نوع قديم/متقدم. لا تُغيّر حقوله غير الظاهرة؛ ستبقى محفوظة كما هي في JSON.');
      field(grid, 'طبقة الخلفية (اختيارية)', item.config.overlay || 'transparent', value => { item.config.overlay = value; }, { dir: 'ltr', visual: true });
      field(grid, 'لون نص الآية', item.textStyle.color || '#fff7ed', value => { item.textStyle.color = value; }, { type: 'color', visual: true });
      field(grid, 'لون المرجع', item.textStyle.accent || '#fbbf24', value => { item.textStyle.accent = value; }, { type: 'color' });
      field(grid, 'ظل النص · none مسموح', item.textStyle.shadow || 'none', value => { item.textStyle.shadow = value; }, { dir: 'ltr', wide: true, visual: true });
      field(grid, 'خلفية النص · transparent مسموح', item.textStyle.backdrop || 'transparent', value => { item.textStyle.backdrop = value; }, { dir: 'ltr', wide: true });
      field(grid, 'حجم الخط (0.5–2)', item.textStyle.fontScale || 1, value => { item.textStyle.fontScale = value; }, { type: 'number' });
      field(grid, 'شكل البطاقة', item.textStyle.cardStyle || 'none', value => { item.textStyle.cardStyle = value; }, { type: 'select', choices: [['none', 'بدون بطاقة'], ['glass', 'زجاجية'], ['solid', 'صلبة']] });
      field(grid, 'مفعّل', item.enabled !== false, value => { item.enabled = value; }, { type: 'checkbox' });
    } else if (state.active === 'discovery') {
      const doc = state.docs.discovery;
      if (state.selected === 'exclusions') {
        editorHead(root, 'استبعادات التصفح', 'هذه القواعد تخصّ التصفح العشوائي فقط، ولا تغيّر قواعد التحدي.');
        arrayField(grid, 'أرقام سور مستبعدة بالكامل', doc.excludedChapters || [], value => { doc.excludedChapters = value.map(Number); });
        arrayField(grid, 'آيات مستبعدة', doc.excludedVerses || [], value => { doc.excludedVerses = value; });
      } else {
        const item = doc.backgrounds.find(entry => entry.id === state.selected);
        editorHead(root, item.name, 'خلفية عمودية؛ المقاس المقترح 1080 × 1920 بكسل.', () => removeItem(() => { doc.backgrounds = doc.backgrounds.filter(entry => entry !== item); }, item.name));
        field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
        field(grid, 'الاسم', item.name, value => { item.name = value; });
        field(grid, 'نوع الخلفية', item.type, value => { item.type = value; renderEditor(); }, { type: 'select', choices: [['gradient', 'تدرج'], ['image', 'صورة WebP']] });
        if (item.type === 'gradient') field(grid, 'تدرج CSS', item.gradient || '', value => { item.gradient = value; }, { type: 'textarea', wide: true, dir: 'ltr', visual: true });
        else {
          field(grid, 'مسار الصورة', item.image || '', value => { item.image = value; }, { dir: 'ltr', wide: true, visual: true });
          imagePicker(grid, 'استيراد صورة للخلفية', async path => { item.image = `/${path.replace(/^public\//, '')}`; render(); });
        }
        field(grid, 'لون نص الآية', item.textColor, value => { item.textColor = value; }, { type: 'color', visual: true });
        field(grid, 'لون التفاصيل', item.accentColor, value => { item.accentColor = value; }, { type: 'color' });
        for (const [key, label] of [['focalX', 'تركيز الصورة أفقيًا'], ['focalY', 'تركيز الصورة عموديًا'], ['shieldX', 'موضع حماية النص أفقيًا'], ['shieldY', 'موضع حماية النص عموديًا']]) field(grid, `${label} (0–100)`, item[key], value => { item[key] = value; }, { type: 'number', visual: true });
        field(grid, 'قوة حماية النص (0–0.85)', item.shieldStrength, value => { item.shieldStrength = value; }, { type: 'number', visual: true });
        field(grid, 'المظهر الداكن', item.themes?.includes('dark'), value => { item.themes = value ? [...new Set([...(item.themes || []), 'dark'])] : item.themes.filter(theme => theme !== 'dark'); }, { type: 'checkbox' });
        field(grid, 'المظهر الفاتح', item.themes?.includes('light'), value => { item.themes = value ? [...new Set([...(item.themes || []), 'light'])] : item.themes.filter(theme => theme !== 'light'); }, { type: 'checkbox' });
        field(grid, 'مفعّلة', item.enabled !== false, value => { item.enabled = value; }, { type: 'checkbox' });
      }
    } else if (state.active === 'backs') {
      const doc = state.docs.backs;
      if (state.selected === 'mappings') {
        editorHead(root, 'ربط صورة بآية', 'الصورة الخلفية تُعرض كاملة؛ المقاس العمودي 1080 × 1920 نقطة بداية مفيدة.');
        const ref = field(grid, 'مرجع الآية', '', () => {}, { dir: 'ltr', placeholder: '2:18' });
        const image = field(grid, 'الصورة', '', () => {}, { type: 'select', choices: [['', 'اختر صورة'], ...doc.images.map(item => [item.id, item.name || item.id])] });
        const actions = element('div', 'editor-actions');
        action(actions, 'ربط في المسودة', () => {
          const key = ref.value.trim();
          if (!V.validRef(key, state.counts) || !doc.images.some(item => item.id === image.value)) { window.alert('اختر مرجع آية صالحاً وصورة موجودة.'); return; }
          doc.verseToImage[key] = image.value; render();
        }, 'button primary');
        root.append(grid, actions);
        const mappingList = element('div', 'item-list');
        for (const [key, id] of Object.entries(doc.verseToImage).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
          const row = element('button', '', `${key} ← ${doc.images.find(item => item.id === id)?.name || id} · اضغط للحذف`);
          row.type = 'button'; row.addEventListener('click', () => removeItem(() => { delete doc.verseToImage[key]; }, key));
          mappingList.append(row);
        }
        root.append(mappingList);
        return;
      }
      const item = doc.images.find(entry => entry.id === state.selected);
      editorHead(root, item.name || item.id, 'صورة وجه خلفي مرتبطة بالآيات عبر معرّفها.', () => removeItem(() => {
        doc.images = doc.images.filter(entry => entry !== item);
        Object.entries(doc.verseToImage).forEach(([ref, id]) => { if (id === item.id) delete doc.verseToImage[ref]; });
      }, item.name || item.id));
      field(grid, 'المعرّف الثابت', item.id, () => {}, { dir: 'ltr' }).readOnly = true;
      field(grid, 'الاسم', item.name || '', value => { item.name = value; });
      field(grid, 'مسار الصورة', item.src || '', value => { item.src = value; }, { dir: 'ltr', wide: true });
      imagePicker(grid, 'استبدل بصورة جديدة', async path => { item.src = `/${path.replace(/^public\//, '')}`; render(); });
    }
    root.append(grid);
  }

  function renderVisualPreview() {
    const preview = byId('verse-preview');
    preview.style.cssText = '';
    preview.replaceChildren();
    const text = state.previewText || 'اختر آية صالحة من ملفات القرآن المحلية للمعاينة.';
    const display = element('span', '', text);
    preview.append(display);
    if (state.active === 'discovery') {
      const item = state.docs.discovery.backgrounds.find(entry => entry.id === state.selected);
      if (item) {
        preview.style.color = /^#[0-9a-f]{6}$/i.test(item.textColor) ? item.textColor : '#fff9e9';
        if (item.type === 'gradient' && V.validGradient(item.gradient)) preview.style.backgroundImage = item.gradient;
        if (item.type === 'image' && item.image) preview.style.backgroundImage = `url("${imageUrl(item.image)}")`;
        preview.style.backgroundPosition = `${Number(item.focalX) || 50}% ${Number(item.focalY) || 50}%`;
      }
    } else if (state.active === 'cinema') {
      const type = state.selected[0]; const id = state.selected.slice(2);
      const item = state.docs.cinema[type === 't' ? 'templates' : 'items'].find(entry => entry.id === id);
      if (item) {
        if (item.backgroundType === 'css' && V.validGradient(item.config?.cssBackground)) preview.style.backgroundImage = item.config.cssBackground;
        if (/^#[0-9a-f]{6}$/i.test(item.textStyle?.color || '')) preview.style.color = item.textStyle.color;
        preview.style.textShadow = item.textStyle?.shadow || 'none';
      }
    } else if (state.active === 'backs' && state.selected !== 'mappings') {
      const item = state.docs.backs.images.find(entry => entry.id === state.selected);
      if (item?.src) {
        preview.replaceChildren();
        const image = element('img', 'image-preview');
        image.src = imageUrl(item.src);
        image.alt = item.name || 'صورة الآية';
        preview.append(image);
      }
    }
  }

  function imageUrl(src) {
    const path = `public/${String(src).replace(/^\//, '')}`;
    if (state.objectUrls.has(path)) return state.objectUrls.get(path);
    const data = state.newAssets.get(path) || state.files.get(path);
    if (!data) return '';
    const url = URL.createObjectURL(data);
    state.objectUrls.set(path, url);
    return url;
  }

  async function stageImage(file) {
    if (!file || !file.type.startsWith('image/') || file.size > 15_000_000) throw new Error('اختر صورة أقل من 15 ميغابايت.');
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, 1440 / bitmap.width, 2560 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp' || blob.size > 5_000_000) throw new Error('تعذّر إعداد صورة WebP أقل من 5 ميغابايت.');
    const name = `image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`;
    const path = `public/discovery-images/${name}`;
    state.newAssets.set(path, blob); state.assets.add(path);
    return path;
  }
  function imagePicker(parent, label, onReady) {
    const row = element('label', 'field wide', label);
    const input = element('input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', async () => {
      try { if (input.files?.[0]) await onReady(await stageImage(input.files[0])); markDraft(); }
      catch (error) { window.alert(error.message); }
    });
    row.append(input); parent.append(row);
  }

  async function showVerse(rawRef) {
    const query = String(rawRef || '').trim();
    const matchingChapter = Object.entries(state.chapterNames).find(([id, name]) => name.includes(query) || query.includes(name));
    const ref = V.validRef(query, state.counts) ? query : (matchingChapter && query ? `${matchingChapter[0]}:1` : query);
    state.previewRef = ref;
    if (ref !== query) byId('preview-ref').value = ref;
    if (!V.validRef(ref, state.counts)) { state.previewText = 'مرجع الآية غير صالح.'; renderVisualPreview(); return; }
    const [chapter, verse] = ref.split(':').map(Number);
    const path = `src/data/verses/${String(chapter).padStart(3, '0')}_${String(verse).padStart(3, '0')}.json`;
    const source = state.files.get(path);
    if (!source) { state.previewText = `ملف الآية ${ref} غير موجود في المجلد المختار.`; renderVisualPreview(); return; }
    try {
      const data = JSON.parse(await source.text());
      state.previewText = data.text?.ar || 'لا يوجد نص عربي في ملف الآية.';
      renderVisualPreview();
    } catch { state.previewText = `تعذّرت قراءة الآية ${ref}.`; renderVisualPreview(); }
  }

  const addOptions = {
    challenge: [['verse', 'قاعدة آية'], ['chapter', 'حظر سورة']],
    topics: [['topic', 'موضوع'], ['chain', 'مسار أفقي'], ['chapter', 'وسوم سورة']],
    searches: [['search', 'بحث محفوظ']],
    cinema: [['scene', 'مشهد'], ['template', 'قالب']],
    discovery: [['background', 'خلفية']],
    backs: [['image', 'صورة وجه خلفي']],
  };
  function openAddDialog() {
    const select = byId('add-kind'); select.replaceChildren();
    for (const [key, title] of addOptions[state.active]) {
      const option = element('option', '', title); option.value = key; select.append(option);
    }
    byId('add-kind-row').hidden = addOptions[state.active].length === 1;
    byId('add-value').value = '';
    byId('add-overlay').hidden = false;
    updateAddHint();
    byId('add-value').focus();
  }
  function updateAddHint() {
    const kind = byId('add-kind').value;
    const reference = kind === 'verse' || kind === 'chapter';
    byId('add-value-label').textContent = kind === 'verse' ? 'مرجع الآية' : kind === 'chapter' ? 'رقم السورة' : 'الاسم أو العنوان';
    byId('add-value').placeholder = kind === 'verse' ? '2:18' : kind === 'chapter' ? '55' : 'اكتب اسماً واضحاً';
    byId('add-value').dir = reference ? 'ltr' : 'rtl';
    byId('add-help').textContent = kind === 'chain' ? 'بعد الإضافة أدخل الآيات بالترتيب. 2:3-7 يضيف جميع الآيات بينها.' : 'الإضافة مسودة فقط؛ لن يتغير الملف الأصلي.';
  }
  function addItem() {
    const value = byId('add-value').value.trim();
    const kind = byId('add-kind').value;
    if (!value) { byId('add-value').focus(); return; }
    const docs = state.docs;
    if (state.active === 'challenge') {
      if (kind === 'chapter') {
        if (!V.validChapter(value, state.counts)) return window.alert('رقم سورة غير صالح.');
        docs.challenge.chapters[value] ||= { blocked: [] }; state.selected = `c:${value}`;
      } else {
        if (!V.validRef(value, state.counts)) return window.alert('مرجع آية غير صالح.');
        docs.challenge.verses[value] ||= { recommended: [], blocked: [] }; state.selected = `v:${value}`;
      }
    } else if (state.active === 'topics') {
      if (kind === 'chapter') {
        if (!V.validChapter(value, state.counts)) return window.alert('رقم سورة غير صالح.');
        docs.topics.chapterTopics[value] ||= { topicIds: [], tags: [], note: '' }; state.selected = `c:${value}`;
      } else {
        let id = slug(value);
        const collection = kind === 'chain' ? docs.topics.chains : docs.topics.topics;
        if (collection.some(item => item.id === id)) id = `${id}-${Date.now().toString(36)}`;
        if (kind === 'chain') { collection.push({ id, title: value, description: '', tags: [], topicIds: [], verses: [] }); state.selected = `p:${id}`; }
        else { collection.push({ id, name: value, description: '', parentTopicId: '', tags: [], color: '#10b981', verses: [], links: [] }); state.selected = `t:${id}`; }
      }
    } else if (state.active === 'searches') {
      let id = slug(value); if (docs.searches.items.some(item => item.id === id)) id = `${id}-${Date.now().toString(36)}`;
      docs.searches.items.push({ id, title: value, query: '', tags: [] }); state.selected = id;
    } else if (state.active === 'cinema') {
      const collection = kind === 'template' ? docs.cinema.templates : docs.cinema.items;
      let id = slug(value); if ([...docs.cinema.items, ...docs.cinema.templates].some(item => item.id === id)) id = `${id}-${Date.now().toString(36)}`;
      collection.push({ id, name: value, description: '', backgroundType: 'css', enabled: true, config: { cssBackground: 'linear-gradient(145deg, #081b25, #0d3435)', overlay: 'transparent' }, textStyle: { color: '#fff7ed', accent: '#fbbf24', shadow: 'none', backdrop: 'transparent', fontScale: 1, cardStyle: 'none', fontFamily: 'var(--font-quran), "Amiri", "Scheherazade New", "Noto Naskh Arabic", "Traditional Arabic", serif' } });
      state.selected = `${kind === 'template' ? 't' : 's'}:${id}`;
    } else if (state.active === 'discovery') {
      let id = slug(value); if (docs.discovery.backgrounds.some(item => item.id === id)) id = `${id}-${Date.now().toString(36)}`;
      docs.discovery.backgrounds.push({ id, name: value, type: 'gradient', themes: ['dark'], gradient: 'linear-gradient(145deg, #081b25, #0d3435)', image: '', textColor: '#fff9e9', accentColor: '#eacb83', focalX: 50, focalY: 50, shieldX: 50, shieldY: 50, shieldStrength: 0.3, enabled: true });
      state.selected = id;
    } else {
      let id = slug(value); if (docs.backs.images.some(item => item.id === id)) id = `${id}-${Date.now().toString(36)}`;
      docs.backs.images.push({ id, name: value, src: '' }); state.selected = id;
    }
    byId('add-overlay').hidden = true;
    render();
  }

  function runValidation() {
    const result = V.validateWorkspace(state.docs, state.originals, state.counts, state.assets);
    const errors = byId('validation-errors'); const warnings = byId('validation-warnings');
    errors.replaceChildren(); warnings.replaceChildren();
    result.errors.forEach(item => errors.append(element('li', '', item)));
    result.warnings.forEach(item => warnings.append(element('li', '', item)));
    byId('validation-summary').textContent = result.errors.length
      ? `${result.errors.length} مشكلة تمنع التصدير · ${result.warnings.length} تنبيه`
      : `الملفات سليمة للتصدير · ${result.warnings.length} تنبيه للمراجعة`;
    return result;
  }

  function referencedNewAssets() {
    const used = new Set([
      ...state.docs.discovery.backgrounds.map(item => item.image),
      ...state.docs.backs.images.map(item => item.src),
    ].map(src => `public/${String(src || '').replace(/^\//, '')}`));
    return [...state.newAssets.entries()].filter(([path]) => used.has(path));
  }

  async function exportReview() {
    const { errors } = runValidation();
    if (errors.length) { byId('validation-summary').scrollIntoView({ behavior: 'smooth' }); return; }
    const changed = changedKeys();
    const newImages = referencedNewAssets();
    if (!changed.length && !newImages.length) return;
    const timestamp = new Date().toISOString();
    const files = [];
    const notes = [
      'ورتّل — حزمة مراجعة مساهمة', `التاريخ: ${timestamp}`, '',
      'backup/ هي الملفات الأصلية دون تغيير. احتفظ بها للاستعادة أو المقارنة.',
      'proposed/ هي الملفات المقترحة. افحص الفروقات ثم انسخها إلى فرعك فقط.',
      'لا تَنسخ مجلد backup/ إلى التطبيق.', '', 'ملفات JSON المعدّلة:',
      ...changed.map(key => `- ${V.editableFiles[key]}`), '', 'الصور الجديدة:',
      ...newImages.map(([path]) => path)].join('\n');
    files.push({ path: 'REVIEW.txt', data: notes });
    for (const key of changed) {
      const path = V.editableFiles[key];
      files.push({ path: `backup/${path}`, data: state.files.get(path) });
      const proposed = clone(state.docs[key]);
      if (Object.hasOwn(proposed, 'updatedAt')) proposed.updatedAt = timestamp;
      files.push({ path: `proposed/${path}`, data: `${JSON.stringify(proposed, null, 2)}\n` });
    }
    for (const [path, blob] of newImages) files.push({ path: `proposed/${path}`, data: blob });
    try {
      message('نُجهّز حزمة المراجعة...');
      const zip = await Z.createZip(files);
      const url = URL.createObjectURL(zip);
      const link = element('a'); link.href = url; link.download = `warttil-review-${timestamp.slice(0, 10)}.zip`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      message('نُزّلت حزمة المراجعة. لم تتغير ملفات المشروع؛ افحصها قبل نسخ المقترح.');
    } catch (error) { message(`تعذّر التصدير: ${error.message}`); byId('draft-status').classList.add('status-error'); }
  }

  byId('choose-folder').addEventListener('click', () => byId('folder-input').click());
  byId('folder-input').addEventListener('change', async event => {
    message('نقرأ الملفات المختارة...');
    try { await importFolder(event.target.files); }
    catch (error) { window.alert(error.message); message('تعذّر فتح المجلد. اختر جذر مستودع البيانات الكامل.'); }
  });
  byId('add-button').addEventListener('click', openAddDialog);
  byId('add-kind').addEventListener('change', updateAddHint);
  byId('add-confirm').addEventListener('click', addItem);
  byId('add-cancel').addEventListener('click', () => { byId('add-overlay').hidden = true; });
  byId('add-value').addEventListener('keydown', event => { if (event.key === 'Enter') addItem(); });
  byId('list-search').addEventListener('input', event => { state.query = event.target.value; render(); byId('list-search').focus(); });
  byId('validate-button').addEventListener('click', runValidation);
  byId('export-button').addEventListener('click', exportReview);
  byId('preview-button').addEventListener('click', () => showVerse(byId('preview-ref').value));
  byId('preview-ref').addEventListener('input', event => {
    const query = event.target.value.trim();
    const suggestions = byId('reference-suggestions'); suggestions.replaceChildren();
    if (!query) return;
    const chapter = /^([1-9]\d{0,2})(?::([1-9]\d{0,2})?)?$/.exec(query);
    const candidates = chapter && state.counts[Number(chapter[1])]
      ? Array.from({ length: state.counts[Number(chapter[1])] }, (_, index) => `${Number(chapter[1])}:${index + 1}`).filter(ref => ref.startsWith(query)).slice(0, 20)
      : Object.entries(state.chapterNames).filter(([, name]) => name.includes(query)).slice(0, 5).flatMap(([id]) => Array.from({ length: Math.min(5, state.counts[id]) }, (_, index) => `${id}:${index + 1}`));
    candidates.forEach(ref => { const option = element('option'); option.value = ref; option.label = `${state.chapterNames[Number(ref.split(':')[0])]} · ${ref}`; suggestions.append(option); });
  });
  byId('preview-ref').addEventListener('keydown', event => { if (event.key === 'Enter') showVerse(event.target.value); });
})();
