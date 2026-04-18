// Generates a pixel-perfect PDF ticket from reusable HTML template
// Used for both API ticket download and email attachment.

const puppeteer = require("puppeteer");
const { buildTicketHtml } = require("./ticketTemplate");

const buildLaunchOptions = () => {
	const executablePath = String(process.env.PUPPETEER_EXECUTABLE_PATH || "").trim();

	const launchOptions = {
		headless: "new",
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--font-render-hinting=none",
		],
	};

	if (executablePath) {
		launchOptions.executablePath = executablePath;
	}

	return launchOptions;
};

const generateTicketPdfBuffer = async (booking) => {
	let browser;
	try {
		const html = await buildTicketHtml(booking);

		browser = await puppeteer.launch(buildLaunchOptions());
		const page = await browser.newPage();

		await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 2 });
		await page.setContent(html, {
			waitUntil: ["domcontentloaded", "networkidle0"],
		});

		const pdfBuffer = await page.pdf({
			format: "A4",
			preferCSSPageSize: true,
			printBackground: true,
			margin: {
				top: "0mm",
				right: "0mm",
				bottom: "0mm",
				left: "0mm",
			},
		});

		return pdfBuffer;
	} finally {
		if (browser) {
			await browser.close();
		}
	}
};

module.exports = { generateTicketPdfBuffer };
