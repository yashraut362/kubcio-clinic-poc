/**
 * Happy path through the real UI: check-in -> nurse -> doctor -> checkout,
 * then the doctor confirms the study match and reception records the call
 * and consent. Uses Tom Novak from the demo data ("T2DM", no date of birth,
 * so the system says "Needs checking" rather than a match).
 * Run with: npm run test:e2e
 */
import { expect, test, type Page } from "@playwright/test";

type RoleName = "Reception" | "Nurse" | "Doctor";

async function viewAs(page: Page, role: RoleName) {
  const picker = page.getByLabel("Viewing as");
  await picker.click();
  await page.getByRole("option", { name: role, exact: true }).click();
  await expect(picker).toContainText(role);
}

async function openCard(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function closePanel(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

const column = (page: Page, title: string) => page.getByRole("region", { name: new RegExp(`^${title}`) });

test.beforeAll(async ({ request }) => {
  const seeded = await request.post("/api/dev/seed");
  expect(seeded.ok()).toBe(true);
});

test("visit handoff, study confirmation and consent", async ({ page }) => {
  await page.goto("/patients");

  await test.step("1. Reception checks Tom in", async () => {
    await viewAs(page, "Reception");
    await page.getByLabel("Search patients by name or phone").fill("Novak");
    const row = page.getByRole("row", { name: /Tom Novak/ });
    await row.getByRole("button", { name: "Check in" }).click();
    await page.getByLabel("Reason for visit").fill("Diabetes review");
    await page.getByRole("dialog").getByRole("button", { name: "Check in" }).click();
    await expect(row).toContainText("Checked in · since");

    await page.getByRole("link", { name: "Today's visits" }).click();
    const card = column(page, "Checked in").getByRole("button", { name: /Tom Novak/ });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("Study"); // reception can't see unconfirmed flags
  });

  await test.step("2. Nurse records vitals and sends Tom to the doctor", async () => {
    await viewAs(page, "Nurse");
    await openCard(page, "Tom Novak");
    await page.getByRole("button", { name: "Start nurse assessment" }).click();
    await page.getByLabel("Blood pressure").fill("138/86");
    await page.getByLabel("Weight (kg)").fill("88");
    await page.getByLabel("Temp (°C)").fill("36.8");
    await page.getByLabel("Notes for the doctor").fill("Thirsty lately");
    await page.getByRole("button", { name: "Save and send to doctor" }).click();
    await expect(page.getByRole("dialog")).toContainText("With doctor");
    await closePanel(page);
    await expect(column(page, "With doctor").getByRole("button", { name: /Tom Novak/ })).toBeVisible();
  });

  await test.step("3. Doctor sees everything in one place and sends Tom to checkout", async () => {
    await viewAs(page, "Doctor");
    await expect(page.getByRole("button", { name: /Tom Novak/ })).toContainText("Study: needs checking");
    await openCard(page, "Tom Novak");
    const panel = page.getByRole("dialog");
    await expect(panel).toContainText("138/86");
    await expect(panel).toContainText("Thirsty lately");
    await expect(panel).toContainText("Ibuprofen");
    await expect(panel).toContainText("age is unknown");
    await panel.getByLabel("Notes", { exact: true }).fill("Review in 2 weeks.");
    await panel.getByText("Follow-up needed").click();
    await panel.getByRole("button", { name: "Send to checkout" }).click();
    await expect(panel).toContainText("Checkout");
    await closePanel(page);
  });

  await test.step("4. Reception can't finish checkout until the follow-up is booked", async () => {
    await viewAs(page, "Reception");
    const card = column(page, "Checkout").getByRole("button", { name: /Tom Novak/ });
    await expect(card).toContainText("Follow-up to book");
    await openCard(page, "Tom Novak");
    const panel = page.getByRole("dialog");
    await expect(panel).not.toContainText("Thirsty lately"); // no clinical notes for reception
    const complete = panel.getByRole("button", { name: "Complete checkout" });
    await expect(complete).toBeDisabled();
    await panel.getByText("Booked", { exact: true }).click();
    await expect(complete).toBeEnabled();
    await complete.click();
    await expect(panel).toContainText("Checkout complete.");
    await closePanel(page);
    await expect(column(page, "Done").getByRole("button", { name: /Tom Novak/ })).toBeVisible();
  });

  await test.step("5. Doctor confirms the study match after checking", async () => {
    await viewAs(page, "Doctor");
    await page.getByRole("link", { name: "Studies" }).click();
    const card = page.locator("article", { hasText: "Tom Novak" });
    await expect(card).toContainText("Needs checking");
    await expect(card).toContainText("Date of birth (age unknown)");
    await card.getByRole("button", { name: "Confirm match" }).click();
    await expect(page.getByText("Tom Novak confirmed and added to reception's call list")).toBeVisible();
    await expect(card).toBeHidden();
  });

  await test.step("6. Reception records a missed call, then consent", async () => {
    await viewAs(page, "Reception");
    const row = page.getByRole("row", { name: /Tom Novak/ });
    await expect(row).toContainText("Not called yet");
    await expect(row).toContainText("Consent: Not asked yet");

    await row.getByRole("button", { name: "Record call" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Not reached", { exact: true }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText("Not reached");
    await expect(row).toContainText("Consent: Not asked yet"); // a call is not consent

    await row.getByRole("button", { name: "Record call" }).click();
    await dialog.getByText("Reached", { exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled(); // needs an answer
    await dialog.getByText("Consented", { exact: true }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("tab", { name: /Decided/ }).click();
    const decided = page.getByRole("row", { name: /Tom Novak/ });
    await expect(decided).toContainText("Reached");
    await expect(decided).toContainText("Consent: Consented");
  });

  await test.step("7. Everyone now sees the confirmed study flag on the board", async () => {
    await page.getByRole("link", { name: "Today's visits" }).click();
    await expect(column(page, "Done").getByRole("button", { name: /Tom Novak/ })).toContainText("Study: doctor-confirmed");
  });
});
