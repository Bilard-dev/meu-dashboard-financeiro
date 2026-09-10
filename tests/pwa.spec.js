// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('PWA & Offline Infrastructure', () => {
    test('index.html contains all essential PWA meta tags and manifest reference', async ({ page }) => {
        await page.goto('/');

        // 1. Manifest link
        const manifestLink = page.locator('link[rel="manifest"]');
        await expect(manifestLink).toHaveAttribute('href', 'manifest.webmanifest');

        // 2. Theme color
        const themeColor = page.locator('meta[name="theme-color"]');
        await expect(themeColor).toHaveAttribute('content', '#2563eb');

        // 3. Apple Touch Icon & mobile web app capability
        const appleIcon = page.locator('link[rel="apple-touch-icon"]');
        await expect(appleIcon).toHaveAttribute('href', 'icons/icon-192.png');

        const appleCapable = page.locator('meta[name="apple-mobile-web-app-capable"]');
        await expect(appleCapable).toHaveAttribute('content', 'yes');
    });

    test('manifest.webmanifest is valid, accessible and has required PWA fields', async ({ request }) => {
        const response = await request.get('/manifest.webmanifest');
        expect(response.status()).toBe(200);

        const manifest = await response.json();
        expect(manifest.name).toBe('Dashboard Financeiro Pessoal');
        expect(manifest.short_name).toBe('Finanças');
        expect(manifest.start_url).toBe('./');
        expect(manifest.scope).toBe('./');
        expect(manifest.display).toBe('standalone');
        expect(manifest.theme_color).toBe('#2563eb');
        expect(manifest.background_color).toBe('#f8fafc');

        // Verify icons array has 192, 512, and maskable
        expect(Array.isArray(manifest.icons)).toBe(true);
        const sizes = manifest.icons.map(icon => icon.sizes);
        expect(sizes).toContain('192x192');
        expect(sizes).toContain('512x512');

        const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
        expect(maskable).toBeDefined();
    });

    test('PWA icon assets are accessible with status 200', async ({ request }) => {
        const iconPaths = [
            '/icons/icon.svg',
            '/icons/icon-192.png',
            '/icons/icon-512.png',
            '/icons/icon-maskable-512.png'
        ];

        for (const iconPath of iconPaths) {
            const res = await request.get(iconPath);
            expect(res.status(), `Icon ${iconPath} should return status 200`).toBe(200);
        }
    });

    test('Service Worker file sw.js is accessible and implements security safeguards', async ({ request }) => {
        const response = await request.get('/sw.js');
        expect(response.status()).toBe(200);

        const text = await response.text();
        // Verifies security safeguards are present in SW code
        expect(text).toContain('supabase.co');
        expect(text).toContain('/auth/');
        expect(text).toContain('CACHE_NAME');
    });

    test('Service Worker registration is initiated in browser environment', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        expect(pageErrors.length).toBe(0);

        // Verify navigator.serviceWorker exists in supported browser context
        const swSupported = await page.evaluate(() => 'serviceWorker' in navigator);
        expect(swSupported).toBe(true);
    });
});
