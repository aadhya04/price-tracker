require("dotenv").config();
const { chromium } = require("playwright");
const {
    saveScrape,
    saveScrapeLog
} = require("../database/saveScrape");
const supabase = require("../database/supabase");

async function getTrackedProduct(productId) {

    const productUrl =
        `https://demo.inelabteamdev.com/product/${productId}`;

    console.log("Looking for URL:", productUrl);

    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url")
        .eq("product_url", productUrl.trim())
        .limit(1);

    if (error) {
        throw new Error(
            `Tracked product lookup failed: ${error.message}`
        );
    }

    if (!data || data.length === 0) {
        throw new Error(
            `No tracked product found for URL: ${productUrl}`
        );
    }

    return data[0];
}

async function scrapeOnce(productId) {
    const browser = await chromium.launch({
    headless: process.env.HEADLESS === "true"
});;

    const page = await browser.newPage();

    try {
        const url = `https://demo.inelabteamdev.com/product/${productId}`;

        console.log(`Opening: ${url}`);

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 15000
        });

        console.log("Page loaded");

        await page.waitForTimeout(2000);

        const revealButton = page.getByRole("button", {
            name: "Reveal price"
        });

        if (await revealButton.count() > 0) {
    if (await revealButton.isVisible()) {
        console.log("Waiting for Reveal price button...");

        await page.waitForFunction(() => {
            const button = [...document.querySelectorAll("button")]
                .find(btn => btn.textContent.trim() === "Reveal price");

            return button && !button.disabled;
        }, null, { timeout: 30000 });

        console.log("Clicking Reveal price...");
        await revealButton.click();
    }
}

        const priceBlock = page.locator(".price-block");

        if (await priceBlock.count() > 0) {
            await priceBlock.hover();
        }

        await page.waitForFunction(() => {
            return document.body.innerText.match(/₹\s*[\d,]+/);
        }, null, {
            timeout: 15000
        });

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

        return {
            productId,
            price,
            stockStatus
        };

    } finally {
        await browser.close();
    }
}

async function scrapeWithRetry(productId, productUuid) {

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {

        console.log(`\n========== ATTEMPT ${attempt} ==========`);

        try {

            const result = await scrapeOnce(productId);

            console.log("Scrape successful!");

            return {
                success: true,
                attempt,
                data: result
            };

        } catch (error) {

            console.log(
                `Attempt ${attempt} failed: ${error.message}`
            );

            const status =
                attempt < maxAttempts ? "retried" : "failed";

            try {

                await saveScrapeLog(
                    productUuid,
                    attempt,
                    status,
                    error.message
                );

            } catch (logError) {

                console.error(
                    "Could not save scrape log:",
                    logError.message
                );
            }

            if (attempt < maxAttempts) {

                console.log("Retrying...");

                await new Promise(
                    resolve => setTimeout(resolve, 2000)
                );
            }
        }
    }

    return {
        success: false,
        attempt: maxAttempts,
        data: null
    };
}

async function getTrackedProducts() {
    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url");

    if (error) {
        throw new Error(
            `Tracked products lookup failed: ${error.message}`
        );
    }

    return data || [];
}


async function runScraper() {
    const products = await getTrackedProducts();

    if (products.length === 0) {
        console.log("No tracked products found.");
        return;
    }

    console.log(
        `Found ${products.length} tracked product(s).`
    );

    for (const product of products) {
        console.log("\n=================================");
        console.log(
            `Scraping: ${product.product_name}`
        );
        console.log("=================================");

        const match = product.product_url.match(
            /\/product\/(\d+)/
        );

        if (!match) {
            console.log(
                "Could not find product ID from URL. Skipping."
            );
            continue;
        }

        const productId = Number(match[1]);

        const result = await scrapeWithRetry(
            productId,
            product.id
        );

        console.log("\nFinal result:");

        if (!result.success) {
            console.log(
                `Scraping failed for ${product.product_name}`
            );
            continue;
        }

        console.log(result.data);

        await saveScrape(
            product.id,
            result.data,
            result.attempt
        );
    }
}

if (require.main === module) {
    runScraper()
        .catch((error) => {
            console.error(
                "Unexpected error:",
                error.message
            );
        });
}

async function runScraperForProduct(productUuid) {
    const { data, error } = await supabase
        .from("tracked_products")
        .select("id, product_name, product_url")
        .eq("id", productUuid)
        .limit(1);

    if (error) {
        throw new Error(
            `Product lookup failed: ${error.message}`
        );
    }

    if (!data || data.length === 0) {
        throw new Error("Tracked product not found");
    }

    const product = data[0];

    console.log("\n=================================");
    console.log(`Scraping: ${product.product_name}`);
    console.log("=================================");

    const match = product.product_url.match(
        /\/product\/(\d+)/
    );

    if (!match) {
        throw new Error(
            "Could not find product ID from URL."
        );
    }

    const productId = Number(match[1]);

    const result = await scrapeWithRetry(
        productId,
        product.id
    );

    if (!result.success) {
        throw new Error(
            `Scraping failed for ${product.product_name}`
        );
    }

    console.log("\nFinal result:");
    console.log(result.data);

    await saveScrape(
        product.id,
        result.data,
        result.attempt
    );

    return result.data;
}


module.exports = {
    runScraper,
    runScraperForProduct
};