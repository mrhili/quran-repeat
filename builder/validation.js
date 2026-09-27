(function (root) {
  'use strict';

  const editableFiles = {
    challenge: 'src/data/challengeRules.json',
    topics: 'src/data/topicMap.json',
    searches: 'src/data/savedSearches.json',
    cinema: 'src/data/cinemaScenes.json',
    discovery: 'src/data/discoveryFeed.json',
    backs: 'src/data/verseBackImages.json',
  };

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const list = value => Array.isArray(value) ? value : [];
  const unique = values => new Set(values).size === values.length;
  const refParts = value => /^([1-9]\d{0,2}):([1-9]\d{0,2})$/.exec(String(value || ''));
  const validRef = (value, counts) => {
    const parts = refParts(value);
    return Boolean(parts && Number(parts[1]) <= 114 && Number(parts[2]) <= Number(counts[Number(parts[1])] || 0));
  };
  const validChapter = (value, counts) => /^[1-9]\d{0,2}$/.test(String(value)) && Boolean(counts[Number(value)]);
  const validAsset = value => /^\/discovery-images\/[a-z0-9-]+\.webp$/i.test(String(value || ''));
  const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  const validGradient = value => /^(linear-gradient|radial-gradient|conic-gradient)\([\s\S]+\)$/i.test(String(value || '').trim())
    && !/(url\(|expression\(|@import|javascript:|;)/i.test(value);

  function validateWorkspace(docs, originals, counts, assets) {
    const errors = [];
    const warnings = [];
    const fail = (area, message) => errors.push(`${area}: ${message}`);
    const warn = (area, message) => warnings.push(`${area}: ${message}`);
    const refs = (area, values) => {
      if (!Array.isArray(values)) { fail(area, 'يجب أن تكون المراجع قائمة.'); return; }
      if (!unique(values)) fail(area, 'توجد مراجع مكررة.');
      values.forEach(value => { if (!validRef(value, counts)) fail(area, `مرجع آية غير صالح: ${value}`); });
    };
    const ids = (area, values) => {
      if (!unique(values)) fail(area, 'توجد معرّفات مكررة.');
      values.forEach(value => { if (!String(value || '').trim()) fail(area, 'يوجد معرّف فارغ.'); });
    };

    const challenge = docs.challenge;
    if (!isObject(challenge) || !isObject(challenge.chapters) || !isObject(challenge.verses)) {
      fail('قواعد التحدي', 'يلزم وجود chapters و verses.');
    } else {
      Object.entries(challenge.chapters).forEach(([chapter, rule]) => {
        if (!validChapter(chapter, counts)) fail('قواعد التحدي', `سورة غير صالحة: ${chapter}`);
        if (!isObject(rule)) fail(`السورة ${chapter}`, 'القاعدة يجب أن تكون كائناً.');
        else if (rule.blocked !== undefined) refs(`حظر السورة ${chapter}`, rule.blocked);
      });
      Object.entries(challenge.verses).forEach(([target, rule]) => {
        if (!validRef(target, counts)) fail('قواعد التحدي', `آية غير صالحة: ${target}`);
        if (!isObject(rule)) { fail(`الآية ${target}`, 'القاعدة يجب أن تكون كائناً.'); return; }
        for (const field of ['recommended', 'blocked']) {
          if (rule[field] === undefined) continue;
          refs(`${target} ${field}`, rule[field]);
          if (list(rule[field]).includes(target)) fail(`${target} ${field}`, 'لا تضع الآية نفسها ضمن الخيارات.');
        }
      });
    }

    const map = docs.topics;
    if (!isObject(map) || !Array.isArray(map.topics) || !Array.isArray(map.chains) || !isObject(map.chapterTopics)) {
      fail('خريطة الموضوعات', 'يلزم وجود topics و chains و chapterTopics.');
    } else {
      const topicIds = map.topics.map(item => item.id);
      ids('الموضوعات', topicIds);
      const topicSet = new Set(topicIds);
      map.topics.forEach(topic => {
        if (!topic.name?.trim()) fail(`الموضوع ${topic.id}`, 'الاسم مطلوب.');
        refs(`الموضوع ${topic.id}`, topic.verses);
        if (topic.parentTopicId && !topicSet.has(topic.parentTopicId)) fail(`الموضوع ${topic.id}`, 'الموضوع الأب غير موجود.');
        if (!Array.isArray(topic.links)) fail(`الموضوع ${topic.id}`, 'الروابط يجب أن تكون قائمة.');
        list(topic.links).forEach(link => {
          if (!topicSet.has(link?.targetTopicId)) fail(`الموضوع ${topic.id}`, `رابط لموضوع غير موجود: ${link?.targetTopicId || ''}`);
        });
      });
      map.topics.forEach(topic => {
        const seen = new Set([topic.id]);
        let parent = topic.parentTopicId;
        while (parent) {
          if (seen.has(parent)) { fail(`الموضوع ${topic.id}`, 'حلقة في تداخل الموضوعات.'); break; }
          seen.add(parent);
          parent = map.topics.find(item => item.id === parent)?.parentTopicId;
        }
      });
      ids('المسارات', map.chains.map(item => item.id));
      const oldPairs = new Set();
      const oldByRef = new Map();
      list(originals?.topics?.chains).forEach(chain => list(chain.verses).forEach(ref => {
        const pair = `${chain.id}|${ref}`;
        oldPairs.add(pair);
        oldByRef.set(ref, (oldByRef.get(ref) || 0) + 1);
      }));
      const byRef = new Map();
      map.chains.forEach(chain => {
        if (!chain.title?.trim()) fail(`المسار ${chain.id}`, 'العنوان مطلوب.');
        refs(`المسار ${chain.id}`, chain.verses);
        if (!list(chain.verses).length) fail(`المسار ${chain.id}`, 'اختر آية واحدة على الأقل.');
        list(chain.topicIds).forEach(id => {
          if (topicSet.has(id)) return;
          const unchanged = list(list(originals?.topics?.chains).find(item => item.id === chain.id)?.topicIds).includes(id);
          (unchanged ? warn : fail)(`المسار ${chain.id}`, `موضوع غير موجود${unchanged ? ' (قديم)' : ''}: ${id}`);
        });
        list(chain.verses).forEach(ref => {
          const owners = byRef.get(ref) || [];
          owners.push(chain.id);
          byRef.set(ref, owners);
        });
      });
      byRef.forEach((owners, ref) => {
        if (owners.length < 2) return;
        const inherited = owners.every(id => oldPairs.has(`${id}|${ref}`)) && (oldByRef.get(ref) || 0) >= owners.length;
        if (inherited) warn('المسارات', `تداخل قديم محفوظ عند ${ref}: ${owners.join('، ')}`);
        else fail('المسارات', `تداخل جديد عند ${ref}: ${owners.join('، ')}`);
      });
      Object.entries(map.chapterTopics).forEach(([chapter, value]) => {
        if (!validChapter(chapter, counts)) fail('وسوم السور', `سورة غير صالحة: ${chapter}`);
        list(value?.topicIds).forEach(id => { if (!topicSet.has(id)) fail(`السورة ${chapter}`, `موضوع غير موجود: ${id}`); });
      });
    }

    const searches = docs.searches;
    if (!isObject(searches) || !Array.isArray(searches.items)) fail('البحوث المحفوظة', 'يلزم وجود items.');
    else {
      ids('البحوث المحفوظة', searches.items.map(item => item.id));
      searches.items.forEach(item => {
        if (!item.title?.trim() || !item.query?.trim()) fail(`البحث ${item.id}`, 'العنوان والعبارة مطلوبان.');
      });
    }

    const cinema = docs.cinema;
    if (!isObject(cinema) || !Array.isArray(cinema.items) || !Array.isArray(cinema.templates)) fail('مشاهد السينما', 'يلزم وجود items و templates.');
    else {
      ids('المشاهد والقوالب', [...cinema.items, ...cinema.templates].map(item => item.id));
      [...cinema.items, ...cinema.templates].forEach(item => {
        if (!item.name?.trim()) fail(`المشهد ${item.id}`, 'الاسم مطلوب.');
        if (!['css', 'youtube', 'media', 'svg', 'canvas', 'embed'].includes(item.backgroundType)) fail(`المشهد ${item.id}`, 'نوع خلفية غير معروف.');
        if (item.backgroundType === 'youtube' && !/^[a-zA-Z0-9_-]{8,20}$/.test(String(item.config?.youtubeId || ''))) fail(`المشهد ${item.id}`, 'معرّف YouTube غير صالح.');
        if (item.backgroundType === 'youtube' && item.config?.youtubeUrl) {
          try {
            const url = new URL(item.config.youtubeUrl);
            if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) fail(`المشهد ${item.id}`, 'رابط YouTube يجب أن يكون HTTPS من YouTube.');
          } catch { fail(`المشهد ${item.id}`, 'رابط YouTube غير صالح.'); }
        }
        if (item.backgroundType === 'css' && !validGradient(item.config?.cssBackground)) fail(`المشهد ${item.id}`, 'تدرج CSS غير صالح أو غير آمن.');
        if (item.textStyle?.color && !validColor(item.textStyle.color)) fail(`المشهد ${item.id}`, 'لون النص غير صالح.');
        if (item.textStyle?.fontScale !== undefined && (!Number.isFinite(Number(item.textStyle.fontScale)) || Number(item.textStyle.fontScale) < 0.5 || Number(item.textStyle.fontScale) > 2)) fail(`المشهد ${item.id}`, 'حجم الخط خارج 0.5–2.');
      });
    }

    const discovery = docs.discovery;
    if (!isObject(discovery) || !Array.isArray(discovery.backgrounds)) fail('التصفح', 'يلزم وجود backgrounds.');
    else {
      ids('الخلفيات', discovery.backgrounds.map(item => item.id));
      list(discovery.excludedChapters).forEach(chapter => {
        if (!validChapter(chapter, counts)) fail('استبعاد السور', `سورة غير صالحة: ${chapter}`);
      });
      refs('استبعاد الآيات', discovery.excludedVerses);
      discovery.backgrounds.forEach(item => {
        if (!item.name?.trim()) fail(`الخلفية ${item.id}`, 'الاسم مطلوب.');
        if (item.type === 'image') {
          if (!validAsset(item.image) || !assets.has(`public${item.image}`)) fail(`الخلفية ${item.id}`, 'صورة WebP غير موجودة في المشروع أو الحزمة.');
        } else if (item.type === 'gradient') {
          if (!validGradient(item.gradient)) fail(`الخلفية ${item.id}`, 'تدرج CSS غير صالح أو غير آمن.');
        } else fail(`الخلفية ${item.id}`, 'نوع غير معروف.');
        if (!Array.isArray(item.themes) || !item.themes.some(theme => theme === 'dark' || theme === 'light')) fail(`الخلفية ${item.id}`, 'اختر المظهر الداكن أو الفاتح.');
        for (const key of ['textColor', 'accentColor']) if (!validColor(item[key])) fail(`الخلفية ${item.id}`, `لون ${key} غير صالح.`);
        for (const key of ['focalX', 'focalY', 'shieldX', 'shieldY']) if (!Number.isFinite(Number(item[key])) || Number(item[key]) < 0 || Number(item[key]) > 100) fail(`الخلفية ${item.id}`, `${key} خارج 0–100.`);
        if (!Number.isFinite(Number(item.shieldStrength)) || Number(item.shieldStrength) < 0 || Number(item.shieldStrength) > 0.85) fail(`الخلفية ${item.id}`, 'قوة حماية النص خارج النطاق.');
      });
    }

    const backs = docs.backs;
    if (!isObject(backs) || !Array.isArray(backs.images) || !isObject(backs.verseToImage)) fail('صور الآيات', 'يلزم وجود images و verseToImage.');
    else {
      ids('الصور', backs.images.map(item => item.id));
      const imageIds = new Set(backs.images.map(item => item.id));
      backs.images.forEach(item => {
        if (!validAsset(item.src) || !assets.has(`public${item.src}`)) fail(`الصورة ${item.id}`, 'ملف WebP غير موجود.');
      });
      Object.entries(backs.verseToImage).forEach(([ref, id]) => {
        if (!validRef(ref, counts)) fail('ربط الصور', `آية غير صالحة: ${ref}`);
        if (!imageIds.has(id)) fail(`الصورة ${ref}`, `معرّف صورة غير موجود: ${id}`);
      });
    }

    return { errors, warnings };
  }

  const api = { editableFiles, validRef, validChapter, validAsset, validGradient, validateWorkspace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BuilderValidation = api;
})(typeof window === 'undefined' ? globalThis : window);
