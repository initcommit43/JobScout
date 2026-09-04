import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkedinAdapter, parseDetailPage, parseSearchResults } from '../scrapers/linkedin.ts';
import { fixtureText } from './helpers/fixture-datei.ts';
import { fixtureScrapedJob } from './helpers/job-fixtures.ts';

test('die suchergebnisse liefern stellen mit titel, firma und url', async () => {
  const jobs = parseSearchResults(await fixtureText('linkedin', 'search.html'));

  assert.ok(jobs.length > 0);
  for (const job of jobs) {
    assert.equal(job.source, 'linkedin');
    assert.ok(job.title.length > 0);
    assert.ok(job.company.length > 0);
    assert.match(job.url, /^https:\/\//);
  }
});

test('tracking-parameter werden von der url abgeschnitten', async () => {
  const jobs = parseSearchResults(await fixtureText('linkedin', 'search.html'));

  for (const job of jobs) {
    assert.doesNotMatch(job.url, /\?/, 'sonst sieht dieselbe Stelle bei jedem Lauf neu aus');
  }
});

test('entities in titel und firma werden aufgeloest', () => {
  const html = [
    '<li>',
    '<a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/1?trk=x">',
    '<h3 class="base-search-card__title">Entwickler &amp; Architekt</h3>',
    '<h4 class="base-search-card__subtitle"><a>Fischer &amp; Sohn</a></h4>',
    '<span class="job-search-card__location">Wien, Österreich</span>',
    '<time class="job-search-card__listdate" datetime="2026-03-01"></time>',
  ].join('');

  const jobs = parseSearchResults(html);

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]?.title, 'Entwickler & Architekt');
  assert.equal(jobs[0]?.company, 'Fischer & Sohn');
  assert.equal(jobs[0]?.location, 'Wien, Österreich');
  assert.equal(jobs[0]?.url, 'https://www.linkedin.com/jobs/view/1');
  assert.equal(jobs[0]?.postedAt, '2026-03-01');
});

test('eine karte ohne titel oder firma wird uebersprungen', () => {
  const html =
    '<li><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/1"></a></li>';
  assert.deepEqual(parseSearchResults(html), []);
});

test('leeres html ergibt keine treffer', () => {
  assert.deepEqual(parseSearchResults(''), []);
});

test('die suchergebnisse tragen noch keine beschreibung', async () => {
  const jobs = parseSearchResults(await fixtureText('linkedin', 'search.html'));
  assert.ok(jobs.every((job) => job.description === ''), 'die kommt erst von der Detailseite');
});

test('die detailseite liefert die beschreibung ohne markup', async () => {
  const basis = fixtureScrapedJob({ source: 'linkedin', description: '' });
  const job = parseDetailPage(await fixtureText('linkedin', 'detail.html'), basis);

  assert.ok(job.description.length > 0);
  assert.doesNotMatch(job.description, /<[a-z]/i);
});

test('ohne beschreibungsblock bleibt der basis-job unveraendert', () => {
  const basis = fixtureScrapedJob({ source: 'linkedin' });

  assert.deepEqual(parseDetailPage('<html><body>nichts</body></html>', basis), basis);
  assert.deepEqual(parseDetailPage('', basis), basis);
});

test('linkedin laeuft ueber plain http, nicht ueber playwright', () => {
  assert.equal(linkedinAdapter.kind, 'fetch');

  const felder = Object.fromEntries(linkedinAdapter.querySchema.map((feld) => [feld.key, feld]));
  assert.equal(felder['keyword']?.format, 'text', 'ein Slug wuerde woertlich mit Bindestrichen gesucht');
  assert.equal(felder['location']?.required, false);
});
