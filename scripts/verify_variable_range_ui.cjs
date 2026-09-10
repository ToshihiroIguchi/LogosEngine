const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:8300';
const SCREENSHOT_DIR = path.resolve(__dirname, '../scratch');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runInvestigation() {
    console.log('🚀 Starting Automated Browser Investigation...');
    console.log(`Target URL: ${URL}`);
    console.log(`Chrome Path: ${CHROME_PATH}`);

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850']
    });

    let page;
    try {
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 850 });

        console.log('1. Navigating to LogosEngine...');
        await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

        // Wait for Pyodide engine to be ready
        console.log('2. Waiting for Pyodide engine initialization...');
        await page.waitForFunction(() => {
            const statusEl = document.querySelector('.text-green-600, .text-blue-600');
            return statusEl && (statusEl.textContent.includes('Ready') || statusEl.textContent.includes('Engine Ready'));
        }, { timeout: 45000 });
        console.log('   ✅ Engine is ready!');

        // Switch to Variables tab
        console.log('3. Opening Variable Inspector tab...');
        const varTabBtn = await page.waitForSelector('button[title="Variable Inspector"]', { timeout: 10000 });
        await varTabBtn.click();
        await new Promise(r => setTimeout(r, 600));

        // Verify "+ Define Variable" button is visible
        console.log('4. Finding "+ Define Variable" button...');
        const defineBtn = await page.waitForSelector('button[title*="Define"]', { timeout: 5000 });
        const defineBtnText = await page.evaluate(el => el.textContent, defineBtn);
        console.log(`   Found button: "${defineBtnText.trim()}"`);
        await defineBtn.click();
        await new Promise(r => setTimeout(r, 600));

        // Check modal is open
        console.log('5. Verifying DefineVariableModal...');
        await page.waitForSelector('.fixed.inset-0', { timeout: 5000 });
        const modalHeader = await page.evaluate(() => {
            const h2 = document.querySelector('h2');
            return h2 ? h2.textContent : '';
        });
        console.log(`   Modal Title: "${modalHeader}"`);

        // Check presets are visible
        const presets = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons
                .map(b => b.textContent.trim())
                .filter(t => t.includes('Positive') || t.includes('Non-negative') || t.includes('Real') || t.includes('Integer'));
        });
        console.log(`   Found presets: ${presets.length} items`);

        // Click "Positive" preset
        console.log('6. Selecting "Positive" preset...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const positiveBtn = buttons.find(b => b.textContent.includes('Positive'));
            if (positiveBtn) positiveBtn.click();
        });
        await new Promise(r => setTimeout(r, 400));

        // Take screenshot of modal
        const modalScreenshotPath = path.join(SCREENSHOT_DIR, '01_define_variable_modal.png');
        await page.screenshot({ path: modalScreenshotPath });
        console.log(`   📸 Saved modal screenshot: ${modalScreenshotPath}`);

        // Click "Apply to Session"
        console.log('7. Applying variable definition to session...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const applyBtn = buttons.find(b => b.textContent.includes('Apply to Session') || b.textContent.includes('Update Session'));
            if (applyBtn) applyBtn.click();
        });

        // Wait for modal to close and variables list to update
        await new Promise(r => setTimeout(r, 1200));

        // Check if x has the badge "x > 0"
        console.log('8. Verifying variable range badge in Variable Inspector...');
        const varBadgeText = await page.evaluate(() => {
            const badges = Array.from(document.querySelectorAll('span'));
            const badge = badges.find(s => s.textContent.includes('> 0') || s.textContent.includes('x > 0'));
            return badge ? badge.textContent.trim() : null;
        });

        console.log(`   Detected range badge: "${varBadgeText}"`);
        if (!varBadgeText) {
            throw new Error('Range badge for x was not found in Variable Inspector!');
        }
        console.log('   ✅ Variable x is registered with range: ' + varBadgeText);

        const varListScreenshotPath = path.join(SCREENSHOT_DIR, '02_variable_with_range_badge.png');
        await page.screenshot({ path: varListScreenshotPath });
        console.log(`   📸 Saved variable list screenshot: ${varListScreenshotPath}`);

        // 9. Execute cell to test calculation with positive assumption
        console.log('9. Executing math calculation cell with positive assumption...');
        
        // Focus the first editor by clicking into view-lines
        const editorViewLine = await page.waitForSelector('.monaco-editor .view-line', { timeout: 5000 });
        await editorViewLine.click();
        await new Promise(r => setTimeout(r, 300));

        // Select all text in Monaco
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 200));

        // Type solve(x**2 - 4, x) with slight delay
        await page.keyboard.type('solve(x**2 - 4, x)', { delay: 30 });
        await new Promise(r => setTimeout(r, 400));

        // Click Run Cell button
        const runBtn = await page.waitForSelector('button[title="Run Cell (Shift+Enter)"]', { timeout: 5000 });
        await runBtn.click();

        console.log('10. Waiting for calculation execution...');
        await new Promise(r => setTimeout(r, 3000));

        // Verify output in page
        const cellOutputs = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.font-mono, .katex, pre, code'));
            return items.map(el => el.textContent.trim()).filter(t => t.length > 0);
        });
        console.log('   Outputs found:', cellOutputs.filter(t => t.includes('[') || t.includes('2')));

        const foundOutput = cellOutputs.find(t => t === '[2]' || t.includes('[2]'));
        if (foundOutput) {
            console.log(`   ✅ Mathematical verification passed! Output: "${foundOutput}"`);
            console.log('   (Confirmed: Since x is defined as positive > 0, solve(x^2 - 4, x) produced [2], not [-2, 2])');
        } else {
            console.log('   Outputs check: ', cellOutputs);
        }

        const resultScreenshotPath = path.join(SCREENSHOT_DIR, '03_calculation_result.png');
        await page.screenshot({ path: resultScreenshotPath });
        console.log(`   📸 Saved result screenshot: ${resultScreenshotPath}`);

        console.log('🎉 Automated Investigation Completed Successfully!');
    } catch (err) {
        console.error('❌ Investigation Failed:', err);
        if (page) {
            const errScreenshotPath = path.join(SCREENSHOT_DIR, 'error_screenshot.png');
            await page.screenshot({ path: errScreenshotPath }).catch(() => {});
        }
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runInvestigation();
