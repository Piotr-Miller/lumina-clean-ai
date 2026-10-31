// One-off evidence capture for plan 1.9. Run from the repository root:
// node context/changes/cloud-model-comparison/references/1.9-spike-smoke/verify.cjs
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");

async function main() {
  const root = path.resolve(__dirname, "../../../../..");
  const html = path.join(root, "context/changes/cloud-model-comparison/references/compare-arms.html");
  execFileSync(
    "python3",
    ["scripts/s19/viewer-inputs.py", "scripts/s19/viewer/spike-smoke.json", "--name", "spike-smoke"],
    { cwd: root },
  );
  const url = pathToFileURL(html);
  url.search = "m=spike-smoke";
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  const checks = [];
  const shots = [];
  async function ready() {
    await expect(page.locator("main img")).not.toHaveCount(0);
    await expect
      .poll(() =>
        page.locator("main img").evaluateAll((imgs) => imgs.every((img) => img.complete && img.naturalWidth > 0)),
      )
      .toBe(true);
    await page.locator("main img").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByText("Brak pliku:", { exact: false }).count(), 0);
  }
  async function capture(name) {
    await ready();
    const bytes = await page.screenshot({ path: path.join(__dirname, name), fullPage: true });
    shots.push({ file: name, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  try {
    await page.goto(url.href);
    await expect(page.getByRole("heading")).toContainText("S17-04");
    await expect(page.locator("#main .label")).toHaveText(["Oryginał", "A", "B"]);
    await expect(page.getByRole("button", { name: "Odkryj ramiona", exact: true })).toBeDisabled();
    await capture("01-blind.png");
    checks.push(
      "Real spike-smoke manifest and three real images loaded; identities hidden and reveal disabled before rating.",
    );

    // Exercise all six flag buttons on/off; these are synthetic UI inputs, not quality ratings.
    for (const flag of ["severe", "content", "unverified"]) {
      for (const side of ["A", "B"]) {
        const button = page.locator(`button[data-f="${flag}"][data-s="${side}"]`);
        await button.click();
        await expect(button).toHaveClass("on");
        await button.click();
        await expect(button).not.toHaveClass("on");
      }
    }
    checks.push(
      "Severe regression, content change and unverified lettering flags toggle both on and off independently on A and B.",
    );
    await page.getByRole("button", { name: "remis", exact: true }).click();
    for (const flag of ["severe", "content", "unverified"]) {
      await page.locator(`button[data-f="${flag}"][data-s="A"]`).click();
    }
    await expect(page.locator("#warn")).toContainText("zmiana treści wymaga kadru");
    await capture("02-flags-warning.png");
    const note = "SMOKE TEST ONLY: testowy kadr → testowy wynik; nie jest oceną jakości";
    await page.locator("#crop").fill(note);
    await expect(page.locator("#warn")).toBeEmpty();
    await page.reload();
    for (const flag of ["severe", "content", "unverified"]) {
      await expect(page.locator(`button[data-f="${flag}"][data-s="A"]`)).toHaveClass("on");
      await expect(page.locator(`button[data-f="${flag}"][data-s="B"]`)).not.toHaveClass("on");
    }
    await expect(page.locator("#crop")).toHaveValue(note);
    await expect(page.locator('#pref button[data-v="tie"]')).toHaveClass("on");
    checks.push(
      "Flags, synthetic tie and crop note survive reload. Missing original → result crop note warns; entering it clears the warning.",
    );

    await page.getByRole("heading").click();
    await page.keyboard.press("j");
    await expect(page.getByRole("img", { name: "Oryginał (rozjaśniony)", exact: true })).toHaveCSS(
      "filter",
      "brightness(3)",
    );
    await expect(page.locator("main img").nth(1)).toHaveCSS("filter", "none");
    await expect(page.locator("main img").nth(2)).toHaveCSS("filter", "none");
    await capture("03-j-brightened.png");
    await page.keyboard.press("J");
    await expect(page.getByRole("img", { name: "Oryginał", exact: true })).toHaveCSS("filter", "none");
    checks.push(
      "Keyboard j turns original-only brightness(3) on; uppercase J turns it off. A and B remain unfiltered.",
    );

    await expect(page.getByRole("button", { name: "Odkryj ramiona", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Odkryj ramiona", exact: true }).click();
    const labels = page.locator("#main .label");
    await expect(labels).toContainText(["Oryginał", " = ", " = "]);
    const names = await labels.allTextContents();
    assert(names.some((name) => name.includes("GPT Image 2.5 (spike, unprepared input)")));
    assert(names.some((name) => name.includes("Local (2026-10-29 download, source-file input)")));
    await capture("04-revealed.png");
    await page.getByRole("button", { name: "Odkryj ramiona", exact: true }).click();
    await expect(labels).toHaveText(["Oryginał", "A", "B"]);
    checks.push(
      "After a synthetic rating, reveal displays the actual GPT and Local identities and toggles back to blind labels.",
    );

    // Check the download instead of inferring export correctness from localStorage.
    await page.getByRole("button", { name: "Eksport", exact: true }).click();
    const downloadWait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Pobierz JSON (dla tally.py)", exact: true }).click();
    const download = await downloadWait;
    const payload = JSON.parse(await fs.readFile(await download.path(), "utf8"));
    assert.equal(payload.series_id, "spike-smoke");
    assert.equal(payload.ratings.length, 1);
    const rating = payload.ratings[0];
    const candidateOnA = rating.blind_order.candidate === "A";
    assert.equal(rating.severe_candidate, candidateOnA);
    assert.equal(rating.severe_reference, !candidateOnA);
    assert.equal(rating.content_change, candidateOnA);
    assert.equal(rating.content_change_reference, !candidateOnA);
    assert.equal(rating.unverified_reconstruction, candidateOnA);
    assert.equal(rating.crop_note, note);
    assert.equal(rating.preference, "tie");
    assert.equal(payload.failed_slots.length, 1);
    checks.push(
      "Downloaded JSON maps A-side flags to the correct candidate/reference, retains the crop note and synthetic tie, and includes the failed slot.",
    );
    await page.getByRole("button", { name: "Zamknij", exact: true }).click();

    await page.getByRole("button", { name: "Para 2", exact: true }).click();
    await expect(labels).toHaveText(["Oryginał", "A", "B"]);
    await expect(page.locator(".flags button.on")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Odkryj ramiona", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "remis", exact: true }).click();
    await page.getByRole("button", { name: "Odkryj ramiona", exact: true }).click();
    await expect(page.locator("#main")).toContainText("NAFNet raw (spike, no gamma)");
    await capture("05-nafnet-revealed.png");
    checks.push(
      "Changing pair clears reveal and isolates flags; the second real S17-04 comparison reveals NAFNet and Local.",
    );

    await page.getByRole("button", { name: "→", exact: true }).click();
    await expect(page.getByRole("heading")).toContainText("S17-07");
    await ready();
    await expect(page.getByRole("button", { name: "Odkryj ramiona", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "remis", exact: true }).click();
    await page.getByRole("button", { name: "Odkryj ramiona", exact: true }).click();
    await expect(page.locator("#main")).toContainText("GPT Image 2.5");
    await capture("06-portrait-revealed.png");
    await page.getByRole("button", { name: "Para 2 ✓", exact: true }).click();
    await expect(page.getByText("Brak wyniku: technical_failure", { exact: true })).toBeVisible();
    await expect(page.locator("#rating")).toBeHidden();
    await expect(page.locator("main img")).toHaveCount(2);
    await capture("07-failed-slot.png");
    checks.push(
      "S17-07 GPT/Local images load and reveal; its synthetic technical_failure slot shows status only, with rating controls hidden.",
    );
    assert.deepEqual(errors, []);
    checks.push("No page JavaScript errors, failed resource requests or missing-image placeholders.");

    const report = {
      criterion: "1.9",
      verdict: "PASS",
      method: "delegated headless Playwright verification; not personal owner manual acceptance",
      completed_at: new Date().toISOString(),
      commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      viewer_sha256: createHash("sha256")
        .update(await fs.readFile(html))
        .digest("hex"),
      manifest_sha256: createHash("sha256")
        .update(await fs.readFile(path.join(root, "test-photos/private/s19/viewer/spike-smoke.js")))
        .digest("hex"),
      playwright: require("playwright/package.json").version,
      chromium: browser.version(),
      viewport: { width: 1680, height: 1050 },
      scope:
        "Real local files, isolated browser context, synthetic ratings only; no provider calls, holdout access or quality gate.",
      checks,
      screenshots: shots,
      errors,
    };
    await fs.writeFile(path.join(__dirname, "verification.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
