import { expect, test } from "@playwright/test";

const shots = process.env.E2E_SCREENSHOT_DIR;
const snap = async (page: import("@playwright/test").Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test.describe.serial("Campaign Guardian end-to-end (demo mode)", () => {
  test("reset demo data", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Reset demo data" }).click();
    await expect(page.getByText("Demo data restored.")).toBeVisible();
  });

  test("overview shows demo KPIs", async ({ page }) => {
    await page.goto("/overview");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
    await snap(page, "01-overview");
  });

  test("submit an inconsistent campaign → BLOCK with evidence, approval refused, corrected draft applied", async ({ page }) => {
    await page.goto("/campaigns/new");
    await page.getByLabel("Name", { exact: true }).fill("E2E Waterproof Flash Sale");
    await page.getByLabel("Channel", { exact: true }).selectOption("FACEBOOK");
    await page.getByLabel("Product", { exact: true }).selectOption({ label: "Ridgeline Rain Jacket" });
    const variant = page.getByLabel("Variant", { exact: true });
    const mValue = await variant.locator("option", { hasText: "M / Storm Blue" }).getAttribute("value");
    await variant.selectOption(mValue!);
    await expect(page.getByLabel("Live variant")).toContainText("$189.00");
    await page.getByLabel("Headline", { exact: true }).fill("100% waterproof jacket, 40% off!");
    await page.getByLabel("Text", { exact: true }).fill("Now only $169. Next-day delivery Australia-wide.");
    await page.getByLabel("Price", { exact: true }).fill("169");
    await page.getByLabel("Discount", { exact: true }).selectOption("PERCENT");
    await page.getByLabel("Percent off").fill("40");
    await page.getByLabel("Ends", { exact: true }).fill("2030-01-01T12:00");
    await page.getByLabel("Claims", { exact: true }).fill("100% waterproof outdoor jacket");
    await snap(page, "02-intake");
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("Campaign submitted and verified.")).toBeVisible();
    await expect(page.getByText("BLOCK").first()).toBeVisible();
    await expect(page.getByText("PRICE_MISMATCH").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("CLAIM_CONTRADICTED").locator("visible=true").first()).toBeVisible();
    await expect(page.getByText("Live Shopify price is $189.00").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await snap(page, "03-block-report");

    await page.getByRole("button", { name: "Apply as new draft" }).click();
    await expect(page.getByText("Corrected draft applied")).toBeVisible();
    await expect(page.getByText("PRICE_MISMATCH")).toHaveCount(0);
    await expect(page.getByText("CLAIM_CONTRADICTED")).toHaveCount(0);
    await snap(page, "04-after-correction");
  });

  test("monitoring reacts to a store change", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("link", { name: /Ridgeline Rain Jacket/ }).click();
    const row = page.getByRole("row", { name: /M \/ Storm Blue/ });
    await row.getByLabel("Change").selectOption("SELL_OUT");
    await row.getByTitle("Apply demo change and run monitoring").click();
    await expect(page.getByText(/Demo store change applied\. Monitoring re-checked/)).toBeVisible();
    await page.goto("/overview");
    await expect(page.getByText("Spring Rain Jacket – Instagram: PASS → BLOCK")).toBeVisible();
    await snap(page, "05-monitoring-alert");
  });

  test("prospect CRM: create, qualify and draft outreach", async ({ page }) => {
    await page.goto("/prospects");
    await page.getByLabel("Company", { exact: true }).fill("E2E Agency Pty Ltd");
    await page.getByLabel("Job title").fill("Founder");
    await page.getByLabel("Location").fill("Sydney, NSW");
    await page.getByLabel("Business type").selectOption("AGENCY_MARKETING");
    await page.getByLabel("Verified", { exact: true }).check();
    await page.getByRole("button", { name: "Add prospect" }).click();
    await expect(page.getByText("Prospect created.")).toBeVisible();
    await expect(page.getByText("Qualified", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate outreach drafts" }).click();
    await expect(page.getByText(/\d+\/300 characters/)).toBeVisible();
    await snap(page, "06-prospect");
    await page.getByRole("button", { name: "Delete prospect" }).click(); // clean up the non-demo test record
    await expect(page.getByText("Deleted E2E Agency Pty Ltd.")).toBeVisible();
  });

  test("outreach copilot: pick any country for the search location", async ({ page }) => {
    await page.goto("/outreach");
    await expect(page.getByText("Locations", { exact: true })).toBeVisible();
    const country = page.getByLabel("Country");
    await expect(country).toHaveValue("Australia");
    expect(await country.locator("option").count()).toBeGreaterThanOrEqual(195);
    await country.selectOption("Germany");
    await expect(page.locator("code").filter({ hasText: /Germany$/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sydney" })).toHaveCount(0); // Australian city shortcuts hidden
  });

  test("every navigation item loads", async ({ page }) => {
    for (const label of ["Overview", "Campaigns", "Products", "History", "Prospects", "Outreach", "Analytics", "Shopify", "Settings"]) {
      await page.goto("/overview");
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
      await expect(page.locator("h1")).toBeVisible();
    }
    await page.goto("/analytics");
    await snap(page, "07-analytics");
  });

  test("retired pages redirect to where their content moved", async ({ page }) => {
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/analytics$/);
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/history$/);
  });
});
