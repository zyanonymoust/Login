import {
    expect,
    test,
    type Page
} from "@playwright/test";

function createEmail(name: string) {
    return `${name}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}@example.com`;
}

async function register(
    page: Page,
    email: string
) {
    await page.goto("/register");

    await expect(
        page.getByRole("heading", {
            name: "Create Account"
        })
    ).toBeVisible();

    await page
        .getByLabel("Name")
        .fill("Playwright User");

    await page
        .getByLabel("Email")
        .fill(email);

    await page
        .getByLabel("Password", {
            exact: true
        })
        .fill("Password123!");

    await page
        .getByLabel("Confirm Password")
        .fill("Password123!");

    await page
        .getByRole("button", {
            name: "Create Account"
        })
        .click();
}

async function closePopup(page: Page) {
    const closeButton = page.getByRole("button", {
        name: /continue|close|ok/i
    });

    await expect(closeButton).toBeVisible();

    await closeButton.click();
}

test("dashboard requires login", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page).toHaveURL(/\/login/);

    await expect(
        page.getByRole("heading", {
            name: "Login"
        })
    ).toBeVisible();
});

test("wrong login is rejected", async ({ page }) => {
    await page.goto("/login");

    await page
        .getByLabel("Email")
        .fill(createEmail("wrong"));

    await page
        .getByLabel("Password")
        .fill("WrongPassword123!");

    await page
        .getByRole("button", {
            name: "Login"
        })
        .click();

    await expect(page).toHaveURL(/\/login/);

    const token = await page.evaluate(() =>
        localStorage.getItem("token")
    );

    expect(token).toBeNull();
});

test("register login dark mode and logout", async ({
    page
}) => {
    const email = createEmail("user");

    await register(page, email);

    await expect(page).toHaveURL(
        /\/login\?registered=true/
    );

    await closePopup(page);

    await page
        .getByLabel("Email")
        .fill(email);

    await page
        .getByLabel("Password")
        .fill("Password123!");

    await page
        .getByRole("button", {
            name: "Login"
        })
        .click();

    await expect(page).toHaveURL(/\/dashboard/);

    await expect(
        page.getByRole("heading", {
            name: /Hello, Playwright User/
        })
    ).toBeVisible();

    await page
        .getByRole("button", {
            name: /Dark/
        })
        .click();

    await expect(
        page.locator(".dashboard-page")
    ).toHaveClass(/dark/);

    await page
        .getByRole("button", {
            name: "Logout"
        })
        .click();

    await expect(page).toHaveURL(/\/login/);

    const token = await page.evaluate(() =>
        localStorage.getItem("token")
    );

    expect(token).toBeNull();
});

test("duplicate email is rejected", async ({ page }) => {
    const email = createEmail("duplicate");

    await register(page, email);

    await expect(page).toHaveURL(
        /\/login\?registered=true/
    );

    await page.goto("/register");

    await page
        .getByLabel("Name")
        .fill("Duplicate User");

    await page
        .getByLabel("Email")
        .fill(email);

    await page
        .getByLabel("Password", {
            exact: true
        })
        .fill("Password123!");

    await page
        .getByLabel("Confirm Password")
        .fill("Password123!");

    await page
        .getByRole("button", {
            name: "Create Account"
        })
        .click();

    await expect(
        page.getByText(/email already exists/i)
    ).toBeVisible();
});