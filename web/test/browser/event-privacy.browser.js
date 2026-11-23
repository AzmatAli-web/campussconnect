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
  const societyRows = Array.from({length: 13}, (_, index) => ({
    id: 'robotics-' + (index + 1), name: 'Robotics society ' + (index + 1),
    description: 'Build and learn together.', status: 'active',
  }));
  const memberships = new Map([['a', [{id: 'past-membership-a', societyId: 'archived-fixture',
    societyName: 'Archived fixture group', status: 'left', requestedAt: '2026-01-02T10:00:00Z'}]]]);

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
      if (method === 'GET' && path === '/api/v1/resources') {
        const q=url.searchParams.get('q')?.toLowerCase();
        const semester=url.searchParams.get('semester');
        const matches=(!q||[note.title,note.courseCode,note.fileName].some(v=>v.toLowerCase().includes(q)))
          &&(!semester||semester===String(note.semester));
        return send(route, publishedNote&&matches ? [note] : []);
      }
      if (method === 'GET' && path === '/api/v1/societies' && actor !== 'organizer') {
        if (url.searchParams.get('includeMembership') !== '1') return deny(route, 'missing personal membership option');
        const pageNumber = Number(url.searchParams.get('page'));
        const limit = Number(url.searchParams.get('limit'));
        const q = url.searchParams.get('q');
        const matches = !q || q === 'robotics' ? societyRows : [];
        const data = matches.slice((pageNumber - 1) * limit, pageNumber * limit).map(society => {
          const own = memberships.get(actor)?.find(x => x.societyId === society.id);
          return {...society, membership: own ? {id: own.id, status: own.status} : null};
        });
        return route.fulfill({status: 200, json: {data, meta: {total: matches.length}}});
      }
      if (method === 'GET' && path === '/api/v1/me/society-memberships' && actor !== 'organizer') {
        if (url.searchParams.get('includeSociety') !== '1') return deny(route, 'missing receipt society name');
        const data = memberships.get(actor) ?? [];
        return route.fulfill({status: 200, json: {data, meta: {total: data.length}}});
      }
      if (method === 'POST' && path === '/api/v1/societies/robotics-13/membership-requests' && actor === 'a') {
        assert.deepEqual(req.postDataJSON(), {});
        const receipt = {id: 'pending-membership-a', societyId: 'robotics-13', societyName: 'Robotics society 13',
          status: 'pending', requestedAt: '2026-11-16T10:00:00Z'};
        memberships.set(actor, [receipt, ...memberships.get(actor)]);
        return send(route, receipt, 201);
      }
      if (method === 'GET' && path === '/api/v1/me/saved-resources' && ['a','b'].includes(actor)) {
        return send(route, publishedNote && url.searchParams.get('ids') === note.id ? [note] : []);
      }

      if (method === 'GET' && path === '/api/v1/timetable/groups') return send(route, sections.map(group));
      if (method === 'GET' && path === '/api/v1/timetable/slots') {
        const section = url.searchParams.get('section');
        if (!sections.includes(section)) return deny(route, 'unavailable timetable group requested');
        const primary = {...group(section), id: 'class-' + section, dayOfWeek: 1,
          startTime: '09:00', endTime: '10:30', courseCode: 'CSC494',
          courseTitle: 'Timetable fixture ' + section, instructorName: 'Fixture Teacher', room: 'Room ' + section};
        return send(route, [primary,
          {...primary, id: 'class-next-' + section, startTime: '11:00', endTime: '12:00', courseTitle: 'Later seminar'},
          {...primary, id: 'class-wed-' + section, dayOfWeek: 3, courseTitle: 'Wednesday lecture'}
        ]);
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
  async function checkReflow(page, width){
    await page.setViewportSize({width, height: 844});
    const {scroll,view} = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      view: document.documentElement.clientWidth,
    }));
    assert.ok(view <= width + 1, 'viewport is not sized to the device');
    assert.ok(scroll <= view + 1, 'horizontal overflow at ' + width + ' CSS pixels: ' + scroll + ' > ' + view);
  }
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
  const campusMenu = b.getByRole('button', {name: 'Campus menu', exact: true});
  const campusNav = b.getByRole('navigation', {name: 'Campus workspace'});
  await campusMenu.waitFor();
  assert.equal(await campusNav.count(), 0, 'closed drawer must not appear in the accessibility tree');
  await b.keyboard.press('Tab');
  await b.waitForFunction(() => document.activeElement?.classList.contains('wc-mobile-menu'));
  assert.equal(await campusMenu.getAttribute('aria-expanded'), 'false');
  await b.keyboard.press('Enter');
  await campusNav.waitFor();
  await b.waitForFunction(() => document.activeElement?.getAttribute('aria-current') === 'page');
  assert.equal(await campusMenu.getAttribute('aria-expanded'), 'true');
  await b.keyboard.press('Escape');
  await campusNav.waitFor({state:'hidden'});
  await b.waitForFunction(() => document.activeElement?.classList.contains('wc-mobile-menu'));
  assert.equal(await campusMenu.getAttribute('aria-expanded'), 'false');
  await navigate(b, /Explore events/);
  await seats(b, 1);
  await b.waitForFunction(() => document.activeElement?.tagName === 'H1');
  for(const width of [320,390,768]) await checkReflow(b,width);
  await checkReflow(b,390);
  await checkReflow(a,1366);
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
  await navigate(a, /Societies/);
  const findSocieties = a.getByRole('searchbox', {name: 'Search societies'});
  const history = a.getByRole('region', {name: 'My memberships'});
  await history.getByText('Archived fixture group', {exact: true}).waitFor();
  await findSocieties.fill('robotics');
  await findSocieties.press('Enter');
  await a.getByText('13 societies found', {exact: true}).waitFor();
  await a.getByRole('navigation', {name: 'Society directory pages'}).getByRole('button', {name: 'Next'}).click();
  await a.getByText('Page 2 of 2', {exact: true}).waitFor();
  const society13 = a.locator('article').filter({has: a.getByRole('heading', {name: 'Robotics society 13', exact: true})});
  await society13.getByRole('button', {name: 'Request to join'}).click();
  await society13.getByText('Awaiting review', {exact: true}).waitFor();
  assert.equal(await findSocieties.inputValue(), 'robotics');
  await a.getByText('Page 2 of 2', {exact: true}).waitFor();
  await history.getByText('Robotics society 13', {exact: true}).waitFor();
  await findSocieties.fill('no matches');
  await findSocieties.press('Enter');
  await a.getByRole('heading', {name: 'No societies match your search'}).waitFor();
  await history.getByText('Archived fixture group', {exact: true}).waitFor();
  await navigate(b, /Societies/);
  await b.getByRole('heading', {name: 'No membership history yet'}).waitFor();
  for(const width of [320,390,768]) await checkReflow(b,width);
  await checkReflow(b,390);
  assert.equal(await b.getByText('Archived fixture group', {exact: true}).count(), 0);

  await navigate(a, /Timetable/);
  await showSection(a, 'A');
  // The browser's local time is irrelevant: 04:30 UTC is Monday 09:30 in Karachi.
  await a.clock.setFixedTime(new Date('2026-11-16T04:30:00Z'));
  const timetableView = a.getByRole('group', {name: 'Timetable view'});
  await timetableView.getByRole('button', {name: 'Today', exact: true}).click();
  await a.getByRole('heading', {name: 'Today · Monday'}).waitFor();
  await a.getByText(/In progress · Timetable fixture A · Ends 10:30 PKT/).waitFor();
  await a.getByText(/Next today · Later seminar · 11:00 PKT/).waitFor();
  assert.equal(await a.getByText('Wednesday lecture', {exact: false}).count(), 0);
  await timetableView.getByRole('button', {name: 'Full week'}).click();
  await a.getByText('Wednesday lecture', {exact: false}).waitFor();
  await a.clock.setFixedTime(new Date('2026-11-17T04:30:00Z'));
  await timetableView.getByRole('button', {name: 'Today', exact: true}).click();
  await a.getByText('No classes scheduled for this group today.').waitFor();
  await timetableView.getByRole('button', {name: 'Full week'}).click();
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
  await a.getByLabel('Search notes').fill('fixture');
  await a.locator('.wc-resource-filter select').selectOption('7');
  await a.getByRole('button', {name:'Search',exact:true}).click();
  await a.getByRole('heading', {name:'BSE · Semester 7 · CSC494 (1 PDFs)'}).waitFor();
  await a.getByLabel('Search notes').fill('unmatched phrase');
  await a.getByRole('button', {name:'Search',exact:true}).click();
  await a.getByRole('heading', {name:'No matching course PDFs'}).waitFor();
  await a.getByRole('button', {name:'Clear',exact:true}).click();
  await a.getByRole('button', {name: 'Save note: '+note.title}).waitFor();
  await checkReflow(a,320);
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

  await navigate(a, /Assignment Tracker/);
  await a.getByRole('heading', {name: 'No open assignments'}).waitFor();
  await a.getByLabel('Assignment title').fill('Research outline');
  await a.getByLabel('Course (optional)').fill('CSC494');
  await a.getByLabel('Due date (PKT)').fill('2000-01-02');
  await a.getByRole('button', {name: 'Add assignment'}).click();
  const assignment = a.getByRole('article', {name: 'Research outline'});
  await assignment.getByText('Overdue', {exact:true}).waitFor();
  await checkReflow(a,320);
  await assignment.getByRole('button', {name: 'Edit', exact:true}).click();
  await a.getByLabel('Assignment title').fill('Research outline revised');
  await a.getByRole('button', {name: 'Save changes'}).click();
  const revised = a.getByRole('article', {name: 'Research outline revised'});
  await revised.getByRole('button', {name: 'Mark complete'}).click();
  await a.getByRole('heading', {name: 'No open assignments'}).waitFor();
  await a.reload();
  await navigate(a, /Assignment Tracker/);
  await a.getByLabel('Show assignments').selectOption('completed');
  await revised.getByText('Completed', {exact:true}).waitFor();
  await revised.getByRole('button', {name: 'Reopen'}).click();
  await a.getByLabel('Show assignments').selectOption('open');
  await revised.getByText('Overdue', {exact:true}).waitFor();
  await navigate(sameBrowserB, /Assignment Tracker/);
  await sameBrowserB.getByRole('heading', {name: 'No open assignments'}).waitFor();
  assert.equal(await sameBrowserB.getByText('Research outline revised').count(),0);
  assert.equal(await organizer.getByRole('button', {name:'Assignment Tracker'}).count(),0);
  await revised.getByRole('button', {name:'Remove', exact:true}).click();
  await revised.getByRole('button', {name:'Confirm removal'}).click();
  await a.getByRole('heading', {name:'No open assignments'}).waitFor();

  await navigate(a, /Study Planner/);
  await a.getByRole('heading', {name: 'Weekly study goals'}).waitFor();
  await a.getByLabel('Study goal', {exact:true}).fill('Review chapter for quiz');
  await a.getByRole('button', {name:'Add weekly goal'}).click();
  await a.getByText('Review chapter for quiz',{exact:true}).waitFor();
  await a.getByRole('button',{name:'Mark complete',exact:true}).click();
  await a.getByText(/1 of 1 goals completed/).waitFor();
  await a.reload();
  await navigate(a, /Study Planner/);
  await a.getByText(/1 of 1 goals completed/).waitFor();
  await checkReflow(a,320);
  await navigate(sameBrowserB, /Study Planner/);
  await sameBrowserB.getByText('No study goals yet for this week.').waitFor();
  assert.equal(await sameBrowserB.getByText('Review chapter for quiz',{exact:true}).count(),0);
  await navigate(a, /Overview/);
  await a.getByRole('region',{name:'Weekly study progress'}).getByText(/1 of 1 weekly goals completed/).waitFor();
  await navigate(a, /Study Planner/);
  await a.getByRole('button',{name:'Remove goal: Review chapter for quiz'}).click();
  await a.getByText('No study goals yet for this week.').waitFor();

  await navigate(a, /Campus Calendar/);
  await a.getByRole('heading', {name:'Unified campus calendar'}).waitFor();
  await a.getByRole('button', {name:'Week',exact:true}).click();
  assert.equal(await a.getByRole('group',{name:'Week dates'}).getByRole('button').count(),7);
  await a.getByRole('button', {name:'Month',exact:true}).click();
  assert.equal(await a.getByRole('group',{name:'Month dates'}).getByRole('button').count(),42);
  await a.getByRole('button', {name:'Next month'}).click();
  await a.getByRole('button', {name:'Today',exact:true}).click();
  await a.getByRole('group',{name:'Calendar categories'}).getByLabel('Campus event').uncheck();
  await a.getByRole('group',{name:'Calendar categories'}).getByLabel('Campus event').check();
  await a.getByRole('region',{name:'Selected day agenda'}).waitFor();
  await checkReflow(a,320);
  await navigate(sameBrowserB, /Campus Calendar/);
  await sameBrowserB.getByRole('heading', {name:'Unified campus calendar'}).waitFor();
  assert.equal(await organizer.getByRole('button', {name:'Campus Calendar'}).count(),0);

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
