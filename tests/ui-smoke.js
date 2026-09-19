/** නමෝ බුද්ධාය | 🤍 */

import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApplication} from '../server.js';
import {AppError, delay} from '../core/errors.js';
import {codec} from './helpers.js';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-v3-ui-'));
const screenshots = path.resolve('screenshots');
fs.mkdirSync(screenshots, {recursive: true});
const app = createApplication({
    directory, codec, resolver: {
        close: async () => {
        }, resolve: async url => url, extract: async () => []
    },
    download: async (url, file, settings, signal, progress) => {
        if (file.name.includes('fail')) throw new AppError('FIXTURE_ERROR', 'Simulated server error for UI verification.');
        for (let i = 1; i <= 4; i++) {
            await delay(160, signal);
            progress({bytes: i * 262144, totalBytes: 1048576, speed: 1638400});
        }
        return {
            status: 'completed',
            bytes: 1048576,
            totalBytes: 1048576,
            outputName: file.name,
            checksum: 'a'.repeat(64)
        };
    }
});
// Keep the license-setup guide from covering controls during this queue-focused
// visual test; the onboarding dialog is intentionally outside this scenario.
app.config.update({downloadDir: path.join(directory, 'downloads'), retries: 0, license: 'ui-test-license'});
const origin = await app.listen();
let browser;
const errors = [], consoleErrors = [], requests = [];
try {
    const launch = {headless: true, executablePath: process.env.WD_CHROMIUM_PATH || undefined};
    if (process.env.WD_CHROMIUM_MODULE) {
        const {default: binary} = await import(pathToFileURL(process.env.WD_CHROMIUM_MODULE));
        launch.executablePath = await binary.executablePath();
        launch.args = binary.args;
    }
    browser = await chromium.launch(launch);
    const page = await browser.newPage({viewport: {width: 1500, height: 1000}});
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => {
        if (e.type() === 'error') consoleErrors.push(e.text());
    });
    page.on('request', r => requests.push(r.url()));
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Live connection'));
    await page.screenshot({path: path.join(screenshots, '01-cloud-empty.png'), fullPage: true});
    assert.equal(await page.locator('#startBtn').isDisabled(), true);
    await page.click('#importBtn');
    const demo = ['https://example.com/Design-system-assets.zip', 'https://example.com/Portfolio-sources.zip', 'https://example.com/Field-recordings.wav', 'https://example.com/Architecture-references.pdf', 'https://example.com/fail-diagnostic-fixture.zip', 'https://example.com/Creative-toolkit.zip'];
    await page.fill('#importText', demo.join('\n'));
    await page.click('#importSave');
    await page.waitForFunction(() => !document.querySelector('#importDialog').open);
    await page.waitForFunction(() => document.querySelector('#statTotal').textContent === '6');
    assert.equal(await page.locator('#fileRows tr').count(), 6);
    assert.match(await page.locator('#selInfo').textContent(), /6 selected/);
    await page.click('#startBtn');
    await page.waitForFunction(() => document.querySelector('#queueTitle').textContent === 'Making progress');
    await page.screenshot({path: path.join(screenshots, '02-cloud-running.png'), fullPage: true});
    await page.click('#pauseBtn');
    await page.waitForFunction(() => document.querySelector('#queueTitle').textContent === 'Taking a breather');
    await page.click('#pauseBtn');
    await page.waitForFunction(() => document.querySelector('#statDone').textContent === '5');
    assert.equal(app.queue.summary().failed, 1);
    await page.screenshot({path: path.join(screenshots, '03-cloud-results.png'), fullPage: true});
    await page.click('[data-filter="attention"]');
    await page.waitForFunction(() => document.querySelectorAll('#fileRows tr').length === 1 && document.querySelector('#fileRows').textContent.includes('fail-diagnostic'));
    await page.click('#fileRows [data-detail-id]');
    assert.ok(await page.locator('#detailBody').textContent().then(s => s.includes('FIXTURE_ERROR')));
    await page.click('[data-close="detailDialog"]');
    await page.click('[data-filter="all"]');
    await page.fill('#search', 'Portfolio');
    await page.waitForFunction(() => document.querySelectorAll('#fileRows tr').length === 1 && document.querySelector('#fileRows').textContent.includes('Portfolio'));
    await page.fill('#search', '');
    await page.click('#settingsBtn');
    await page.selectOption('#themeInput', 'dark');
    await page.fill('#retriesInput', '1');
    await page.click('#settingsSave');
    await page.waitForFunction(() => !document.querySelector('#settingsDialog').open);
    assert.equal(app.config.settings.retries, 1);
    assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
    await page.screenshot({path: path.join(screenshots, '04-midnight-results.png'), fullPage: true});
    // Reconnect and verify recovered state, not duplicate entries or auto-downloads.
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#statDone').textContent === '5');
    assert.equal(app.queue.running, false);
    // Large collection + hostile filename must render as text, with 50 rows per page.
    const big = Array.from({length: 125}, (_, i) => ({
        name: i === 0 ? '<img src=x onerror=window.__injected=1>.zip' : `Resource-pack-${String(i + 1).padStart(3, '0')}.zip`,
        url: `https://example.com/resources/${i}`,
        kind: 'direct'
    }));
    app.queue.add(big);
    await page.waitForFunction(() => document.querySelector('#statTotal').textContent === '131');
    assert.equal(await page.locator('#fileRows tr').count(), 50);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    await page.click('#nextPage');
    await page.waitForFunction(() => document.querySelector('#pageNumber').textContent === '2 / 3');
    assert.equal(await page.locator('#fileRows tr').count(), 50);
    await page.click('#themeBtn');
    await page.click('#prevPage');
    await page.screenshot({path: path.join(screenshots, '05-large-collection.png'), fullPage: true});
    await page.click('#navActivity');
    assert.ok(await page.locator('#fullLog .log-entry').count() > 0);
    await page.click('[data-close="activityDialog"]');
    for (const width of [1000, 768, 390]) {
        await page.setViewportSize({width, height: 900});
        await page.screenshot({path: path.join(screenshots, `responsive-${width}.png`), fullPage: true});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `No page overflow at ${width}px`);
    }
    // Invalid import must leave the previous queue intact and show an inline error.
    await page.setViewportSize({width: 1500, height: 1000});
    await page.click('#importBtn');
    await page.fill('#importText', 'file:///secret');
    await page.click('#importSave');
    await page.waitForFunction(() => !document.querySelector('#importError').classList.contains('hidden'));
    assert.equal(app.queue.files.length, 131);
    await page.click('[data-close="importDialog"]');
    // SSE outage disables controls; a browser reload reconnects to the saved queue.
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    assert.equal(await page.locator('#importBtn').isDisabled(), true);
    await page.context().setOffline(false);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#connection').textContent.includes('Live connection'));
    assert.deepEqual(errors, []);
    const external = requests.filter(url => !url.startsWith(origin) && !url.startsWith('blob:'));
    assert.deepEqual(external, []);
    console.log(JSON.stringify({
        result: 'passed',
        tested: ['import', 'selection', 'queue', 'pause/resume', 'error rendering', 'file inspector', 'filters/search', 'settings', 'light/dark', 'reload recovery', '131 files/pagination', 'text injection', 'responsive layout', 'invalid import', 'offline recovery'],
        pageErrors: errors.length,
        consoleErrors,
        screenshots
    }, null, 2));
} finally {
    await browser?.close();
    await app.close();
    fs.rmSync(directory, {recursive: true, force: true});
}
