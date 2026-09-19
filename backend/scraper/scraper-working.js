const { chromium } = require("playwright");

async function scrapeProduct(productId) {
    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    try {
        const url = `https://demo.inelabteamdev.com/product/${productId}`;

        console.log(`Opening: ${url}`);

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        console.log("Page loaded");

        // Give the page a moment to finish its initial JavaScript work
        await page.waitForTimeout(2000);

        const revealButton = page.getByRole("button", {
            name: "Reveal price"
        });

        if (await revealButton.count() > 0) {
            console.log("Reveal price button found");

            if (await revealButton.isVisible()) {
                console.log("Clicking Reveal price...");
                await revealButton.click();
            }
        } else {
            console.log("Reveal price button not found");
        }

        // Hover over the price area because the store says
        // hovering can trigger the price loading.
        const priceBlock = page.locator(".price-block");

        if (await priceBlock.count() > 0) {
            console.log("Price block found");

            await priceBlock.hover();

            console.log("Hovered over price block");
        }

        // Wait for the page to actually contain a rupee price.
        await page.waitForFunction(() => {
            return document.body.innerText.match(/₹\s*[\d,]+/);
        }, null, {
            timeout: 15000
        });

        console.log("Price text found");

        const bodyText = await page.locator("body").innerText();

        const priceMatch = bodyText.match(/₹\s*([\d,]+)/);

        if (!priceMatch) {
            throw new Error("Price could not be extracted");
        }

        const price = Number(
            priceMatch[1].replace(/,/g, "")
        );

        const stockElement = page.locator(".stock-badge");

        if (await stockElement.count() === 0) {
            throw new Error("Stock information could not be found");
        }

        const stockStatus = (
            await stockElement.first().innerText()
        ).trim();

        console.log("Price:", price);
        console.log("Stock:", stockStatus);

        return {
            productId,
            price,
            stockStatus
        };

    } finally {
        await browser.close();
    }
}

scrapeProduct(548)
    .then((result) => {
        console.log("\nScrape result:");
        console.log(result);
    })
    .catch((error) => {
        console.error("\nScraping failed:", error.message);
    });