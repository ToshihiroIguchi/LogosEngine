/*
 * Regression E2E tests for bugs found during the comprehensive audit.
 * Usage: node scripts/e2e_regression.cjs [baseUrl]
 *   baseUrl defaults to $LOGOS_URL or http://localhost:5173
 *   Chrome path defaults to $CHROME_PATH or the standard Windows location.
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
    console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${details ? ' - ' + details : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForEngine(page) {
    await page.waitForFunction(
        () => !document.body.innerText.includes('Initializing...') && !!window.monaco,
        { timeout: 120000 }
    );
    await page.waitForFunction(
        () => !document.body.innerText.includes('Loading graphics') && !document.body.innerText.includes('Loading Graphics'),
        { timeout: 120000 }
    ).catch(() => {});
}

const cellText = (page, idx) =>
    page.evaluate((i) => (document.querySelectorAll('main .group')[i]?.innerText || '').replace(/\s+/g, ' '), idx);

/** Replaces the content of cell `idx` and runs it; resolves once the execution counter changed and output settled. */
async function runCell(page, idx, code) {
    await page.evaluate((i, c) => window.monaco.editor.getEditors()[i].setValue(c), idx, code);
    await sleep(500); // let React commit the new content before executing
    const before = (await cellText(page, idx)).match(/In \[(\d*| )\]/)?.[1];
    await page.evaluate((i) => window.monaco.editor.getEditors()[i].trigger('e2e', 'execute-cell', null), idx);
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        await sleep(250);
        const now = (await cellText(page, idx)).match(/In \[(\d*| |\*)\]/)?.[1];
        // Done once the counter changed and the cell is no longer showing the running marker
        if (now !== before && now !== '*') break;
    }
    await sleep(1200); // allow auto-fix re-runs / rendering to settle
    return cellText(page, idx);
}

const idbCount = (page, store) =>
    page.evaluate(
        (s) =>
            new Promise((res, rej) => {
                const r = indexedDB.open('logos-calc-db');
                r.onsuccess = () => {
                    const db = r.result;
                    const g = db.transaction(s).objectStore(s).getAll();
                    g.onsuccess = () => {
                        const v = g.result;
                        db.close();
                        res(v);
                    };
                    g.onerror = rej;
                };
                r.onerror = rej;
            }),
        store
    );

async function main() {
    console.log(`Regression E2E against ${URL}`);
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--window-size=1440,900'],
    });
    const consoleErrors = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        page.on('pageerror', (e) => consoleErrors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text());
        });

        await page.goto(URL, { waitUntil: 'domcontentloaded' });
        await waitForEngine(page);
        await sleep(1500);

        // H3: a fresh profile must contain exactly one notebook
        const metas = await idbCount(page, 'meta');
        check('H3 fresh start creates exactly one notebook', metas.length === 1, `found ${metas.length}`);

        // H2: edits on a fresh profile must be auto-saved
        await page.evaluate(() => window.monaco.editor.getEditors()[0].setValue('autosave_probe = 1'));
        await sleep(2500);
        const notebooks = await idbCount(page, 'notebooks');
        check('H2 autosave works on first run', JSON.stringify(notebooks).includes('autosave_probe'));

        // H6: keyword args such as ics must not become equations
        let t = await runCell(page, 1, "f = Function('f')\ndsolve(f(x).diff(x) - f(x), f(x), ics={f(0): 1})");
        check('H6 dsolve with ics= solves the IVP', /f\(x\)\s*=\s*e/.test(t), t.slice(0, 160));

        t = await runCell(page, 1, 'solve([x + y = 1, x - y = 2], [x, y])');
        check('H7 equations inside a list are supported at runtime', /3\s*2|3\/2/.test(t) && !/Error/.test(t), t.slice(0, 160));

        t = await runCell(page, 1, 'solve(x^2 = 4, x)');
        check('caret + equation sugar', /\[−?-?2, 2\]|\[ ?− ?2 ?, ?2 ?\]/.test(t) || (t.includes('2') && /-2|−\s*2/.test(t)), t.slice(0, 160));

        // M3: a cell must not run twice when it waits on extensions / contains plot3d
        t = await runCell(page, 1, "print('ONCE')\nplot3d(x*y, (x,-1,1), (y,-1,1), show=False)");
        // Count only the output section (the cell source also contains the word)
        const onceCount = (t.split(/Out \[\d+\]:/).slice(1).join(' ').match(/ONCE/g) || []).length;
        check("M3 cell side effects run exactly once", onceCount === 1, `ONCE x${onceCount}: ${t.slice(0, 400)}`);

        // M6: sys.exit() must not break the engine
        await runCell(page, 1, "import sys\nprint('before')\nsys.exit()");
        t = await runCell(page, 1, '1+1');
        check('M6 engine survives sys.exit()', /Out \[\d+\]: 2/.test(t), t.slice(0, 120));

        // H1: autocomplete answers
        const suggestions = await page.evaluate(async () => {
            const ed = window.monaco.editor.getEditors()[1];
            ed.setValue('sol');
            ed.focus();
            ed.setPosition({ lineNumber: 1, column: 4 });
            await new Promise((r) => setTimeout(r, 300));
            ed.trigger('e2e', 'editor.action.triggerSuggest', {});
            await new Promise((r) => setTimeout(r, 2500));
            return [...document.querySelectorAll('.suggest-widget .monaco-list-row')].map((r) => r.getAttribute('aria-label') || r.innerText);
        });
        check('H1 completions are returned', suggestions.some((s) => s.startsWith('solve')), suggestions.slice(0, 3).join(' | '));

        // M8: switching to dark mode must reach existing editors
        const clickByText = (txt) =>
            page.evaluate((x) => {
                const b = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === x || (x === 'Mode' && e.innerText.includes('Mode')));
                if (b) b.click();
                return !!b;
            }, txt);
        await clickByText('Mode');
        await sleep(300);
        await clickByText('Dark');
        await sleep(800);
        const darkState = await page.evaluate(() => ({
            html: document.documentElement.classList.contains('dark'),
            editors: [...document.querySelectorAll('.monaco-editor')].map((e) => /vs-dark/.test(e.className)),
        }));
        check('M8 dark mode reaches existing editors', darkState.html && darkState.editors.length > 0 && darkState.editors.every(Boolean), JSON.stringify(darkState));
        await clickByText('Mode');
        await sleep(300);
        await clickByText('Light');
        await sleep(500);

        // H4: importing a notebook with a stale error output must not rewrite or run the cell
        const importFile = path.join(os.tmpdir(), `logos-import-${Date.now()}.json`);
        const stale = {
            title: 'Stale Error Import',
            cells: [
                {
                    id: 'stale-1',
                    type: 'code',
                    content: 'q + 1',
                    executionCount: 7,
                    outputs: [{ type: 'error', value: "name 'q' is not defined", errorName: 'NameError', missingVariables: ['q'], timestamp: 0 }],
                },
            ],
        };
        fs.writeFileSync(importFile, JSON.stringify(stale));
        const input = await page.$('input[type="file"]');
        await input.uploadFile(importFile);
        await sleep(4000);
        const imported = await page.evaluate(() => ({
            content: window.monaco.editor.getEditors()[0]?.getValue(),
            text: (document.querySelector('main .group')?.innerText || '').replace(/\s+/g, ' '),
        }));
        check('H4 import does not rewrite the cell', imported.content === 'q + 1', JSON.stringify(imported.content));
        check('H4 import does not re-run the cell', /In \[7\]/.test(imported.text), imported.text.slice(0, 100));
        fs.unlinkSync(importFile);

        // Import hardening: a non-PNG image output must be dropped
        const evil = {
            title: 'Evil Image',
            cells: [{ type: 'code', content: '1', outputs: [{ type: 'image', value: 'https://example.com/x.png', timestamp: 0 }] }],
        };
        fs.writeFileSync(importFile, JSON.stringify(evil));
        await (await page.$('input[type="file"]')).uploadFile(importFile);
        await sleep(2500);
        const externalImgs = await page.evaluate(() => [...document.querySelectorAll('main img')].filter((i) => i.src.startsWith('http')).length);
        check('Import drops non-data-URL image outputs', externalImgs === 0, `${externalImgs} external images`);
        fs.unlinkSync(importFile);

        const critical = consoleErrors.filter((e) => !/favicon|ResizeObserver/.test(e));
        check('No console errors during run', critical.length === 0, critical.slice(0, 3).join(' ; '));

        // H5: when the engine cannot load, the UI must show a failure state with Retry
        const page2 = await browser.newPage();
        // Simulate the worker reporting an initialization failure (e.g. CDN unreachable)
        await page2.evaluateOnNewDocument(() => {
            const RealWorker = window.Worker;
            window.Worker = class extends RealWorker {
                constructor(url, opts) {
                    super(url, opts);
                    setTimeout(() => {
                        this.dispatchEvent(new MessageEvent('message', {
                            data: { type: 'ERROR', message: 'Pyodide initialization failed: simulated' },
                        }));
                    }, 300);
                }
            };
        });
        await page2.goto(URL, { waitUntil: 'domcontentloaded' });
        const failed = await page2
            .waitForFunction(() => document.body.innerText.includes('Engine failed to start'), { timeout: 60000 })
            .then(() => true)
            .catch(() => false);
        check('H5 engine load failure shows an error with Retry', failed);
        await page2.close();
    } catch (err) {
        console.error('Test run crashed:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
        const failedCount = results.filter((r) => !r.passed).length;
        console.log(`\n${results.length - failedCount}/${results.length} passed`);
        if (failedCount > 0) process.exitCode = 1;
        const outDir = path.resolve(__dirname, '../scratch');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'e2e_regression_results.json'), JSON.stringify(results, null, 2));
    }
}

main();
