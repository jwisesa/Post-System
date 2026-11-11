// End-to-end smoke test for step 1. Needs a running server and one admin account:
//   PGLITE_DIR=/tmp/ps-e2e npm run create-admin -- "Sup" sup@example.com password1
//   PGLITE_DIR=/tmp/ps-e2e npm run dev
//   E2E_EMAIL=sup@example.com E2E_PASSWORD=password1 npm run e2e
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "sup@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "password1";
const SHOT = process.env.E2E_SCREENSHOT_DIR;

async function login(page, email, password) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click("button:has-text('Masuk')");
}

(async () => {
  const browser = await chromium.launch();
  const sup = await (await browser.newContext()).newPage();
  const name = `E2E Film ${Date.now()}`;

  // unauthenticated admin -> login; wrong password rejected
  await sup.goto(`${BASE}/admin`);
  assert.match(sup.url(), /\/admin\/login/);
  await login(sup, EMAIL, "wrong-password");
  await sup.waitForURL(/error=1/);

  // login + create project
  await login(sup, EMAIL, PASSWORD);
  await sup.waitForURL(`${BASE}/admin`);
  await sup.fill('input[name="name"]', name);
  await sup.selectOption('select[name="productionType"]', "feature_theatrical");
  await sup.check('input[name="platforms"][value="Bioskop"]');
  await sup.click("button:has-text('Buat project')");
  await sup.waitForURL(/\/admin\/p\//);
  const base = sup.url();

  // technical page: defaults seeded, edit one field with a reason
  await sup.goto(`${base}/technical`);
  assert.equal(await sup.inputValue('input[name="frameRate"]'), "24");
  await sup.fill('input[name="frameRate"]', "25");
  await sup.fill('input[name="reason"]', "permintaan distributor");
  await sup.click("button:has-text('Simpan Technical Page')");
  await sup.waitForLoadState("networkidle");
  assert.equal(await sup.inputValue('input[name="frameRate"]'), "25");
  if (SHOT) await sup.screenshot({ path: `${SHOT}/technical.png`, fullPage: true });

  // team: one public and one internal contact
  await sup.goto(`${base}/team`);
  for (const [who, internal] of [["Budi Editor", false], ["Vendor Rahasia", true]]) {
    const add = sup.locator("section", { hasText: "Editing" }).locator("details", { hasText: "Tambah kontak" });
    await add.locator("summary").click();
    await add.locator('input[name="name"]').fill(who);
    await add.locator('input[name="isPic"]').check();
    if (internal) await add.locator('input[name="internal"]').check();
    await add.locator("button:has-text('Tambah')").click();
    await sup.waitForSelector(`text=${who}`);
  }

  // timeline: track from template, shift Picture Lock +3 days via the preview page
  await sup.goto(`${base}/timeline`);
  await sup.selectOption('select[name="template"]', "feature");
  await sup.fill('form:has(select[name="template"]) input[name="startDate"]', "2026-12-01");
  await sup.click("button:has-text('Tambah track')");
  await sup.waitForSelector("h2:has-text('Main Feature')");
  const itemRow = (n) => sup.locator("details", { has: sup.locator(`summary:has-text("${n}")`) }).first();
  const deliveryBefore = await itemRow("Delivery").locator('input[name="dueDate"]').inputValue();
  const lock = itemRow("Picture Lock");
  await lock.locator("summary").click();
  const lockDue = await lock.locator('input[name="dueDate"]').inputValue();
  const plus3 = new Date(Date.parse(lockDue) + 3 * 864e5).toISOString().slice(0, 10);
  const lockForm = lock.locator('form:has(input[name="dueDate"])');
  await lockForm.locator('input[name="startDate"]').fill(plus3);
  await lockForm.locator('input[name="dueDate"]').fill(plus3);
  await lockForm.locator('input[name="reason"]').fill("director minta waktu");
  await lockForm.locator("button:has-text('Simpan')").click();
  await sup.waitForURL(/timeline\/shift/);
  assert.ok((await sup.textContent("main")).includes("geser 8 item"));
  if (SHOT) await sup.screenshot({ path: `${SHOT}/shift.png`, fullPage: true });
  // nothing saved yet
  const peek = await (await sup.context().newPage());
  await peek.goto(`${base}/timeline`);
  assert.equal(await peek.locator("details", { has: peek.locator('summary:has-text("Delivery")') }).first().locator('input[name="dueDate"]').inputValue(), deliveryBefore);
  await peek.close();
  await sup.click("button:has-text('Terapkan dan geser')");
  await sup.waitForURL(/timeline$/);
  const deliveryAfter = await itemRow("Delivery").locator('input[name="dueDate"]').inputValue();
  assert.equal((Date.parse(deliveryAfter) - Date.parse(deliveryBefore)) / 864e5, 3);
  assert.ok((await itemRow("Delivery").locator("summary").textContent()).includes("+3 hr dari baseline"));
  if (SHOT) await sup.screenshot({ path: `${SHOT}/timeline.png`, fullPage: true });

  // access: assistant account + view-only link
  await sup.goto(`${base}/access`);
  const asstEmail = `asst${Date.now()}@example.com`;
  await sup.fill('form:has(select[name="role"]) input[name="email"]', asstEmail);
  await sup.fill('input[name="name"]', "Asisten");
  await sup.fill('form:has(select[name="role"]) input[name="password"]', "password2");
  await sup.click("button:has-text('Beri akses')");
  await sup.waitForSelector(`text=${asstEmail}`);
  await sup.fill('input[name="label"]', "Director");
  await sup.click("button:has-text('Buat link')");
  const viewUrl = BASE + (await sup.locator('a[href^="/v/"]').first().getAttribute("href"));

  // viewer: no login, sees data, no internal items, no edit controls
  const viewer = await (await browser.newContext()).newPage();
  await viewer.goto(viewUrl);
  const body = await viewer.textContent("body");
  assert.ok(body.includes(name) && body.includes("Budi Editor") && body.includes("25") && body.includes("Picture Lock"));
  assert.ok(!body.includes("Vendor Rahasia"), "internal contact leaked to viewer");
  assert.equal(await viewer.locator("main").locator("form, input, button").count(), 0);
  if (SHOT) await viewer.screenshot({ path: `${SHOT}/viewer.png`, fullPage: true });
  await viewer.goto(base); // viewer has no session
  assert.match(viewer.url(), /\/admin\/login/);

  // assistant: can see, cannot edit technical page or reach access page
  const asst = await (await browser.newContext()).newPage();
  await login(asst, asstEmail, "password2");
  await asst.waitForURL(`${BASE}/admin`);
  await asst.goto(`${base}/technical`);
  assert.equal(await asst.locator('input[name="frameRate"]').count(), 0);
  assert.ok((await asst.textContent("body")).includes("Hanya supervisor"));
  assert.equal((await asst.goto(`${base}/access`)).status(), 404);
  await asst.goto(`${base}/timeline`);
  assert.equal(await asst.locator('input[name="dueDate"]').count(), 0);
  assert.ok((await asst.locator("button:has-text('Simpan status')").count()) > 0);
  await asst.goto(`${base}/team`);
  assert.ok((await asst.textContent("body")).includes("Vendor Rahasia"));

  // change log attributes the edit
  await sup.goto(`${base}/activity`);
  const log = await sup.textContent("main");
  assert.ok(log.includes("Frame rate: 24 → 25") && log.includes("permintaan distributor") && log.includes("Membuat link view-only") && log.includes("menggeser 8 item lain"));
  if (SHOT) await sup.screenshot({ path: `${SHOT}/activity.png`, fullPage: true });

  // revoke -> 404
  await sup.goto(`${base}/access`);
  await sup.click("li:has-text('Director') button:has-text('Cabut')");
  await sup.waitForSelector("text=Dicabut");
  assert.equal((await viewer.goto(viewUrl)).status(), 404);

  await browser.close();
  console.log("e2e smoke: OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
