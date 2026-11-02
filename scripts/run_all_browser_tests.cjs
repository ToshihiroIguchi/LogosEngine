const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Usage: node scripts/run_all_browser_tests.cjs [baseUrl]
// baseUrl defaults to $LOGOS_URL or http://localhost:5173 (npm run dev).
// For a production build use: npm run build && python serve.py, then pass http://localhost:8300
const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.argv[2] || process.env.LOGOS_URL || 'http://localhost:5173';
const SCREENSHOT_DIR = path.resolve(__dirname, '../scratch/comprehensive_test');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const testResults = [];

function recordResult(category, testName, passed, details = '') {
    testResults.push({ category, testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${category}] ${testName}${details ? ' - ' + details : ''}`);
}

async function runTestSuite() {
    console.log('====================================================');
    console.log('🚀 Starting Comprehensive Browser Test Suite for LogosEngine');
    console.log(`URL: ${URL}`);
    console.log('====================================================\n');

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
    });

    let page;
    const consoleErrors = [];
    const consoleLogs = [];

    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        const cdpClient = await page.target().createCDPSession();

        page.on('console', msg => {
            const text = msg.text();
            consoleLogs.push(text);
            console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${text}`);
            if (msg.type() === 'error') {
                consoleErrors.push(text);
            }
        });

        page.on('pageerror', err => {
            console.error(`[BROWSER PAGE ERROR] ${err.toString()}`);
            consoleErrors.push(err.toString());
        });

        browser.on('targetcreated', async target => {
            console.log('[BROWSER TARGET CREATED]', target.type(), target.url());
            if (target.type() === 'worker') {
                const worker = await target.worker();
                worker?.on('console', msg => console.log(`[WORKER CONSOLE] ${msg.text()}`));
            }
        });

        // ----------------------------------------------------
        // SUITE 1: Initialization & Engine Startup
        // ----------------------------------------------------
        console.log('\n--- SUITE 1: Initialization & Engine Startup ---');
        await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

        // 1-1. Page Title and Header
        const headerText = await page.evaluate(() => document.querySelector('h1')?.textContent || '');
        recordResult('Suite 1', 'App Title & Header Render', headerText.includes('LogosCalc'), `Header: "${headerText}"`);

        // 1-2. Wait for Engine Ready
        console.log('Waiting for Pyodide engine initialization (including extensions)...');
        await page.waitForFunction(() => {
            const statusEl = document.querySelector('.text-green-600');
            return statusEl && statusEl.textContent.trim() === 'Ready';
        }, { timeout: 90000 });
        recordResult('Suite 1', 'Pyodide WASM Engine Ready', true, 'Status badge showed Ready (Phase 1 & 2 complete)');

        // 1-3. Startup Profile log
        const hasProfileLog = consoleLogs.some(l => l.includes('Logos Engine Startup Profile') || l.includes('Worker:'));
        recordResult('Suite 1', 'Startup Profile in Console', hasProfileLog, 'Worker & profile logs detected');

        // 1-4. Disclaimer Modal (Legal Notice & Risk)
        const disclaimerOpened = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Legal & Risk'));
            if (btn) { btn.click(); return true; }
            return false;
        });
        if (disclaimerOpened) {
            await new Promise(r => setTimeout(r, 500));
            const modalTitle = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
            const hasLegalNotice = modalTitle.includes('Legal Notice') || modalTitle.includes('Risk');
            recordResult('Suite 1', 'Disclaimer Modal Open', hasLegalNotice, `Title: "${modalTitle}"`);
            
            // Close modal with button
            const closeBtn = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Understand & Continue'));
                if (btn) { btn.click(); return true; }
                return false;
            });
            await new Promise(r => setTimeout(r, 400));
            recordResult('Suite 1', 'Disclaimer Modal Close', closeBtn, 'Closed via Understand & Continue');
        } else {
            recordResult('Suite 1', 'Disclaimer Modal Button', false, 'Legal & Risk button not found');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_initial_state.png') });

        // Helper to run code in the first Monaco editor
        async function runCodeInFirstCell(code) {
            const editorViewLine = await page.waitForSelector('.monaco-editor .view-line', { timeout: 5000 });
            await editorViewLine.click();
            await new Promise(r => setTimeout(r, 200));

            // Select all and replace using insertText (prevents auto-closing bracket duplication)
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            await new Promise(r => setTimeout(r, 100));

            // Insert text directly via Chrome DevTools Protocol
            await cdpClient.send('Input.insertText', { text: code });
            await new Promise(r => setTimeout(r, 300));

            // Click Run Cell button (Shift+Enter)
            const runBtn = await page.waitForSelector('button[title="Run Cell (Shift+Enter)"]', { timeout: 5000 });
            await runBtn.click();

            // Wait for execution (Pyodide worker execution)
            await new Promise(r => setTimeout(r, 4000));

            // Return cell outputs
            const cellOuts = await page.evaluate(() => {
                const outElements = Array.from(document.querySelectorAll('.font-mono, .katex, pre, code'));
                return outElements.map(el => el.textContent.trim()).filter(t => t.length > 0);
            });
            console.log(`[EXEC CODE] "${code}" -> Outputs (${cellOuts.length}):`, cellOuts.slice(0, 14));
            return cellOuts;
        }

        // ----------------------------------------------------
        // SUITE 2: Mathematical Computation & SymPy & Transpilation
        // ----------------------------------------------------
        console.log('\n--- SUITE 2: Mathematical Computation & SymPy & Transpilation ---');

        // 2-1. Basic Algebra: expand((x+1)**5)
        console.log('Testing: expand((x + 1)**5)...');
        let outputs = await runCodeInFirstCell('expand((x + 1)**5)');
        const hasExpandResult = outputs.some(t => /x\^?5\s*\+\s*5\s*\*?\s*x\^?4\s*\+\s*10/.test(t.replace(/\s+/g, '')) || t.replace(/\s+/g, '').includes('x**5+5*x**4+10*x**3+10*x**2+5*x+1'));
        recordResult('Suite 2', 'Expand Polynomial', hasExpandResult, 'Output rendered KaTeX polynomial');

        // 2-2. Calculus: diff & integrate
        console.log('Testing: diff and integrate...');
        outputs = await runCodeInFirstCell('integrate(exp(-x**2), (x, -oo, oo))');
        const hasGaussianIntegral = outputs.some(t => t.includes('sqrt(pi)') || t.includes('\\sqrt{\\pi}') || t.includes('√π') || t.includes('sqrt'));
        recordResult('Suite 2', 'Definite Integral (Gaussian)', hasGaussianIntegral, 'Result contains sqrt(pi)');

        // 2-3. Caret exponentiation: 2^3 and x^2
        console.log('Testing: Caret exponentiation 2^3...');
        outputs = await runCodeInFirstCell('2^3');
        // The value is rendered as KaTeX MathML + KaTeX HTML + plain text, so textContent is '888'
        const hasCaretResult = outputs.some(t => /^8{1,3}$/.test(t));
        recordResult('Suite 2', 'Caret Exponentiation (2^3 -> 8)', hasCaretResult, 'Computed 8 via ** transpilation');

        // 2-4. Equation syntax sugar: solve(x^2 = 4, x)
        console.log('Testing: Equation sugar solve(x^2 = 4, x)...');
        outputs = await runCodeInFirstCell('solve(x^2 = 4, x)');
        const hasEquationResult = outputs.some(t => (t.includes('-2') && t.includes('2')) || t.includes('[-2, 2]'));
        recordResult('Suite 2', 'Equation Syntax Sugar solve(x^2 = 4)', hasEquationResult, 'Produced [-2, 2]');

        // 2-5. Linear Algebra Matrix eigenvalues
        console.log('Testing: Matrix eigenvalues...');
        outputs = await runCodeInFirstCell('Matrix([[1, 2], [2, 1]]).eigenvals()');
        const hasEigenvals = outputs.some(t => t.includes('-1') && t.includes('3'));
        recordResult('Suite 2', 'Matrix Eigenvalues', hasEigenvals, 'Found eigenvalues -1 and 3');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_math_calculations.png') });

        // ----------------------------------------------------
        // SUITE 3: Error Handling & Undefined Variable Quick Fix
        // ----------------------------------------------------
        console.log('\n--- SUITE 3: Error Handling & Quick Fix ---');

        // 3-1. Quick fix for undefined symbols (e.g. solving with unknown symbol w).
        // The code is never rewritten or re-run on its own: the error offers a button instead.
        console.log('Testing quick fix with undefined variable w...');
        await runCodeInFirstCell('solve(w + 7 = 0, w)');
        const errorShown = await page.evaluate(() => document.body.innerText.toLowerCase().includes('nameerror'));
        recordResult('Suite 3', 'Undefined Variable Reports NameError', errorShown, 'Code was not rewritten automatically');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('as Symbol'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 4000));
        outputs = await page.evaluate(() => {
            const outElements = Array.from(document.querySelectorAll('.font-mono, .katex, pre, code'));
            return outElements.map(el => el.textContent.trim()).filter(t => t.length > 0);
        });
        const hasAutoFixOutput = outputs.some(t => t.includes('-7') || t.includes('[-7]'));
        recordResult('Suite 3', 'Quick Fix Button Defines Symbol', hasAutoFixOutput, 'Clicking the button defined w and produced [-7]');

        // 3-2. SyntaxError marker display
        console.log('Testing SyntaxError display...');
        outputs = await runCodeInFirstCell('def broken_syntax(:');
        const hasErrorOutput = outputs.some(t => t.includes('SyntaxError') || t.includes('invalid syntax'));
        const hasErrorBox = await page.evaluate(() => document.querySelectorAll('.bg-\\[\\#FFF5F5\\], .text-\\[\\#E53E3E\\]').length > 0);
        recordResult('Suite 3', 'SyntaxError Display & Marker', hasErrorOutput || hasErrorBox, 'Error banner rendered gracefully');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_error_handling.png') });

        // ----------------------------------------------------
        // SUITE 4: Variable Range & Assumptions UI
        // ----------------------------------------------------
        console.log('\n--- SUITE 4: Variable Assumptions & Range UI ---');

        // Open Variables Tab in Sidebar
        const varTabBtn = await page.waitForSelector('button[title="Variable Inspector"]', { timeout: 5000 });
        await varTabBtn.click();
        await new Promise(r => setTimeout(r, 500));

        // Click Define Variable
        const defineBtn = await page.waitForSelector('button[title*="Define"]', { timeout: 5000 });
        await defineBtn.click();
        await new Promise(r => setTimeout(r, 500));

        // Check Modal
        const modalHeader = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
        const modalVisible = modalHeader.includes('Define Variable');
        recordResult('Suite 4', 'Define Variable Modal Opened', modalVisible, `Modal title: "${modalHeader}"`);

        // Check Presets
        const presetsCount = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.filter(b => b.textContent.includes('Positive') || b.textContent.includes('Real') || b.textContent.includes('Integer')).length;
        });
        recordResult('Suite 4', 'Presets Displayed', presetsCount >= 3, `Found ${presetsCount} preset buttons`);

        // Select Positive
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const positiveBtn = buttons.find(b => b.textContent.includes('Positive') && !b.textContent.includes('Non-positive'));
            if (positiveBtn) positiveBtn.click();
        });
        await new Promise(r => setTimeout(r, 300));

        // Apply to Session
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const applyBtn = buttons.find(b => b.textContent.includes('Apply to Session') || b.textContent.includes('Update Session'));
            if (applyBtn) applyBtn.click();
        });
        await new Promise(r => setTimeout(r, 1000));

        // Verify Range Badge
        const rangeBadge = await page.evaluate(() => {
            const badges = Array.from(document.querySelectorAll('span'));
            const badge = badges.find(s => s.textContent.includes('x > 0') || s.textContent.includes('> 0'));
            return badge ? badge.textContent.trim() : null;
        });
        recordResult('Suite 4', 'Variable Range Badge Visible', !!rangeBadge, `Badge: "${rangeBadge}"`);

        // Test Assumption in Math Calculation
        outputs = await runCodeInFirstCell('solve(x^2 - 4, x)');
        const hasOnlyPositive = outputs.some(t => t === '[2]' || t.includes('[2]') || t.includes('\\left[ 2\\right]'));
        const hasNoNegative = !outputs.some(t => t.includes('-2'));
        recordResult('Suite 4', 'Mathematical Assumption Effect (x > 0 -> only [2])', hasOnlyPositive && hasNoNegative, 'Negative solution -2 was excluded');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_assumptions_ui.png') });

        // ----------------------------------------------------
        // SUITE 5: ResultView Toolbar (fx, Copy, Clear)
        // ----------------------------------------------------
        console.log('\n--- SUITE 5: ResultView Toolbar ---');

        const hasResultToolbar = await page.evaluate(() => {
            return document.querySelector('button[title="Math actions"], button[title="Clear Output"]') !== null;
        });
        recordResult('Suite 5', 'Result Toolbar Elements Present', hasResultToolbar, 'Found Math actions / Clear buttons');

        // ----------------------------------------------------
        // SUITE 6: Graphics & Matplotlib Plotting
        // ----------------------------------------------------
        console.log('\n--- SUITE 6: Graphics & Matplotlib Plotting ---');

        console.log('Testing: plot(sin(x))...');
        await runCodeInFirstCell('plot(sin(x))');
        await new Promise(r => setTimeout(r, 5000));

        const hasPlotImage = await page.evaluate(() => {
            const images = Array.from(document.querySelectorAll('img[alt="Plot"]'));
            return images.some(img => img.src && img.src.startsWith('data:image/png;base64,'));
        });
        recordResult('Suite 6', 'Matplotlib Inline Plot Generation', hasPlotImage, 'Rendered data:image/png;base64 image element');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_matplotlib_plot.png') });

        // ----------------------------------------------------
        // SUITE 7: Sidebar Tabs & Documentation & Symbols & Examples
        // ----------------------------------------------------
        console.log('\n--- SUITE 7: Sidebar Tabs & Features ---');

        // 7-1. Documentation Tab
        const docTabBtn = await page.waitForSelector('button[title="Documentation Search"]', { timeout: 5000 });
        await docTabBtn.click();
        await new Promise(r => setTimeout(r, 400));
        
        // Search doc for 'diff'
        const docInput = await page.waitForSelector('input[placeholder*="Search"]', { timeout: 5000 });
        await docInput.click();
        await docInput.type('diff');
        await page.keyboard.press('Enter');
        await new Promise(r => setTimeout(r, 2500));

        const hasDocResult = await page.evaluate(() => {
            const text = document.querySelector('.group\\/sidebar')?.textContent || document.body.textContent || '';
            return text.includes('diff') || text.includes('Derivative');
        });
        recordResult('Suite 7', 'Documentation Search (diff)', hasDocResult, 'Documentation results displayed');

        // 7-2. Symbols Tab
        const symbolsTabBtn = await page.waitForSelector('button[title="Common Symbols"]', { timeout: 5000 });
        await symbolsTabBtn.click();
        await new Promise(r => setTimeout(r, 600));

        const hasSymbols = await page.evaluate(() => {
            return document.querySelectorAll('button[title*="Insert"], .katex').length > 5;
        });
        recordResult('Suite 7', 'Symbols Palette Loaded', hasSymbols, 'Math symbols palette rendered');

        // 7-3. Examples Tab
        const examplesTabBtn = await page.waitForSelector('button[title="Examples"]', { timeout: 5000 });
        await examplesTabBtn.click();
        await new Promise(r => setTimeout(r, 800));

        const hasExamples = await page.evaluate(() => {
            const text = document.querySelector('.group\\/sidebar')?.textContent || document.body.textContent || '';
            return text.includes('Algebra') || text.includes('Calculus') || text.includes('Simplification');
        });
        recordResult('Suite 7', 'Examples Categories Loaded', hasExamples, 'Categories Algebra, Calculus etc. present');

        // 7-4. Files Tab (Notebook Explorer)
        const filesTabBtn = await page.waitForSelector('button[title*="File Explorer"]', { timeout: 5000 });
        await filesTabBtn.click();
        await new Promise(r => setTimeout(r, 400));

        const hasStorageBar = await page.evaluate(() => {
            const text = document.body.textContent || '';
            return text.includes('Notebook Storage') || text.includes('/ 50');
        });
        recordResult('Suite 7', 'Notebook Explorer & Storage Usage', hasStorageBar, 'Notebook list & storage capacity shown');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_sidebar_tabs.png') });

        // ----------------------------------------------------
        // SUITE 8: Notebook Management & Auto-Save & Export
        // ----------------------------------------------------
        console.log('\n--- SUITE 8: Notebook Management & Auto-Save & Export ---');

        // 8-1. Title Rename
        const titleEl = await page.waitForSelector('header span.text-lg.font-bold', { timeout: 5000 });
        await titleEl.click();
        await new Promise(r => setTimeout(r, 300));

        const titleInput = await page.$('header input[type="text"]');
        if (titleInput) {
            await titleInput.click();
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.type('Verified Analysis Notes');
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 800));

            const updatedTitle = await page.evaluate(() => document.querySelector('header span.text-lg.font-bold')?.textContent || '');
            recordResult('Suite 8', 'Notebook Title Rename', updatedTitle === 'Verified Analysis Notes', `Updated title: "${updatedTitle}"`);
        } else {
            recordResult('Suite 8', 'Notebook Title Input', false, 'Title edit input not spawned');
        }

        // 8-2. Auto-Save status badge
        const saveStatus = await page.evaluate(() => {
            const badges = Array.from(document.querySelectorAll('span'));
            return badges.some(b => b.textContent.includes('Saved') || b.textContent.includes('Saving...'));
        });
        recordResult('Suite 8', 'Auto-Save Status Badge', saveStatus, 'Saved indicator present in header');

        // 8-3. Cell addition & deletion
        const initialCellCount = await page.evaluate(() => document.querySelectorAll('.monaco-editor').length);
        const addCodeBtn = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Code') && b.querySelector('svg'));
            if (btn) { btn.click(); return true; }
            return false;
        });
        await new Promise(r => setTimeout(r, 500));
        const afterAddCount = await page.evaluate(() => document.querySelectorAll('.monaco-editor').length);
        recordResult('Suite 8', 'Add Code Cell Action', afterAddCount > initialCellCount, `Cells: ${initialCellCount} -> ${afterAddCount}`);

        // 8-4. Export Jupyter & JSON buttons check
        const hasExportJupyter = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.some(b => b.title?.includes('Jupyter') || b.textContent.includes('Jupyter') || b.title?.includes('Export'));
        });
        recordResult('Suite 8', 'Jupyter Export UI Available', hasExportJupyter, 'Export button found in UI');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_notebook_management.png') });

        // ----------------------------------------------------
        // SUITE 9: Theme Toggle & Localization & DevTools Health
        // ----------------------------------------------------
        console.log('\n--- SUITE 9: Theme Toggle & Localization & DevTools Health ---');

        // 9-1. Dark Mode Toggle
        const themeBtnClicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Mode'));
            if (btn) { btn.click(); return true; }
            return false;
        });

        let darkThemeToggled = false;
        if (themeBtnClicked) {
            await new Promise(r => setTimeout(r, 300));
            // Click 'Dark' option
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const darkBtn = btns.find(b => b.textContent.trim() === 'Dark');
                if (darkBtn) darkBtn.click();
            });
            await new Promise(r => setTimeout(r, 500));
            const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));

            // Switch back to Light
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const btn = btns.find(b => b.textContent.includes('Mode'));
                if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 300));
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const lightBtn = btns.find(b => b.textContent.trim() === 'Light');
                if (lightBtn) lightBtn.click();
            });
            await new Promise(r => setTimeout(r, 500));
            const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'));

            darkThemeToggled = isDark && isLight;
            recordResult('Suite 9', 'Dark / Light Theme Toggle', darkThemeToggled, 'Toggled to Dark then back to Light cleanly');
        } else {
            recordResult('Suite 9', 'Theme Toggle Button', false, 'Theme toggle button not found');
        }

        // 9-2. English Localization Check (ensure no leftover Japanese in entire UI)
        const fullBodyText = await page.evaluate(() => document.body.innerText || '');
        const japaneseMatches = fullBodyText.match(new RegExp('[\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF]+', 'g')) || [];
        const isEnglishClean = japaneseMatches.length === 0;
        recordResult('Suite 9', 'UI English Localization', isEnglishClean, isEnglishClean ? 'Zero Japanese characters detected in UI' : `Found leftover: ${japaneseMatches.slice(0, 5).join(', ')}`);

        // 9-3. DevTools Console Errors Check
        const criticalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('ResizeObserver'));
        const noConsoleErrors = criticalErrors.length === 0;
        recordResult('Suite 9', 'DevTools Console Health', noConsoleErrors, noConsoleErrors ? 'Zero unhandled console errors' : `Errors: ${criticalErrors.slice(0, 3).join('; ')}`);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_final_overview.png') });

    } catch (err) {
        console.error('❌ Test Suite crashed with error:', err);
        console.log('--- ALL BROWSER CONSOLE LOGS ---');
        console.log(consoleLogs.join('\n'));
        console.log('--- ALL BROWSER CONSOLE ERRORS ---');
        console.log(consoleErrors.join('\n'));
        if (page) {
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'crash_screenshot.png') }).catch(() => {});
        }
        process.exitCode = 1;
    } finally {
        await browser.close();

        console.log('\n====================================================');
        console.log('📊 TEST SUMMARY & SCORECARD:');
        console.log('====================================================');
        const passedCount = testResults.filter(r => r.passed).length;
        const totalCount = testResults.length;
        console.log(`Total Tests Run : ${totalCount}`);
        console.log(`Tests Passed    : ${passedCount}`);
        console.log(`Tests Failed    : ${totalCount - passedCount}`);
        console.log(`Success Rate    : ${totalCount ? ((passedCount / totalCount) * 100).toFixed(1) : '0.0'}%`);
        if (passedCount !== totalCount || totalCount === 0) process.exitCode = 1;
        console.log('====================================================\n');

        fs.writeFileSync(path.join(SCREENSHOT_DIR, 'test_results.json'), JSON.stringify(testResults, null, 2));
    }
}

runTestSuite();
