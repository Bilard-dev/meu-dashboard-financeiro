const { test, expect } = require('@playwright/test');
const { setupAuthenticatedApp } = require('./helpers/setupApp');
const { mockUser } = require('./fixtures/mockData');

test.describe('Central Admin no Menu 3 Linhas', () => {
    test('Para usuário não-admin, menuAdminBtn deve estar oculto', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: false,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Usuário Comum',
                access_status: 'approved'
            }
        });

        await page.click('#menuBtn');
        const menuAdminBtn = page.locator('#menuAdminBtn');
        await expect(menuAdminBtn).toBeHidden();
    });

    test('Para usuário admin, menuAdminBtn deve estar visível no menu de 3 linhas e navegar para a aba admin ao clicar', async ({ page }) => {
        await setupAuthenticatedApp(page, {
            isAdmin: true,
            userProfile: {
                user_id: mockUser.id,
                display_name: 'Admin Master',
                access_status: 'approved'
            }
        });

        await page.click('#menuBtn');
        const menuAdminBtn = page.locator('#menuAdminBtn');
        await expect(menuAdminBtn).toBeVisible();
        await expect(menuAdminBtn).toContainText('Central Admin');

        await menuAdminBtn.click();

        const tabAdmin = page.locator('#tab-admin');
        await expect(tabAdmin).toHaveClass(/active/);

        const headerMenuList = page.locator('#headerMenuList');
        await expect(headerMenuList).not.toHaveClass(/show/);
    });
});
