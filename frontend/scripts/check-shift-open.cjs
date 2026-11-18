const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
    const browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    });
    const user = { id: 2, username: 'kasir', fullname: 'Petugas Apotek', is_active: true, perm_settings: true };
    let mode = 'empty';
    let submitted;
    const page = await browser.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await page.addInitScript((currentUser) => {
        localStorage.setItem('pos_access_token', 'browser-test-only');
        localStorage.setItem('pos_user', JSON.stringify(currentUser));
    }, user);
    await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let data = null;
        if (path.endsWith('/auth/me')) data = user;
        if (path.endsWith('/settings')) data = { name: 'Apotek', currency_symbol: 'Rp' };
        if (path.endsWith('/tills')) {
            if (mode === 'error') return route.fulfill({ status: 503, json: { message: 'Layanan sementara tidak tersedia' } });
            data = mode === 'ready' ? [{ id: 1, number: '01', name: 'Kasir utama' }] : [];
        }
        if (path.endsWith('/shifts/open')) {
            submitted = route.request().postDataJSON();
            return route.fulfill({ status: 409, json: { message: 'Shift uji tidak disimpan' } });
        }
        await route.fulfill({ json: { status: true, code: 200, message: 'OK', data } });
    });
    try {
        const url = process.env.APP_URL || 'http://localhost:3013/app';
        for (const width of [1920, 1440, 768, 390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(url);
            await page.getByRole('heading', { name: 'Mesin kasir belum ditambahkan' }).waitFor();
            assert.equal(await page.getByRole('heading', { name: 'Kasir', exact: true }).count(), 0);
            const layout = await page.getByRole('heading', { name: /^Selamat bekerja,/ }).evaluate((heading) => {
                const panel = heading.closest('section').parentElement;
                const main = panel.closest('main');
                const style = getComputedStyle(main);
                const bounds = main.getBoundingClientRect();
                const contentLeft = bounds.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
                const contentRight = bounds.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
                const panelBounds = panel.getBoundingClientRect();
                return { leftGap: panelBounds.left - contentLeft, rightGap: contentRight - panelBounds.right };
            });
            assert.ok(Math.abs(layout.leftGap) < 2 && Math.abs(layout.rightGap) < 2, `Panel must fill the work area at ${width}px: ${JSON.stringify(layout)}`);
            assert.equal(await page.getByRole('link', { name: 'Tambahkan mesin kasir' }).getAttribute('href'), '/settings');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
            await page.screenshot({ path: `/tmp/pos-shift-${width}.png`, fullPage: true });
        }
        user.perm_settings = false;
        await page.reload();
        await page.getByText('Hubungi admin untuk menambahkan mesin kasir.').waitFor();
        assert.equal(await page.getByRole('link', { name: 'Tambahkan mesin kasir' }).count(), 0);

        mode = 'error';
        await page.reload();
        await page.getByRole('heading', { name: 'Mesin kasir belum dapat dimuat' }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Mesin kasir belum ditambahkan' }).count(), 0);
        mode = 'ready';
        await page.getByRole('button', { name: 'Coba lagi' }).click();
        const cash = page.getByLabel('Modal awal tunai (Rp)');
        await cash.waitFor();
        assert.equal(await page.getByLabel('Mesin kasir (till)').inputValue(), '1');
        await page.getByRole('button', { name: 'Buka shift', exact: true }).click();
        await page.getByText('Isi modal awal', { exact: false }).waitFor();
        assert.equal(submitted, undefined);
        await cash.fill('-1');
        await page.getByRole('button', { name: 'Buka shift', exact: true }).click();
        assert.equal(submitted, undefined);
        await cash.fill('0');
        await page.getByRole('button', { name: 'Buka shift', exact: true }).click();
        await page.getByText('Shift uji tidak disimpan', { exact: true }).waitFor();
        assert.deepEqual(submitted, { till_id: 1, opening_cash: 0 });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.screenshot({ path: '/tmp/pos-shift-ready.png', fullPage: true });
        await page.evaluate(() => document.documentElement.classList.add('dark'));
        await page.screenshot({ path: '/tmp/pos-shift-dark.png', fullPage: true });
        assert.deepEqual(runtimeErrors, []);
        console.log('PASS: responsive empty state, permissions, API retry, till selection, cash validation, submit payload, no runtime errors.');
    } finally {
        await browser.close();
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });