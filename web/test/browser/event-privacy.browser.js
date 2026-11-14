import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const id = '000000000000000000000001';
const title = 'Fictional campus workshop';
const eventsPath = '/api/v1/events';
const receiptPath = eventsPath + '/' + id + '/registrations';
const ownPath = '/api/v1/me/event-registrations';
const event = {
  id, title, description: 'Fixture for browser acceptance testing.',
  venue: 'Fictional auditorium', startsAt: '2099-01-02T10:00:00Z', endsAt: '2099-01-02T11:00:00Z',
  status: 'published', capacity: 3, registrationOpen: true,
};
const names = {a: 'Fixture Student A', b: 'Fixture Student B'};
const email = actor => 'student-' + actor + '@campus.example';

test('real React workspace: two students share event counts, never receipts or rosters', {timeout: 60_000}, async t => {
  const vite = await createServer({
    root, configFile: false, envFile: false,
    define: {'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1')},
    server: {host: '127.0.0.1', port: 0, hmr: false},
  });
  let browser;
  t.after(async () => {
    try { await browser?.close(); } finally { await vite.close(); }
  });
  await vite.listen();
  const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
  browser = await chromium.launch(process.env.CAMPUS_BROWSER_EXECUTABLE
    ? {executablePath: process.env.CAMPUS_BROWSER_EXECUTABLE}
    : {});
  const receipts = new Map();
  const traffic = [];
  const unexpected = [];
  const row = () => ({...event, confirmedCount: receipts.size});
  const send = (route, data, status = 200) => route.fulfill({status, json: {data}});
  const deny = (route, detail) => {
    unexpected.push(detail);
    return route.fulfill({status: 403, json: {error: {message: 'Unexpected fixture request'}}});
  };

  async function pageFor(actor, options = {}) {
    const context = await browser.newContext({serviceWorkers: 'block', ...options});
    await context.route('**/*', async route => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== origin) {
        unexpected.push('non-fixture origin');
        return route.abort();
      }
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname;
      const method = req.method();
      traffic.push({actor, path, method});
      if (req.headers().authorization !== 'Bearer fixture-' + actor) return deny(route, 'wrong fixture persona');
      if (method === 'GET' && path === eventsPath) return send(route, [row()]);
      if (method === 'GET' && path === '/api/v1/announcements') return send(route, []);
      if (method === 'GET' && path === ownPath && actor !== 'organizer') {
        return send(route, receipts.has(actor) ? [receipts.get(actor)] : []);
      }
      if (method === 'GET' && path === '/api/v1/me/organized-events' && actor === 'organizer') {
        return send(route, [row()]);
      }
      if (method === 'POST' && path === receiptPath && actor !== 'organizer') {
        const body = req.postDataJSON();
        if (receipts.has(actor) || body?.universityEmail !== email(actor) || !req.headers()['idempotency-key']) {
          return deny(route, 'invalid registration request');
        }
        const receipt = {id: 'receipt-' + actor, eventId: id, status: 'confirmed', confirmedAt: '2099-01-01T10:00:00Z'};
        receipts.set(actor, receipt);
        return send(route, receipt, 201);
      }
      if (method === 'GET' && path === receiptPath && actor === 'organizer') {
        return send(route, [...receipts].map(([student, receipt]) => ({
          ...receipt, studentName: names[student], universityEmail: email(student), registrationNo: 'FIXTURE-' + student,
        })));
      }
      return deny(route, actor + ' ' + method + ' ' + path);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', () => unexpected.push('uncaught page error for ' + actor));
    await page.goto(origin + '/test/browser/?actor=' + actor);
    return page;
  }

  const navigate = async (page, label) => {
    const button = page.getByRole('navigation').getByRole('button', {name: label});
    const mobileMenu = page.locator('.wc-mobile-menu');
    if (await mobileMenu.isVisible()) await mobileMenu.click();
    await button.click();
  };
  const card = page => page.locator('article').filter({has: page.getByRole('heading', {name: title, exact: true})});
  const seats = (page, count) => card(page).getByText(count + '/3 confirmed', {exact: true}).waitFor();
  const confirm = page => card(page).getByRole('button', {name: '✓ Confirmed', exact: true}).waitFor();
  async function studentView(page, other) {
    await confirm(page);
    assert.equal(await page.getByRole('button', {name: /private attendees|view roster/i}).count(), 0);
    assert.equal(await page.locator('.wc-roster').count(), 0);
    const content = await page.locator('main').innerText();
    assert.ok(!content.includes(names[other]) && !content.includes(email(other)));
  }
  async function ownRegistration(page) {
    await navigate(page, /My registrations/);
    await page.getByRole('heading', {name: 'My confirmed registrations'}).waitFor();
    await page.locator('main').getByText(title, {exact: true}).waitFor();
    assert.equal(await page.locator('main .wc-compact').count(), 1);
  }

  const a = await pageFor('a');
  await navigate(a, /Explore events/);
  await seats(a, 0);
  const [download] = await Promise.all([
    a.waitForEvent('download', {timeout: 10_000}),
    card(a).getByRole('button', {name: 'Add to calendar', exact: true}).click(),
  ]);
  assert.equal(download.suggestedFilename(), 'campusconnect-event-' + id + '.ics');
  const calendar = await readFile(await download.path(), 'utf8');
  assert.match(calendar, /SUMMARY:Fictional campus workshop/);
  assert.match(calendar, /DTSTART:20990102T100000Z/);
  assert.doesNotMatch(calendar, /ATTENDEE:|Fixture Student|receipt-|fixture-a/);
  assert.equal(receipts.size, 0);
  await card(a).getByRole('button', {name: 'Register', exact: true}).click();
  await seats(a, 1);
  await confirm(a);

  const b = await pageFor('b', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  await navigate(b, /Explore events/);
  await seats(b, 1);
  await navigate(b, /My registrations/);
  await b.getByRole('heading', {name: 'Nothing registered yet'}).waitFor();
  await navigate(b, /Explore events/);
  await card(b).getByRole('button', {name: 'Register', exact: true}).click();
  await seats(b, 2);
  await studentView(b, 'a');
  await ownRegistration(b);

  await a.getByRole('button', {name: /Refresh/}).click();
  await seats(a, 2);
  await studentView(a, 'b');
  await ownRegistration(a);

  const organizer = await pageFor('organizer');
  await navigate(organizer, /Organizer studio/);
  await card(organizer).getByRole('button', {name: 'View private attendees'}).click();
  for (const name of Object.values(names)) await organizer.locator('.wc-roster').getByText(name, {exact: true}).waitFor();

  assert.equal(traffic.filter(r => r.path === receiptPath && r.method === 'POST').length, 2);
  assert.deepEqual(traffic.filter(r => r.path === receiptPath && r.method === 'GET').map(r => r.actor), ['organizer']);
  assert.deepEqual(unexpected, []);
});
