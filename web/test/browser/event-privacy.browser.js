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
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1'),
      'import.meta.env.VITE_ENABLE_TEST_LAB': JSON.stringify('true'),
    },
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
  let sampleHistory = false;
  const traffic = [];
  const note = {id: '000000000000000000000051', title: 'Fixture project notes', program: 'BSE', semester: 7,
    courseCode: 'CSC494', fileName: 'notes.pdf', status: 'published', sizeBytes: 1000};
  let publishedNote = true;

  let sections = ['A', 'B'];
  const group = section => ({term: 'Fall 2026', program: 'BSE', semester: 7, section});
  const sectionLabel = section => 'Fall 2026 · BSE · Semester 7 · Section ' + section;
  const unexpected = [];
  const row = () => ({...event, confirmedCount: receipts.size});
  const send = (route, data, status = 200) => route.fulfill({status, json: {data}});
  const deny = (route, detail) => {
    unexpected.push(detail);
    return route.fulfill({status: 403, json: {error: {message: 'Unexpected fixture request'}}});
  };

  async function pageFor(actor, options = {}, sharedContext) {
    const context = sharedContext ?? await browser.newContext({serviceWorkers: 'block', ...options});
    const page = await context.newPage();
    await page.route('**/*', async route => {
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
      if (method === 'GET' && path === eventsPath) {
        const pageNumber = Number(url.searchParams.get('page') || 1);
        const when = url.searchParams.get('when');
        const q = url.searchParams.get('q');
        if (!when) return send(route, [row()]);
        const historic = {...row(), id: '000000000000000000000081', title: 'Past science fair',
          startsAt: '2000-01-01T10:00:00Z', endsAt: '2000-01-01T11:00:00Z', registrationOpen: false};
        const matches = q === 'auditorium'
          ? (pageNumber === 1 ? [row()] : [{...row(), title: 'Second page campus workshop'}])
          : q ? [] : when === 'past' ? [historic] : [row()];
        return route.fulfill({status: 200, json: {data: matches, meta: {total: q === 'auditorium' ? 13 : matches.length}}});
      }
      if (method === 'GET' && path === '/api/v1/announcements') {
        const scope = url.searchParams.get('scope');
        if (!scope) return send(route, []);
        const q = url.searchParams.get('q');
        const second = url.searchParams.get('page') === '2';
        const notes = scope === 'society' || q === 'no such notice' ? [] : [{
          id: 'fixture-announcement-' + (second ? '2' : '1'),
          title: second ? 'Second page exam notice' : 'Exam schedule',
          body: 'Fictional exam announcement', scope: 'department', publishedAt: '2026-10-01T10:00:00Z'
        }];
        return route.fulfill({status: 200, json: {data: notes, meta: {total: notes.length ? 13 : 0}}});
      }
      if (method === 'GET' && path === '/api/v1/resources') return send(route, publishedNote ? [note] : []);
      if (method === 'GET' && path === '/api/v1/me/saved-resources' && ['a','b'].includes(actor)) {
        return send(route, publishedNote && url.searchParams.get('ids') === note.id ? [note] : []);
      }

      if (method === 'GET' && path === '/api/v1/timetable/groups') return send(route, sections.map(group));
      if (method === 'GET' && path === '/api/v1/timetable/slots') {
        const section = url.searchParams.get('section');
        if (!sections.includes(section)) return deny(route, 'unavailable timetable group requested');
        return send(route, [{...group(section), id: 'class-' + section, dayOfWeek: 1,
          startTime: '09:00', endTime: '10:30', courseCode: 'CSC494',
          courseTitle: 'Timetable fixture ' + section, instructorName: 'Fixture Teacher', room: 'Room ' + section}]);
      }
      if (method === 'GET' && path === ownPath && actor !== 'organizer') {
        const receipt = receipts.get(actor);
        if (!url.searchParams.has('includeEvent')) return send(route, receipt ? [receipt] : []);
        let rows = receipt ? [{...receipt, event: row()}] : [];
        let total = rows.length;
        if (sampleHistory && actor === 'a') {
          total = 13;
          rows = url.searchParams.get('page') === '2' ? [{
            ...receipt, id: 'receipt-old-a', event: {...event, title: 'Old campus fair',
              endsAt: '2000-01-01T11:00:00Z', startsAt: '2000-01-01T10:00:00Z'}
          }] : [{...receipt, event: {...event, title: 'Cancelled campus workshop', status: 'cancelled'}}];
        }
        return route.fulfill({status: 200, json: {data: rows, meta: {total}}});
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
    page.setDefaultTimeout(10_000);
    page.on('pageerror', () => unexpected.push('uncaught page error for ' + actor));
    await page.goto(origin + '/test/browser/?actor=' + actor);
    return page;
  }

  const navigate = async (page, label) => {
    const button = page.locator('.wc-sidebar nav').getByRole('button', {name: label});
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
    // Check the expected row and count in one DOM snapshot after the tab's async load.
    await page.waitForFunction(expected => {
      const rows = document.querySelectorAll('main .wc-compact');
      return rows.length === 1 && rows[0].querySelector('strong')?.textContent === expected;
    }, title);
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
  const schedule = page => page.getByRole('combobox', {name: 'Available class group'});
  const showSection = async (page, section) => {
    await page.getByText('Timetable fixture ' + section, {exact: false}).waitFor();
    assert.equal(await schedule(page).inputValue(), JSON.stringify(Object.values(group(section))));
  };
  await navigate(a, /Timetable/);
  await showSection(a, 'A');
  await schedule(a).selectOption({label: sectionLabel('B')});
  await showSection(a, 'B');
  await navigate(a, /Explore events/);
  await navigate(a, /Timetable/);
  await showSection(a, 'B');
  await a.reload();
  await navigate(a, /Timetable/);
  await showSection(a, 'B');

  const sameBrowserB = await pageFor('b', {}, a.context());
  await navigate(sameBrowserB, /Timetable/);
  await showSection(sameBrowserB, 'A');
  sections = ['A'];
  await a.reload();
  await navigate(a, /Timetable/);
  await showSection(a, 'A');

  await navigate(a, /Academic Resources/);
  await a.getByRole('button', {name: 'Save note: '+note.title}).click();
  await a.reload();
  await navigate(a, /Academic Resources/);
  await a.getByRole('button', {name: 'Saved notes (1)', exact: true}).click();
  await a.getByRole('heading', {name: note.title}).waitFor();

  await navigate(sameBrowserB, /Academic Resources/);
  await sameBrowserB.getByRole('button', {name: 'Saved notes (0)', exact: true}).click();
  await sameBrowserB.getByText('No saved notes yet.', {exact: false}).waitFor();

  publishedNote = false;
  await a.getByRole('button', {name: 'All notes', exact: true}).click();
  await a.getByRole('button', {name: 'Saved notes (1)', exact: true}).click();
  await a.getByText(/1 saved note is no longer available/).waitFor();
  assert.equal(await a.getByRole('button', {name: 'Download PDF', exact: true}).count(), 0);
  await a.getByRole('button', {name: 'Remove unavailable bookmarks', exact: true}).click();
  await a.getByRole('button', {name: 'Saved notes (0)', exact: true}).waitFor();

  await navigate(a, /Explore events/);
  await a.getByLabel('Search events').fill('auditorium');
  await a.getByRole('button', {name: 'Search', exact: true}).click();
  const eventsPagination = a.getByRole('navigation', {name: 'Event pages'});
  await eventsPagination.getByText(/Page 1 of 2/).waitFor();
  await eventsPagination.getByRole('button', {name: 'Next', exact: true}).click();
  await a.getByRole('heading', {name: 'Second page campus workshop'}).waitFor();
  await eventsPagination.getByText(/Page 2 of 2/).waitFor();
  await a.getByRole('button', {name: 'Clear filters'}).click();
  await a.getByLabel('Event timing').selectOption('past');
  await a.getByRole('heading', {name: 'Past science fair'}).waitFor();
  assert.equal(await a.getByRole('button', {name: 'Add to calendar'}).count(), 0);
  await a.getByLabel('Search events').fill('no such event');
  await a.getByRole('button', {name: 'Search', exact: true}).click();
  await a.getByRole('heading', {name: 'No matching events'}).waitFor();

  const catalogReads = traffic.filter(r => r.actor === 'a' && r.path === eventsPath && r.method === 'GET').length;
  sampleHistory = true;
  await navigate(a, /My registrations/);
  await a.getByText('Cancelled campus workshop', {exact: true}).waitFor();
  await a.getByText('Event cancelled', {exact: true}).waitFor();
  const registrationPages = a.getByRole('navigation', {name: 'Registration pages'});
  await registrationPages.getByRole('button', {name: 'Next', exact: true}).click();
  await a.getByText('Old campus fair', {exact: true}).waitFor();
  await a.getByText('Past event', {exact: true}).waitFor();
  assert.equal(traffic.filter(r => r.actor === 'a' && r.path === eventsPath && r.method === 'GET').length, catalogReads);

  await navigate(a, /Announcements/);
  await a.getByRole('heading', {name: 'Exam schedule'}).waitFor();
  await a.getByLabel('Audience', {exact: true}).selectOption('department');
  await a.getByLabel('Search announcements').fill('exam');
  await a.getByRole('button', {name: 'Search', exact: true}).click();
  const announcementPages = a.getByRole('navigation', {name: 'Announcement pages'});
  await announcementPages.getByRole('button', {name: 'Next', exact: true}).click();
  await a.getByRole('heading', {name: 'Second page exam notice'}).waitFor();
  await announcementPages.getByText(/Page 2 of 2/).waitFor();
  await a.getByLabel('Audience', {exact: true}).selectOption('society');
  await a.getByRole('heading', {name: 'No matching announcements'}).waitFor();
  await a.getByRole('button', {name: 'Clear filters'}).click();
  await a.getByRole('heading', {name: 'Exam schedule'}).waitFor();

  const demo = await browser.newContext({serviceWorkers: 'block'});
  await demo.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
    unexpected.push('nonlocal or API request from the credential-free demo');
    return route.abort();
  });
  const lab = await demo.newPage();
  lab.setDefaultTimeout(10_000);
  lab.on('pageerror', () => unexpected.push('uncaught demo page error'));
  await lab.goto(origin + '/?test-lab=1');
  await lab.getByText('Test environment — not a real login').waitFor();
  const nav = lab.getByRole('navigation', {name: 'Lab navigation'});
  await nav.getByRole('button', {name: /Timetable/}).click();
  await lab.getByText('Monday · 09:00–10:30', {exact: true}).waitFor();
  await lab.getByLabel('Class group').selectOption('b');
  await lab.getByText('Tuesday · 10:00–11:30', {exact: true}).waitFor();
  assert.equal(await lab.getByText('Monday · 09:00–10:30', {exact: true}).count(), 0);

  await nav.getByRole('button', {name: /Faculty notes/}).click();
  await lab.getByText('Preview sample notes', {exact: true}).click();
  await lab.getByText(/The critical path is the longest dependency path/).waitFor();

  await lab.getByRole('button', {name: /Demo Student 1/}).click();
  await nav.getByRole('button', {name: /Events/}).click();
  await lab.getByRole('button', {name: 'Register', exact: true}).click();
  await lab.getByText(/Your own registration is confirmed/).waitFor();
  await lab.getByRole('button', {name: /Demo Student 2/}).click();
  await lab.getByText('1 / 3 confirmed', {exact: true}).waitFor();
  assert.equal(await lab.getByText(/Your own registration is confirmed|Private attendee list/).count(), 0);
  await lab.getByRole('button', {name: /Reset all demo data/}).click();
  await nav.getByRole('button', {name: /Events/}).click();
  await lab.getByText('0 / 3 confirmed', {exact: true}).waitFor();
  assert.deepEqual(unexpected, []);
});
