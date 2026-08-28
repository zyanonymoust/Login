import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

type AuthResponse = {
  userId: number;
  name: string;
  email: string;
  token: string;
};

const apiUrl = process.env.E2E_API_URL || "http://localhost:8083";

async function gotoWithRetry(page: Page, url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(750 * (attempt + 1));
    }
  }
  throw lastError;
}

async function createUser(request: APIRequestContext, name: string) {
  const email = `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await request.post(`${apiUrl}/api/auth/register`, {
    data: { name, email, password: "Password123!", confirmPassword: "Password123!" },
  });
  expect(response.ok()).toBeTruthy();
  return await response.json() as AuthResponse;
}

async function openSession(browser: Browser, auth: AuthResponse) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await gotoWithRetry(page, "/");
    await page.evaluate((user) => {
      localStorage.setItem("token", user.token);
      localStorage.setItem("user", JSON.stringify({ userId: user.userId, name: user.name, email: user.email }));
    }, auth);
    await gotoWithRetry(page, "/dashboard");
    await expect(page.getByRole("heading", { name: `Good day, ${auth.name.split(" ")[0]}` })).toBeVisible();
    return { context, page };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function openConversation(page: Page, name: string) {
  await page.getByPlaceholder("Search people").fill(name);
  const row = page.locator(".people-panel .person-row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.locator(".person-main").click();
  await expect(page.locator(".chat-meta").getByText(name, { exact: true })).toBeVisible();
}

test("two users exchange a realtime message with draft and read states", async ({ browser, request }) => {
  test.setTimeout(60000);
  const suffix = `${Date.now()}`.slice(-7);
  const senderAuth = await createUser(request, `Sender ${suffix}`);
  const recipientAuth = await createUser(request, `Recipient ${suffix}`);
  const sender = await openSession(browser, senderAuth);
  const recipient = await openSession(browser, recipientAuth);

  try {
    await openConversation(sender.page, recipientAuth.name);
    const composer = sender.page.locator(".composer textarea");

    await composer.fill("First line");
    await composer.press("Shift+Enter");
    await composer.type("Second line");
    await expect(composer).toHaveValue("First line\nSecond line");
    await sender.page.reload();
    await openConversation(sender.page, recipientAuth.name);
    await expect(sender.page.locator(".composer textarea")).toHaveValue("First line\nSecond line");

    const content = `Realtime hello ${suffix}`;
    await sender.page.locator(".composer textarea").fill(content);
    await sender.page.locator(".composer textarea").press("Enter");
    const outgoing = sender.page.locator(".message.mine").filter({ hasText: content });
    await expect(outgoing).toBeVisible();
    await expect(outgoing).toContainText(/Sent|Delivered/);

    await openConversation(recipient.page, senderAuth.name);
    await expect(recipient.page.locator(".message.theirs").filter({ hasText: content })).toBeVisible();
    await expect(outgoing).toContainText("Read");
    await expect(sender.page.getByRole("button", { name: "Show newest message" })).toBeHidden();
  } finally {
    await sender.context.close();
    await recipient.context.close();
  }
});
