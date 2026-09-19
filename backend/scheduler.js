const { exec } = require("child_process");

function runScraper() {
    console.log("\n==============================");
    console.log("Starting scheduled scraper...");
    console.log("==============================\n");

    const scraper = exec("node scraper/scraper.js");

    scraper.stdout.on("data", (data) => {
        process.stdout.write(data);
    });

    scraper.stderr.on("data", (data) => {
        process.stderr.write(data);
    });

    scraper.on("close", (code) => {
        console.log(
            `\nScheduled scraper finished with code ${code}`
        );
    });
}

// Run once when scheduler starts
runScraper();

// Run every 2 hours
setInterval(() => {
    runScraper();
}, 2 * 60 * 60 * 1000);