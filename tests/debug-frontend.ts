// @ts-nocheck
import puppeteer from 'puppeteer';
import process from 'process';

async function run() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error(`[Browser Error] ${err.toString()}`);
    });

    console.log('Navigating to app...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

    console.log('Clicking replay button...');
    // Wait for the button. Looking for text content using XPath
    try {
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const replayBtn = buttons.find(b => b.innerText.toUpperCase().includes('REPLAY'));
            if (replayBtn) {
                replayBtn.click();
                return true;
            }
            return false;
        });

        if (clicked) {
            console.log('Clicked! Waiting 3s for logs...');
            await new Promise(r => setTimeout(r, 3000));
        } else {
            console.log('Could not find the replay button.');
        }
    } catch (err) {
        console.error('Error clicking button:', err);
    }

    await browser.close();
    process.exit(0);
}

run();
