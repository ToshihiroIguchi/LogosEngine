/*
 * E2E checks for the second audit (execution order, Run All, soft interrupt, notebook switching, ...).
 * Usage: node scripts/e2e_audit2.cjs [baseUrl]
 *   baseUrl defaults to $LOGOS_URL or http://localhost:5173
 *   For soft-interrupt checks the page must be cross-origin isolated (npm run dev, or serve.py after a build).
 * Exits with code 1 if any check fails.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || process.env.LOGOS_URL || 'http://localhost:5173';

const results = [];
function check(name, passed, details = '') {
    results.push({ name, passed, details });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details ? ' - ' + String(details).slice(0, 300) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEngine(page) {
    await page.waitForFunction(
        () => !document.body.innerText.includes('Initializing...') && !!window.monaco && window.monaco.editor.getEditors().length > 0,
        { timeout: 120000 }
    );
}

async function waitForGraphics(page) {
    await page.waitForFunction(
        () => [...document.querySelectorAll('header span')].some((s) => s.textContent.trim() === 'Ready'),
        { timeout: 180000 }
    );
}

const cellText = (page, idx) =>
    page.evaluate((i) => (document.querySelectorAll('main > .space-y-4 > .group')[i]?.innerText || '').replace(/\s+/g, ' '), idx);

const counterOf = (text) => text.match(/In \[(\d*| |\*)\]/)?.[1];

async function setCode(page, idx, code) {
    await page.evaluate((i, c) => window.monaco.editor.getEditors()[i].setValue(c), idx, code);
    await sleep(400);
}

const trigger = (page, idx) =>
    page.evaluate((i) => window.monaco.editor.getEditors()[i].trigger('e2e', 'execute-cell', null), idx);

async function waitForDone(page, idx, before) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        await sleep(250);
        const now = counterOf(await cellText(page, idx));
        if (now !== before && now !== '*') break;
    }
    await sleep(600);
    return cellText(page, idx);
}

async function runCell(page, idx, code) {
    await setCode(page, idx, code);
    const before = counterOf(await cellText(page, idx));
    await trigger(page, idx);
    return waitForDone(page, idx, before);
}

async function clickButton(page, predicate) {
    return page.evaluate((src) => {
        const test = new Function('b', `return (${src})(b)`);
        const b = [...document.querySelectorAll('button')].find((e) => test(e));
        if (b) b.click();
        return !!b;
    }, predicate.toString());
}

const idb = (page, store) =>
    page.evaluate(
        (s) =>
            new Promise((res, rej) => {
                const r = indexedDB.open('logos-calc-db');
                r.onsuccess = () => {
                    const db = r.result;
                    const g = db.transaction(s).objectStore(s).getAll();
                    g.onsuccess = () => { const v = g.result; db.close(); res(v); };
                    g.onerror = rej;
                };
                r.onerror = rej;
            }),
        store
    );

async function importJson(page, data, name = 'import.json') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logos-e2e-'));
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(data));
    const input = await page.$('input[type="file"]');
    await input.uploadFile(file);
    await sleep(1800);
    fs.rmSync(dir, { recursive: true, force: true });
}

const codeCell = (content, extra = {}) => ({ type: 'code', content, outputs: [], ...extra });

async function main() {
    console.log(`Audit-2 E2E against ${URL}`);
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        protocolTimeout: 60000,
        args: ['--no-sandbox', '--window-size=1440,900'],
    });
    const errors = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('error', (e) => console.log(`[PAGE CRASH] ${e}`));
        if (process.env.E2E_DEBUG_HANG) {
            // Prints the main thread's stack when the page stops answering
            const cdp = await page.createCDPSession();
            await cdp.send('Debugger.enable');
            cdp.on('Debugger.paused', (ev) => {
                console.log('[HANG STACK]' + String.fromCharCode(10) + ev.callFrames.slice(0, 12).map((f) => `  ${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.location.lineNumber}`).join(String.fromCharCode(10)));
                process.exit(2);
            });
            setInterval(async () => {
                const ok = await Promise.race([page.evaluate(() => 1).then(() => true).catch(() => true), sleep(8000).then(() => false)]);
                if (!ok) cdp.send('Debugger.pause').catch(() => {});
            }, 12000).unref();
        }
        browser.on('disconnected', () => console.log('[BROWSER DISCONNECTED]'));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('dialog', (d) => {
            if (process.env.E2E_VERBOSE) console.log(`[dialog] ${d.type()}: ${d.message()}`);
            d.accept();
        });
        if (process.env.E2E_VERBOSE) page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text().slice(0, 200)}`));

        // E2E_BYPASS_SW=1 simulates a browser/host where cross-origin isolation is impossible
        if (process.env.E2E_BYPASS_SW) await page.setBypassServiceWorker(true);
        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await waitForEngine(page);
        await sleep(1000);

        // A1/A2: cells run in the order they were started, even when the first one waits for extensions
        await setCode(page, 0, "log = []\nplot3d(x*y, (x,-1,1), (y,-1,1), show=False)\nlog.append('A')");
        await setCode(page, 1, "log.append('B')\nlog");
        const b0 = counterOf(await cellText(page, 0));
        const b1 = counterOf(await cellText(page, 1));
        await trigger(page, 0);
        await trigger(page, 1);
        await waitForDone(page, 0, b0);
        const t1 = await waitForDone(page, 1, b1);
        check('A1 execution order is preserved', /\['A', ?'B'\]|\[A,B\]|A.*B/.test(t1.split(/Out \[\d+\]:/).pop() || '') && !/\['B', ?'A'\]/.test(t1), t1.slice(-160));

        await waitForGraphics(page);

        // D2: an error without a message is still shown
        let t = await runCell(page, 1, 'assert False');
        check('D2 empty-message error is displayed', /AssertionError/i.test(t), t.slice(0, 160));

        // B1: the syntax rewriter keeps f-string debug specifiers intact
        t = await runCell(page, 1, 'a = 3\nprint(f"{a=}", 2^3)');
        check('B1 f"{a=}" survives caret rewriting', /a=3 8/.test(t), t.slice(0, 200));

        // A12: stderr
        t = await runCell(page, 1, "import sys\nsys.stderr.write('warnX')");
        check('A12 stderr is shown', /warnX/.test(t), t.slice(0, 160));

        // B6: display() shows several values in order
        t = await runCell(page, 1, 'display(expand((x+1)**3))\nfactor(x**3 + 3*x**2 + 3*x + 1)');
        const mathCount = await page.evaluate(() => document.querySelectorAll('main > .space-y-4 > .group')[1].querySelectorAll('.katex').length);
        check('B6 display() plus last expression render two results', mathCount >= 2, `${mathCount} katex nodes`);

        // B5: a plot does not leave "Plot object ..." junk in the output, but renders an image
        t = await runCell(page, 1, 'plot(sin(x), (x, -3, 3))');
        const imgs = await page.evaluate(() => document.querySelectorAll('main > .space-y-4 > .group')[1].querySelectorAll('img').length);
        check('B5 plot() shows an image and no Plot repr', imgs === 1 && !/Plot object|Plot\(/.test(t), `${imgs} images; ${t.slice(0, 200)}`);

        // C2: running a cell twice at the same time executes it once
        await setCode(page, 1, 'import time\ncnt = globals().get("cnt", 0) + 1\ntime.sleep(1.5)\ncnt');
        const bDup = counterOf(await cellText(page, 1));
        await trigger(page, 1);
        await trigger(page, 1);
        t = await waitForDone(page, 1, bDup);
        await sleep(2500);
        t = await cellText(page, 1);
        check('C2 double Shift+Enter runs once', /Out \[\d+\]: 1\b/.test(t), t.slice(-120));

        // A13: Stop keeps variables when the page is cross-origin isolated
        const isolated = await page.evaluate(() => crossOriginIsolated);
        console.log(`crossOriginIsolated = ${isolated}`);
        await runCell(page, 0, 'keepme = 41');
        await setCode(page, 1, 'while True:\n    pass');
        const bLoop = counterOf(await cellText(page, 1));
        await trigger(page, 1);
        await sleep(1500);
        await clickButton(page, (b) => b.innerText.trim() === 'Stop');
        await waitForDone(page, 1, bLoop);
        t = await runCell(page, 0, 'keepme + 1');
        if (isolated) {
            check('A13 soft interrupt keeps variables', /Out \[\d+\]: 42/.test(t), t.slice(0, 200));
        } else {
            check('A13 (not isolated) hard reset fallback still recovers', /Out \[\d+\]: 42|NameError/i.test(t), t.slice(0, 200));
        }

        // C1: Run All stops at the first error
        await importJson(page, {
            title: 'Run All Stops',
            cells: [codeCell('first = 1'), codeCell('1/0'), codeCell('third = 3')],
        });
        await sleep(500);
        await clickButton(page, (b) => b.innerText.includes('Run All'));
        await sleep(6000);
        const c2 = counterOf(await cellText(page, 2));
        const c1 = counterOf(await cellText(page, 1));
        check('C1 Run All stops after an error', c1 !== ' ' && c1 !== '' && (c2 === ' ' || c2 === ''), `cell1=[${c1}] cell2=[${c2}]`);

        // C4: switching notebooks keeps each notebook's variables
        await runCell(page, 0, 'zz_marker = 123');
        await clickButton(page, (b) => b.title === 'File Explorer (Notebooks)');
        await sleep(300);
        await page.evaluate(() => {
            const rows = [...document.querySelectorAll('[class*="cursor-pointer"]')].filter((e) => e.innerText.includes('Welcome Notebook') && e.querySelector('button[title="Delete Notebook"]'));
            rows[0]?.click();
        });
        await sleep(1500);
        await page.evaluate(() => {
            const rows = [...document.querySelectorAll('[class*="cursor-pointer"]')].filter((e) => e.innerText.includes('Run All Stops') && e.querySelector('button[title="Delete Notebook"]'));
            rows[0]?.click();
        });
        await sleep(1500);
        await clickButton(page, (b) => b.title === 'Variable Inspector');
        await sleep(1500);
        const sidebarText = await page.evaluate(() => document.body.innerText);
        check('C4 variables are restored when switching back', /zz_marker/.test(sidebarText), '');

        // C3: deleting the open notebook must not bring it back
        await clickButton(page, (b) => b.title === 'File Explorer (Notebooks)');
        await sleep(300);
        await page.evaluate(() => {
            const row = [...document.querySelectorAll('[class*="cursor-pointer"]')].find((e) => e.innerText.includes('Run All Stops') && e.querySelector('button[title="Delete Notebook"]'));
            row?.querySelector('button[title="Delete Notebook"]')?.click();
        });
        await sleep(4000);
        const titles = (await idb(page, 'meta')).map((m) => m.title);
        check('C3 deleted open notebook stays deleted', !titles.includes('Run All Stops'), titles.join(', '));

        // E6: a Jupyter notebook can be imported
        await importJson(page, {
            nbformat: 4,
            nbformat_minor: 5,
            metadata: {},
            cells: [
                { cell_type: 'markdown', id: 'm1', metadata: {}, source: ['# Hello'] },
                { cell_type: 'code', id: 'c1', metadata: {}, execution_count: 1, source: ['1 + 1'], outputs: [{ output_type: 'execute_result', execution_count: 1, data: { 'text/plain': ['2'] }, metadata: {} }] },
            ],
        }, 'jupyter-demo.ipynb');
        const titles2 = (await idb(page, 'meta')).map((m) => m.title);
        check('E6 .ipynb import creates a notebook', titles2.includes('jupyter-demo'), titles2.join(', '));

        // E3: the header title field always starts from the current name
        await page.evaluate(() => {
            const el = [...document.querySelectorAll('header span')].find((s) => s.textContent.trim() === 'jupyter-demo');
            el?.parentElement?.click();
        });
        await sleep(300);
        const editing = await page.evaluate(() => document.querySelector('header input[type="text"]')?.value);
        check('E3 title editor starts from the current title', editing === 'jupyter-demo', String(editing));
        await page.keyboard.press('Escape');
        await sleep(300);

        // B9: documentation search shows a description for a sympy function
        await clickButton(page, (b) => b.title === 'Documentation Search');
        await sleep(300);
        const searchBox = await page.$('input[placeholder^="Search docs"]');
        await searchBox.type('integrate');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim().startsWith('integrate')), { timeout: 60000 });
        await clickButton(page, (b) => b.innerText.trim().startsWith('integrate') && b.className.includes('text-left'));
        await page.waitForFunction(() => /description/i.test(document.body.innerText), { timeout: 30000 });
        await sleep(2500);
        const docText = await page.evaluate(() => document.body.innerText);
        check('B9 documentation opens with a description', /integrat/i.test(docText) && /description/i.test(docText), '');

        const critical = errors.filter((e) => !/favicon|ResizeObserver|Failed to load resource/.test(e));
        check('No unexpected console errors', critical.length === 0, critical.slice(0, 3).join(' ; '));
    } catch (err) {
        const where = String(err.stack).split('\n').filter((l) => l.includes('e2e_audit2')).join('\n');
        console.error(`Test run crashed: ${err.message}\n${where}`);
        process.exitCode = 1;
    } finally {
        await browser.close();
        const failedCount = results.filter((r) => !r.passed).length;
        console.log(`\n${results.length - failedCount}/${results.length} passed`);
        if (failedCount > 0) process.exitCode = 1;
        const outDir = path.resolve(__dirname, '../scratch');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'e2e_audit2_results.json'), JSON.stringify(results, null, 2));
    }
}

main();
