const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.RECOMMENDATION_TEST_ROOT || path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const categories = ['Quran', 'Hadith', 'Daily Duas', 'Seerah', 'Fiqh', 'Short Reminders', 'Scholar Lectures'];
function load(file, modules = {}, globals = {}) {
  const context = { exports: {}, Date, console, setTimeout, clearTimeout, ...globals, require: (name) => {
    if (!(name in modules)) throw new Error('Unmocked import: ' + name);
    return modules[name];
  } };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib', file + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, context);
  return context.exports;
}
const learning = load('feedLearning');
const algorithm = load('feedAlgorithm', { './feedLearning': learning, '@/src/types': { ISLAMIC_CATEGORIES: categories } });
const now = Date.now();
const post = (id, category = 'Quran', author = id) => ({ id, category, userId: author, isApproved: true, reportsCount: 0, likesCount: 0, savesCount: 0, sharesCount: 0, viewsCount: 0, createdAt: { toMillis: () => now } });
const profile = { interests: ['Quran'] };

test('selected interests rank first even with no engagement; popularity is bounded', () => {
  const preferred = post('interest');
  const viral = { ...post('viral', 'Fiqh'), likesCount: 1000000 };
  const ranked = algorithm.sortFeed([viral, preferred], profile, new Set(), undefined, now);
  assert.equal(ranked[0].id, 'interest');
  assert.ok(algorithm.scorePost(preferred, profile, new Set(), undefined, now) > 0);
});
test('learning deduplicates, reverses likes/saves and decays old interests', () => {
  const item = post('learn', 'Hadith');
  const empty = learning.emptyFeedSignals();
  const liked = learning.applyFeedAction(empty, item, 'like', now);
  assert.equal(liked.categories.Hadith.score, 4);
  assert.equal(learning.applyFeedAction(liked, item, 'like', now), liked);
  const undo = learning.applyFeedAction(liked, item, 'like', now, false);
  assert.equal(undo.categories.Hadith.score, 0);
  const saved = learning.applyFeedAction(liked, item, 'save', now);
  assert.equal(saved.categories.Hadith.score, 11);
  assert.equal(learning.applyFeedAction(saved, item, 'save', now, false).categories.Hadith.score, 4);
  assert.equal(learning.interestValue(liked.categories.Hadith, now + 14 * 86400000), 2);
  assert.equal(learning.applyFeedAction(liked, item, 'like', now + 14 * 86400000, false).categories.Hadith.score, 0);
  assert.equal(algorithm.preferredCategories(null, liked, now)[0], 'Hadith');
  const viewed = learning.applyFeedAction(empty, item, 'view', now);
  assert.equal(learning.applyFeedAction(viewed, item, 'view', now), viewed);
  assert.ok(learning.applyFeedAction(viewed, item, 'view', now + 86400000).categories.Hadith.score > 1);
});
test('discovery is 25 percent when candidates exist; no duplicates or moderated posts', () => {
  const input = [...Array.from({ length: 20 }, (_, i) => post('preferred' + i)), ...Array.from({ length: 10 }, (_, i) => post('other' + i, 'Fiqh'))];
  input.push(input[0], { ...post('hidden'), isApproved: false }, { ...post('reported'), reportsCount: 5 });
  const page = algorithm.selectFeedPage(input, profile, new Set(), undefined, 12, now);
  assert.equal(page.length, 12);
  assert.equal(page.filter((item) => item.category === 'Quran').length, 9);
  assert.equal(page.filter((item) => item.category === 'Fiqh').length, 3);
  assert.equal(new Set(page.map((item) => item.id)).size, 12);
  assert.ok(page.slice(0, 3).every((item) => item.category === 'Quran'));
  const oneSide = algorithm.selectFeedPage(input.filter((item) => item.category === 'Fiqh'), profile, new Set(), undefined, 12, now);
  assert.equal(oneSide.length, 10, 'Scarce interests must not leave an empty feed');
});
test('seen posts lose priority, reports are excluded and new learned categories gain priority', () => {
  let signals = learning.applyFeedAction(learning.emptyFeedSignals(), post('seen'), 'view', now);
  signals = learning.applyFeedAction(signals, post('avoid'), 'report', now);
  const ranked = algorithm.sortFeed([post('seen'), post('fresh'), post('avoid')], profile, new Set(), signals, now);
  assert.equal(ranked[0].id, 'fresh');
  assert.equal(ranked.some((item) => item.id === 'avoid'), false);
  signals = learning.applyFeedAction(signals, post('saved', 'Hadith'), 'save', now);
  assert.ok(algorithm.scorePost(post('new-hadith', 'Hadith'), profile, new Set(), signals, now) > algorithm.scorePost(post('new-fiqh', 'Fiqh'), profile, new Set(), signals, now));
});
test('avoid three consecutive posts from one author when alternatives exist', () => {
  const input = [...Array.from({ length: 10 }, (_, i) => post('a' + i, 'Quran', 'author-a')), ...Array.from({ length: 8 }, (_, i) => post('b' + i, 'Quran', 'author-b'))];
  const page = algorithm.selectFeedPage(input, profile, new Set(), undefined, 12, now);
  for (let i = 2; i < page.length; i++) assert.ok(!(page[i].userId === page[i - 1].userId && page[i].userId === page[i - 2].userId));
});

function engine(dataset, fail = '') {
  const requests = [];
  const sdk = {
    collection: () => 'posts', where: (...args) => ({ where: args }), orderBy: () => ({}), startAfter: (item) => ({ after: item.id }), limit: (value) => ({ limit: value }), query: (...args) => args,
    async getDocs(request) {
      requests.push(request);
      const conditions = request.filter((part) => part?.where).map((part) => part.where);
      const targeted = conditions.some(([field]) => field === 'category' || field === 'userId');
      if (fail === 'all' || (fail === 'targeted' && targeted)) throw new Error('read failed');
      let values = dataset.filter((item) => conditions.every(([field, op, value]) => op === 'in' ? value.includes(item[field]) : item[field] === value));
      const cursor = request.find((part) => part?.after)?.after;
      if (cursor) values = values.slice(values.findIndex((item) => item.id === cursor) + 1);
      values = values.slice(0, request.find((part) => part?.limit)?.limit ?? 12);
      return { size: values.length, docs: values.map((value) => ({ id: value.id, data: () => value })) };
    },
  };
  const api = load('recommendationFeed', { 'firebase/firestore': sdk, '@/src/lib/firebase': { db: {} }, './feedAlgorithm': algorithm });
  return { feed: new api.RecommendationFeed(), requests };
}
test('candidate retrieval finds older interests, appends without duplicates and exhausts', async () => {
  const dataset = [...Array.from({ length: 45 }, (_, i) => post('other-' + i, 'Fiqh')), ...Array.from({ length: 25 }, (_, i) => post('interest-' + i))];
  const { feed, requests } = engine(dataset);
  const context = { profile, following: new Set(), signals: learning.emptyFeedSignals() };
  const first = await feed.next(context);
  assert.equal(first.posts.filter((item) => item.category === 'Quran').length, 9, 'Reach beyond the newest 36 candidates');
  const ids = new Set(first.posts.map((item) => item.id));
  const originalOrder = first.posts.map((item) => item.id).join(',');
  let result = first;
  for (let round = 0; round < 20 && result.hasMore; round++) {
    result = await feed.next(context);
    for (const item of result.posts) { assert.equal(ids.has(item.id), false); ids.add(item.id); }
  }
  assert.equal(result.hasMore, false);
  assert.equal(ids.size, dataset.length);
  assert.equal(first.posts.map((item) => item.id).join(','), originalOrder);
  assert.ok(requests.some((request) => request.some((part) => part?.after)));
});
test('failed interest indexes fall back; all failed reads remain retryable', async () => {
  const fallback = engine(Array.from({ length: 15 }, (_, i) => post(String(i))), 'targeted');
  const result = await fallback.feed.next({ profile, following: new Set() });
  assert.equal(result.partial, true);
  assert.equal(result.posts.length, 12);
  const failed = engine([], 'all');
  await assert.rejects(() => failed.feed.next({ profile, following: new Set() }), /Could not load/);
  await assert.rejects(() => failed.feed.next({ profile, following: new Set() }), /Could not load/);
});
test('learning is isolated per account, ignores self interactions, and persists after debounce', async () => {
  const storage = new Map(), timers = new Map(), writes = [];
  let id = 0;
  const auth = { currentUser: { uid: 'alice' } };
  const service = load('feedSignals', {
    'firebase/firestore': { doc: (...args) => args.join('/'), updateDoc: async (...args) => { writes.push(args); } },
    '@/src/lib/firebase': { auth, db: 'db' }, './feedLearning': learning,
  }, { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, setTimeout: (fn) => { timers.set(++id, fn); return id; }, clearTimeout: (key) => timers.delete(key) });
  service.recordFeedSignal('alice', post('own', 'Quran', 'alice'), 'save');
  assert.equal(service.getFeedSignals('alice').updatedAt, 0);
  service.recordFeedSignal('alice', post('read', 'Hadith'), 'save');
  service.recordFeedSignal('alice', post('read', 'Hadith'), 'save');
  assert.equal(service.getFeedSignals('alice').categories.Hadith.score, 7);
  assert.equal(service.getFeedSignals('bob').updatedAt, 0);
  assert.ok(storage.has('noorfeed:interests:v1:alice'));
  for (const fn of [...timers.values()]) fn();
  await Promise.resolve();
  assert.equal(writes.length, 1);
  auth.currentUser = { uid: 'bob' };
  service.recordFeedSignal('alice', post('blocked'), 'like');
  assert.equal(service.getFeedSignals('alice').categories.Quran, undefined);
});
