import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {startAdminLab} from '../../scripts/admin-lab.js';

test('Admin Lab uses real UI and API with disposable records', {timeout: 180_000}, async t => {
  const lab = await startAdminLab({port: 0});
  t.after(lab.close);
  const api = path => lab.url + '/api/v1' + path;
  const student = {authorization: 'Bearer lab-student'};
  const admin = {authorization: 'Bearer lab-admin'};
  assert.equal((await fetch(api('/admin/users'))).status, 401);
  assert.equal((await fetch(api('/admin/users'), {headers: student})).status, 403);
  assert.equal((await fetch(api('/admin/users'), {headers: {...admin, origin: 'http://localhost:5173'}})).status, 403);
  const event = (await (await fetch(api('/events'), {headers: student})).json()).data[0];
  const roster = '/events/' + event.id + '/registrations';
  assert.equal((await fetch(api(roster), {headers: student})).status, 403);
  assert.equal((await fetch(api(roster), {headers: admin})).status, 200);

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({serviceWorkers: 'block'});
  const unexpected = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === lab.url) return route.continue();
    unexpected.push('non-lab request');
    return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => unexpected.push(error.message));
  await page.goto(lab.url);
  const navigation = page.locator('.wc-sidebar nav');
  const administration = () => navigation.getByRole('button', {name: /Administration/});
  await administration().click();
  await page.getByText('Restricted Admin workspace', {exact: true}).waitFor();
  await page.getByRole('button', {name: /View roster/}).click();
  await page.locator('.wc-roster').getByText('Test Student', {exact: true}).waitFor();

  const society = page.locator('section').filter({has: page.getByRole('heading', {name: 'Create society', exact: true})});
  await society.getByLabel('Name', {exact: true}).fill('Test Computing Society');
  await society.getByLabel('Slug', {exact: true}).fill('test-computing-society');
  await society.getByLabel('Purpose', {exact: true}).fill('A fictional society for local admin checks.');
  await society.getByRole('button', {name: 'Create society', exact: true}).click();
  await page.getByText('Campus society created.', {exact: true}).waitFor();
  const log = await fetch(api('/admin/audit-logs'), {headers: admin});
  assert.equal(log.status, 200);
  assert.ok((await log.json()).data.some(entry => entry.action === 'society.initial.created'));

  await page.getByRole('link', {name: 'Test Student', exact: true}).click();
  await navigation.getByRole('button', {name: /Explore events/}).click();
  await page.getByRole('heading', {name: 'Fictional campus workshop'}).waitFor();
  assert.equal(await administration().count(), 0);
  assert.equal(await page.getByRole('button', {name: /View roster|private attendees/i}).count(), 0);
  // Publish through the admin interface, answer through the student interface,
  // then check that an already-displayed citation respects withdrawal.
  const question = 'Where is the fictional release rehearsal?';
  const answer = 'The release rehearsal takes place in the fictional east hall.';
  const editor = await context.newPage();
  await editor.goto(lab.url);
  await editor.locator('.wc-sidebar nav').getByRole('button', {name: /Administration/}).click();
  const panel = editor.locator('section').filter({has: editor.getByRole('heading', {name: 'Assistant knowledge sources', exact: true})}).last();
  await panel.getByLabel('Title', {exact: true}).fill(question);
  await panel.getByLabel('Source reference').fill('Fictional release handbook, page 1');
  await panel.getByLabel('Source text').fill(answer);
  await panel.getByRole('button', {name: 'Save draft'}).click();
  const entry = panel.locator('details').filter({hasText: question});
  await entry.locator('summary').click();
  await entry.getByRole('button', {name: 'Approve source'}).click();
  await panel.getByText('Source approved for the selected audience.').waitFor();

  await navigation.getByRole('button', {name: /Campus assistant/}).click();
  await page.getByLabel('Ask about campus').fill(question);
  await page.getByRole('button', {name: 'Ask assistant', exact: true}).click();
  await page.locator('blockquote').getByText(answer, {exact:true}).waitFor();
  await page.getByRole('button', {name: 'View cited source'}).click();
  await page.getByRole('heading', {name: question, exact:true}).waitFor();
  await entry.getByRole('button', {name: 'Withdraw source'}).click();
  await panel.getByText('Source withdrawn.').waitFor();
  await page.getByRole('button', {name: 'View cited source'}).click();
  await page.getByText('Source unavailable', {exact:true}).waitFor();
  assert.equal(await page.getByText(answer,{exact:true}).count(),0);
  assert.deepEqual(unexpected, []);
});
