// End-to-end smoke test. Needs a running server and one admin account:
//   PGLITE_DIR=/tmp/ps-e2e npm run create-admin -- "Sup" sup@example.com password1
//   PGLITE_DIR=/tmp/ps-e2e npm run dev
//   E2E_EMAIL=sup@example.com E2E_PASSWORD=password1 npm run e2e
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "sup@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "password1";
const SHOT = process.env.E2E_SCREENSHOT_DIR;
const PX = 12; // pixels per day at the default "Bulan" zoom
const DAY = 864e5;

const shot = (page, name) => (SHOT ? page.screenshot({ path: `${SHOT}/${name}.png`, fullPage: true }) : null);
const board = (page) => page.locator('[data-testid="timeline-board"]');
const bar = (page, name) => page.locator(`[data-item-id][aria-label^="${name},"]`);
const confirmBar = (page) => page.locator('[role="dialog"][aria-label="Konfirmasi perubahan jadwal"]');
const toast = (page, text) => page.locator('[role="status"]', { hasText: text });

async function login(page, email, password) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("button:has-text('Masuk')");
}

/** Scrolls the board so the bar is clear of the sticky name column, returns its box. */
async function reveal(page, name) {
  const b = bar(page, name);
  await b.evaluate((el) => {
    const s = el.closest('[data-testid="timeline-board"]');
    s.scrollLeft = Math.max(0, parseFloat(el.style.left) - 200);
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    s.scrollLeft = Math.max(0, parseFloat(el.style.left) - 200);
  });
  return b.boundingBox();
}

/** Real mouse drag. where: "middle" moves the bar, "end" drags its right edge. Leaves the mouse down if hold. */
async function drag(page, name, days, { where = "middle", hold = false } = {}) {
  const box = await reveal(page, name);
  const x = where === "end" ? box.x + box.width - 2 : box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + days * PX, y, { steps: 8 });
  if (!hold) await page.mouse.up();
}

/** Due date of an item, read from the detail drawer (supervisor only). */
async function dueOf(page, name) {
  await board(page).locator(`button:text-is("${name}")`).click();
  const v = await page.inputValue('aside input[name="dueDate"]');
  await page.keyboard.press("Escape");
  await page.locator("aside[role=dialog]").waitFor({ state: "detached" });
  return v;
}
const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY;

(async () => {
  const browser = await chromium.launch();
  const desktop = { viewport: { width: 1440, height: 900 } };
  const sup = await (await browser.newContext(desktop)).newPage();
  sup.on("dialog", (d) => d.accept());
  const errors = [];
  sup.on("pageerror", (e) => errors.push(e.message));
  const name = `E2E Film ${Date.now()}`;

  // ---- first-run setup (only when E2E_SETUP_KEY is given: fresh database, no account yet) ----
  if (process.env.E2E_SETUP_KEY) {
    await sup.goto(`${BASE}/setup`);
    await sup.fill('input[name="key"]', "kunci-salah");
    await sup.fill('input[name="name"]', "Jalu");
    await sup.fill('input[name="email"]', EMAIL);
    await sup.fill('input[name="password"]', PASSWORD);
    await sup.click("button:has-text('Buat akun')");
    await sup.waitForSelector("text=Setup key salah.");
    await sup.fill('input[name="key"]', process.env.E2E_SETUP_KEY);
    await sup.fill('input[name="name"]', "Jalu");
    await sup.fill('input[name="email"]', EMAIL);
    await sup.fill('input[name="password"]', PASSWORD);
    await sup.click("button:has-text('Buat akun')");
    await sup.waitForURL(/\/admin\/login/);
  }
  assert.equal((await sup.goto(`${BASE}/setup`)).status(), 404, "/setup must be closed once an account exists");

  // ---- auth + project ----
  await sup.goto(`${BASE}/admin`);
  assert.match(sup.url(), /\/admin\/login/);
  await login(sup, EMAIL, "wrong-password");
  await sup.waitForURL(/error=1/);
  await login(sup, EMAIL, PASSWORD);
  await sup.waitForURL(`${BASE}/admin`);
  const create = sup.locator("details", { hasText: "Project baru" });
  if (!(await create.getAttribute("open") !== null)) await create.locator("summary").click();
  await create.locator('input[name="name"]').fill(name);
  await create.locator('select[name="productionType"]').selectOption("feature_theatrical");
  await create.locator('label.check:has-text("Bioskop")').click();
  await create.locator("button:has-text('Buat project')").click();
  await sup.waitForURL(/\/admin\/p\//);
  const base = sup.url();

  // ---- technical page: combobox, changed-field summary, save with reason ----
  await sup.goto(`${base}/technical`);
  assert.equal(await sup.inputValue('input[name="frameRate"]'), "24");
  assert.ok(await sup.locator("button:has-text('Simpan Technical Page')").isDisabled());
  await sup.click('input[name="frameRate"]');
  await sup.fill('input[name="frameRate"]', "");
  await sup.click('[role="option"]:text-is("25")');
  await sup.waitForSelector("text=1 field diubah");
  await sup.fill('input[name="reason"]', "permintaan distributor");
  await sup.click("button:has-text('Simpan Technical Page')");
  await sup.waitForSelector("text=Riwayat (1)");
  assert.equal(await sup.inputValue('input[name="frameRate"]'), "25");
  await shot(sup, "technical");

  // ---- team: drawer form, public + internal contact, search ----
  await sup.goto(`${base}/team`);
  for (const [who, internal] of [["Budi Editor", false], ["Vendor Rahasia", true]]) {
    await sup.click("button:has-text('+ Kontak')");
    await sup.fill('aside input[name="name"]', who);
    await sup.selectOption('aside select[name="groupId"]', { label: "Editing" });
    await sup.fill('aside input[name="email"]', `${who.split(" ")[0].toLowerCase()}@example.com`);
    await sup.check('aside input[name="isPic"]');
    await sup.check('aside input[name="needsAccess"]');
    if (internal) await sup.check('aside input[name="internal"]');
    await sup.click("aside button:has-text('Tambah kontak')");
    await sup.waitForSelector(`td:has-text("${who}")`);
    await sup.keyboard.press("Escape");
  }
  await sup.fill('input[type="search"]', "rahasia");
  assert.equal(await sup.locator("tbody tr").count(), 1);
  await sup.fill('input[type="search"]', "");
  assert.ok(await sup.locator("button:has-text('Salin 2 email perlu akses')").isVisible());
  await shot(sup, "team");

  // ---- timeline: track from template ----
  await sup.goto(`${base}/timeline`);
  await sup.click("button:has-text('+ Tambah track')");
  await sup.fill('aside input[name="startDate"]', "2026-12-01");
  await sup.click("aside button:has-text('Tambah track')");
  await bar(sup, "Delivery").waitFor();
  await sup.keyboard.press("Escape");
  const delivery0 = await dueOf(sup, "Delivery");

  // drag Picture Lock 3 days: live tooltip, nothing saved until confirmed
  await drag(sup, "Picture Lock", 3, { hold: true });
  await sup.waitForSelector("text=/\\+3 hr · 8 item ikut/");
  await shot(sup, "timeline-dragging");
  await sup.mouse.up();
  await confirmBar(sup).waitFor();
  assert.ok((await confirmBar(sup).textContent()).includes("8 item yang bergantung ikut bergeser"));
  await shot(sup, "timeline-confirm");
  await confirmBar(sup).locator("button:has-text('Batal')").click();
  assert.equal(await dueOf(sup, "Delivery"), delivery0);

  // drag again, confirm with a reason, then undo from the toast
  await drag(sup, "Picture Lock", 3);
  await confirmBar(sup).locator("input").fill("director minta waktu");
  await confirmBar(sup).locator("button:has-text('Geser 8 item')").click();
  await toast(sup, "8 item ikut bergeser").waitFor();
  assert.equal(daysBetween(delivery0, await dueOf(sup, "Delivery")), 3);
  await toast(sup, "8 item ikut bergeser").locator("button:has-text('Urungkan')").click();
  await toast(sup, "diurungkan").waitFor();
  assert.equal(await dueOf(sup, "Delivery"), delivery0);

  // apply it for real this time
  await drag(sup, "Picture Lock", 3);
  await confirmBar(sup).locator("input").fill("director minta waktu");
  await confirmBar(sup).locator("button:has-text('Geser 8 item')").click();
  await toast(sup, "8 item ikut bergeser").waitFor();
  assert.equal(daysBetween(delivery0, await dueOf(sup, "Delivery")), 3);

  // resize: pull the right edge of Grading 2 days, this item only
  const grading0 = await dueOf(sup, "Grading");
  const online0 = await dueOf(sup, "Online / Conform");
  await drag(sup, "Grading", 2, { where: "end" });
  await confirmBar(sup).locator("button:has-text('Ubah ini saja')").click();
  await toast(sup, 'Jadwal "Grading" diubah').waitFor();
  assert.equal(daysBetween(grading0, await dueOf(sup, "Grading")), 2);
  assert.equal(await dueOf(sup, "Online / Conform"), online0);

  // create a dependency by dragging from Music's handle onto Grading
  const arrows = () => board(sup).locator("svg g").count();
  const before = await arrows();
  await reveal(sup, "Music");
  const handle = await sup.locator(`[data-link-handle="${await bar(sup, "Music").getAttribute("data-item-id")}"]`).boundingBox();
  const target = await bar(sup, "Grading").boundingBox();
  await sup.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await sup.mouse.down();
  await sup.mouse.move(target.x + 20, target.y + target.height / 2, { steps: 8 });
  await sup.mouse.up();
  await toast(sup, '"Grading" kini menunggu "Music"').waitFor();
  await sup.waitForFunction((n) => document.querySelectorAll('[data-testid="timeline-board"] svg g').length === n + 1, before);

  // hard deadline: keyboard nudge on Mastering collides with Delivery
  await board(sup).locator('button:text-is("Delivery")').click();
  await sup.check('aside input[name="hardDeadline"]');
  await sup.click("aside button:text-is('Simpan')");
  await board(sup).locator('span[title="Hard deadline"]').waitFor();
  await sup.keyboard.press("Escape");
  await reveal(sup, "Mastering");
  await bar(sup, "Mastering").focus();
  for (let i = 0; i < 3; i++) await sup.keyboard.press("ArrowRight");
  await confirmBar(sup).locator('[role="alert"]:has-text("hard deadline")').waitFor();
  await shot(sup, "timeline-conflict");
  await sup.keyboard.press("Escape");
  await confirmBar(sup).waitFor({ state: "detached" });

  // milestone + quick status from the row
  await board(sup).locator('button:text-is("Offline Edit")').click();
  await sup.fill('aside form:has(input[name="parentId"]) input[name="name"]', "Cut v1 ke director");
  await sup.click("aside button:has-text('Tambah milestone')");
  await bar(sup, "Cut v1 ke director").waitFor();
  await sup.keyboard.press("Escape");
  // links, versions, approval, comments from the item drawer (drawer stays open throughout)
  await board(sup).locator('button:text-is("Offline Edit")').click();
  const drawer = sup.locator("aside[role=dialog]");
  await drawer.locator("summary:has-text('+ Tambah link')").click();
  await drawer.locator('input[name="label"]').fill("Offline");
  await drawer.locator('[role="option"]:text-is("Offline Cut")').click();
  await drawer.locator('form:has(input[name="label"]) input[name="url"]').fill("https://vimeo.com/offline-v1");
  await drawer.locator("button:has-text('Tambah link')").click();
  const cut = drawer.locator('[data-attachment="Offline Cut"]');
  await cut.locator(".tag:text-is('v1')").waitFor();
  await cut.locator("summary:has-text('+ Versi baru (v2)')").click();
  await cut.locator('input[name="url"]').fill("https://vimeo.com/offline-v2");
  await cut.locator('textarea[name="notes"]').fill("trim adegan 12, ganti musik temp");
  await cut.locator("button:has-text('Simpan versi')").click();
  await cut.locator(".tag:text-is('v2')").waitFor();
  assert.equal(await cut.locator('a:has-text("Buka")').first().getAttribute("href"), "https://vimeo.com/offline-v2");
  await cut.locator("summary:has-text('Riwayat versi (1)')").waitFor();
  await cut.locator("button:has-text('Tandai: Approved')").click();
  await cut.locator(".tag-ok:text-is('Approved')").waitFor();
  // an internal link the viewer must never see
  await drawer.locator("summary:has-text('+ Tambah link')").click();
  await drawer.locator('form:has(input[name="label"]) input[name="label"]').fill("Catatan vendor rahasia");
  await drawer.locator('form:has(input[name="label"]) input[name="url"]').fill("https://example.com/internal");
  await drawer.locator('form:has(input[name="label"]) input[name="internal"]').check();
  await drawer.locator("button:has-text('Tambah link')").click();
  await drawer.locator('[data-attachment="Catatan vendor rahasia"]').waitFor();
  await drawer.locator('textarea[aria-label="Tulis komentar"]').fill("Director minta lihat reel 2 dulu");
  await drawer.locator("button:has-text('Kirim komentar')").click();
  await drawer.locator("text=Director minta lihat reel 2 dulu").waitFor();
  await shot(sup, "item-links");
  await sup.keyboard.press("Escape");
  await board(sup).locator('.tag:text-is("↗2")').waitFor();
  // project documents
  await sup.goto(`${base}/assets`);
  await sup.locator("section", { hasText: "Dokumen produksi" }).locator("summary:has-text('+ Tambah link')").click();
  await sup.locator('section:has-text("Dokumen produksi") form:has(input[name="label"]) input[name="label"]').fill("Script Report");
  await sup.keyboard.press("Escape");
  await sup.locator('section:has-text("Dokumen produksi") form:has(input[name="label"]) input[name="url"]').fill("https://docs.google.com/script-report");
  await sup.locator("section", { hasText: "Dokumen produksi" }).locator("button:has-text('Tambah link')").click();
  await sup.locator('[data-attachment="Script Report"]').waitFor();
  assert.ok(await sup.locator('section:has-text("Main Feature") [data-attachment="Offline Cut"]').isVisible());
  await shot(sup, "assets");
  // ---- deliverables: preset, cutdown matrix, status, link + version, delete ----
  await sup.goto(`${base}/deliverables`);
  await sup.click("button:has-text('+ Dari preset')");
  await sup.waitForSelector("aside >> text=Kebutuhan tim post");
  await sup.fill('aside input[name="dueDate"]', "2027-03-20");
  await shot(sup, "deliverables-preset");
  await sup.click("aside button:has-text('Tambah 17 deliverable')");
  await toast(sup, "17 deliverable ditambahkan").waitFor();
  const dpxRow = sup.locator('tr[data-deliverable="DPX sequence (sumber DCP)"]');
  await dpxRow.waitFor();
  assert.ok((await dpxRow.textContent()).includes("4096x1716 (4K Scope)"), "resolution not inherited from Technical Page");
  for (const n of ["Stereo (distribusi biasa)", "DME", "File seluruh musik (score & source)", "Music cue list"]) assert.ok(await sup.locator(`tr[data-deliverable="${n}"]`).isVisible(), n);
  assert.equal(await sup.locator('tr[data-deliverable*="KDM"]').count(), 0);

  await sup.click("button:has-text('+ Matriks cutdown')");
  await sup.click('aside label.check:has-text("60s")');
  await sup.waitForSelector("aside button:has-text('3 × 2 = 6 cutdown')");
  await sup.click("aside button:has-text('3 × 2 = 6 cutdown')");
  await toast(sup, "6 cutdown dibuat").waitFor();
  const matrix = sup.locator("[data-matrix]");
  await matrix.locator("tbody button").nth(5).waitFor();
  assert.equal(await matrix.locator("tbody button").count(), 6);

  await sup.selectOption('select[aria-label="Status DPX sequence (sumber DCP)"]', "qc");
  await toast(sup, "QC").waitFor();
  await sup.click('tr[data-deliverable="DPX sequence (sumber DCP)"] button');
  const dDrawer = sup.locator("aside[role=dialog]");
  await dDrawer.locator("summary:has-text('+ Tambah link')").click();
  await dDrawer.locator('form:has(input[name="label"]) input[name="label"]').fill("Folder delivery");
  await sup.keyboard.press("Tab");
  await dDrawer.locator('form:has(input[name="url"]):has(input[name="label"]) input[name="url"]').fill("https://drive.google.com/dpx-v1");
  await dDrawer.locator("button:has-text('Tambah link')").click();
  const folder = dDrawer.locator('[data-attachment="Folder delivery"]');
  await folder.locator(".tag:text-is('v1')").waitFor();
  await folder.locator("summary:has-text('+ Versi baru (v2)')").click();
  await folder.locator('input[name="url"]').fill("https://drive.google.com/dpx-v2");
  await folder.locator('textarea[name="notes"]').fill("fix reel 3 frame 1021");
  await folder.locator("button:has-text('Simpan versi')").click();
  await folder.locator(".tag:text-is('v2')").waitFor();
  await shot(sup, "deliverable-item");
  await sup.keyboard.press("Escape");
  assert.equal(await dpxRow.locator('a:has-text("Buka")').getAttribute("href"), "https://drive.google.com/dpx-v2");

  // an internal manual item, and delete one preset item
  await sup.click("button:has-text('+ Manual')");
  await sup.fill('aside input[name="name"]', "Arsip LTO rahasia");
  await sup.check('aside input[name="internal"]');
  await sup.click("aside button:has-text('Tambah deliverable')");
  await sup.locator('tr[data-deliverable="Arsip LTO rahasia"]').waitFor();
  await sup.click('tr[data-deliverable="ProRes HD"] button');
  await sup.click("aside button:text-is('Hapus')");
  await sup.locator('tr[data-deliverable="ProRes HD"]').waitFor({ state: "detached" });
  await shot(sup, "deliverables");

  await sup.goto(`${base}/timeline`);
  await bar(sup, "Delivery").waitFor();
  await board(sup).locator('button:text-is("Grading")').click();
  await sup.fill('aside form:has(input[name="parentId"]) input[name="name"]', "Rahasia Internal");
  await sup.click("aside button:has-text('Tambah milestone')");
  await bar(sup, "Rahasia Internal").waitFor();
  await sup.keyboard.press("Escape");
  await board(sup).locator('button:has-text("Rahasia Internal")').click();
  await sup.check('aside form:has(input[name="hardDeadline"]) input[name="internal"]');
  await sup.click("aside button:text-is('Simpan')");
  await board(sup).locator('button:has-text("Rahasia Internal")').waitFor();
  await sup.keyboard.press("Escape");
  await sup.selectOption('select[aria-label="Status Ingest & Sync"]', "done");
  await toast(sup, "Selesai").waitFor();
  await shot(sup, "timeline");

  // ---- access: assistant account + view-only link ----
  await sup.goto(`${base}/access`);
  const asstEmail = `asst${Date.now()}@example.com`;
  await sup.click("summary:has-text('Beri akses admin')");
  await sup.fill('form:has(select[name="role"]) input[name="email"]', asstEmail);
  await sup.fill('form:has(select[name="role"]) input[name="name"]', "Asisten");
  await sup.fill('form:has(select[name="role"]) input[name="password"]', "password2");
  await sup.click("button:has-text('Beri akses')");
  await sup.waitForSelector(`text=${asstEmail}`);
  await sup.fill('input[name="label"]', "Director");
  await sup.click("button:has-text('Buat link')");
  const viewUrl = BASE + (await sup.locator('a[href^="/v/"]').first().getAttribute("href"));
  await shot(sup, "access");

  // ---- viewer: sees everything public, can change nothing ----
  const viewer = await (await browser.newContext(desktop)).newPage();
  await viewer.goto(viewUrl);
  await viewer.locator('[role="tabpanel"]:not([hidden]) >> text=Hard deadline').first().waitFor(); // "Hari Ini" is the first tab
  assert.equal(await viewer.locator("button:has-text('Sudah di-follow-up')").count(), 0);
  const viewerFeed = await viewer.request.get(`${viewUrl}/calendar`);
  assert.equal(viewerFeed.status(), 200);
  assert.match(viewerFeed.headers()["content-type"], /text\/calendar/);
  const viewerIcs = await viewerFeed.text();
  assert.ok(viewerIcs.startsWith("BEGIN:VCALENDAR") && viewerIcs.includes("Picture Lock") && viewerIcs.includes("DPX sequence"));
  assert.ok(!viewerIcs.includes("Rahasia Internal"), "internal schedule item leaked into viewer calendar feed");
  await viewer.click('[role="tab"]:has-text("Timeline")');
  await bar(viewer, "Picture Lock").waitFor();
  assert.ok((await viewer.textContent("h1")).includes(name));
  await drag(viewer, "Picture Lock", 3);
  assert.equal(await confirmBar(viewer).count(), 0, "viewer could start a schedule change");
  assert.equal(await viewer.locator("form, input[name], select[aria-label^='Status ']").count(), 0);
  assert.equal(await viewer.locator("aside[role=dialog] form").count(), 0);
  await shot(viewer, "viewer");
  await viewer.keyboard.press("Escape");
  await board(viewer).locator('button:text-is("Offline Edit")').click();
  await viewer.locator('aside [data-attachment="Offline Cut"] .tag:text-is("v2")').waitFor();
  assert.equal(await viewer.locator("aside form, aside textarea, aside button:has-text('Tandai')").count(), 0);
  await viewer.keyboard.press("Escape");
  await viewer.click('[role="tab"]:has-text("Deliverables")');
  const vPanel = viewer.locator('[role="tabpanel"]:not([hidden])');
  await vPanel.locator('tr[data-deliverable="DPX sequence (sumber DCP)"] .tag:text-is("QC")').waitFor();
  assert.equal(await vPanel.locator("select[aria-label^='Status '], button:has-text('+ Dari preset')").count(), 0);
  assert.equal(await vPanel.locator("[data-matrix] tbody button").count(), 6);
  assert.ok(!(await viewer.content()).includes("Arsip LTO rahasia"), "internal deliverable leaked to viewer");
  await viewer.click('[role="tab"]:has-text("Aset & dokumen")');
  await viewer.locator('[role="tabpanel"]:not([hidden]) [data-attachment="Script Report"]').waitFor();
  const viewerHtml = await viewer.content();
  assert.ok(!viewerHtml.includes("Catatan vendor rahasia"), "internal link leaked to viewer");
  assert.ok(!viewerHtml.includes("Director minta lihat reel 2"), "comment leaked to viewer");
  await viewer.click('[role="tab"]:has-text("Technical Page")');
  assert.ok((await viewer.textContent("main")).includes("25"));
  await viewer.click('[role="tab"]:has-text("Tim")');
  const teamText = await viewer.locator('[role="tabpanel"]:not([hidden])').textContent();
  assert.ok(teamText.includes("Budi Editor"));
  assert.ok(!(await viewer.content()).includes("Vendor Rahasia"), "internal contact leaked to viewer");
  await viewer.goto(base);
  assert.match(viewer.url(), /\/admin\/login/);

  // ---- assistant: status only ----
  const asst = await (await browser.newContext(desktop)).newPage();
  await login(asst, asstEmail, "password2");
  await asst.waitForURL(`${BASE}/admin`);
  await asst.goto(`${base}/timeline`);
  await bar(asst, "Picture Lock").waitFor();
  await drag(asst, "Picture Lock", 3);
  assert.equal(await confirmBar(asst).count(), 0, "assistant could start a schedule change");
  assert.equal(await asst.locator('aside input[name="dueDate"]').count(), 0);
  await asst.keyboard.press("Escape");
  await board(asst).locator('button:text-is("Offline Edit")').click();
  assert.equal(await asst.locator("aside button:has-text('Tandai')").count(), 0, "assistant can approve");
  await asst.locator('aside textarea[aria-label="Tulis komentar"]').fill("Siap, saya kirim Jumat");
  await asst.locator("aside button:has-text('Kirim komentar')").click();
  await asst.locator("aside >> text=Siap, saya kirim Jumat").waitFor();
  await asst.keyboard.press("Escape");
  await asst.selectOption('select[aria-label="Status Offline Edit"]', "in_progress");
  await toast(asst, "Berjalan").waitFor();
  await asst.goto(`${base}/deliverables`);
  assert.equal(await asst.locator("button:has-text('+ Dari preset')").count(), 0, "assistant can add deliverables");
  await asst.selectOption('select[aria-label="Status Music cue list"]', "delivered");
  await toast(asst, "Terkirim").waitFor();
  await asst.goto(`${base}/technical`);
  assert.equal(await asst.locator('input[name="frameRate"]').count(), 0);
  assert.ok((await asst.textContent("main")).includes("Hanya supervisor"));
  assert.equal((await asst.goto(`${base}/access`)).status(), 404);
  await asst.goto(`${base}/team`);
  assert.ok((await asst.textContent("main")).includes("Vendor Rahasia"));

  // ---- dashboard, calendar feed, PWA manifest, weekly report ----
  await sup.goto(base);
  await sup.waitForSelector("text=Langganan kalender");
  for (const s of ["Hari ini", "Terlambat", "7 hari ke depan", "Perlu follow-up", "Perlu dicek", "Hard deadline"]) assert.ok((await sup.textContent("main")).includes(s), `dashboard missing: ${s}`);
  const feedUrl = (await sup.textContent("main")).match(/https?:\/\/\S+\/cal\/[\w-]+\.ics/)[0];
  const feed = await sup.request.get(feedUrl);
  assert.equal(feed.status(), 200);
  const ics = await feed.text();
  assert.ok(ics.includes("Picture Lock") && ics.includes("Rahasia Internal") && ics.includes("⚑ Main Feature: Delivery"), "admin feed content");
  assert.equal((await viewer.request.get(feedUrl)).status(), 200, "feed must work without a session (calendar apps)");
  await sup.click("button:has-text('Buat ulang link')");
  await toast(sup, "Link kalender").waitFor();
  assert.equal((await sup.request.get(feedUrl)).status(), 404);
  assert.equal((await sup.request.get(`${BASE}/cal/tidak-ada.ics`)).status(), 404);
  await shot(sup, "today");
  const manifest = await (await sup.request.get(`${BASE}/manifest.webmanifest`)).json();
  assert.equal(manifest.display, "standalone");
  assert.equal((await sup.request.get(BASE + manifest.icons[0].src)).status(), 200);
  await sup.goto(`${base}/report`);
  await sup.waitForSelector("button:has-text('Salin ringkasan teks')");
  assert.ok((await sup.textContent("main")).includes("Main Feature"));
  await shot(sup, "report");

  // ---- change log ----
  await sup.goto(`${base}/activity`);
  const log = await sup.textContent("main");
  for (const s of ["Frame rate: 24 → 25", "permintaan distributor", "menggeser 8 item lain", "director minta waktu", "Mengurungkan perubahan jadwal", '"Grading" kini menunggu "Music"', "Membuat link view-only", "Asisten", 'Menambah versi v2 untuk "Offline Cut"', "trim adegan 12, ganti musik temp", '"Offline Cut" v2: Approved', "Berkomentar di Offline Edit", 'dari preset "Film bioskop"', 'Membuat matriks cutdown "Trailer": 3 durasi × 2 ratio', 'Deliverable "DPX sequence (sumber DCP)": QC', 'Menghapus deliverable "ProRes HD"']) {
    assert.ok(log.includes(s), `change log missing: ${s}`);
  }
  await shot(sup, "activity");
  await sup.goto(base);
  await shot(sup, "overview");
  await sup.goto(`${BASE}/admin`);
  await shot(sup, "projects");

  // ---- dark theme + phone layout ----
  await sup.goto(`${base}/timeline`);
  await sup.click("button:has-text('Tema'):visible");
  assert.equal(await sup.getAttribute("html", "data-theme"), "dark");
  await sup.reload();
  assert.equal(await sup.getAttribute("html", "data-theme"), "dark");
  await bar(sup, "Delivery").waitFor();
  await shot(sup, "timeline-dark");
  await sup.click("button:has-text('Tema'):visible");
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await sup.context().storageState() })).newPage();
  await phone.goto(`${base}/timeline`);
  await phone.click("button:has-text('Picture Lock')");
  await phone.waitForSelector('aside input[name="dueDate"]');
  await shot(phone, "phone-item");
  await phone.keyboard.press("Escape");
  await shot(phone, "phone-timeline");

  // ---- revoke -> 404 ----
  await sup.goto(`${base}/access`);
  await sup.click("li:has-text('Director') button:has-text('Cabut')");
  await sup.waitForSelector("text=Dicabut");
  assert.equal((await viewer.goto(viewUrl)).status(), 404);

  assert.deepEqual(errors, [], "page errors");
  await browser.close();
  console.log("e2e smoke: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
