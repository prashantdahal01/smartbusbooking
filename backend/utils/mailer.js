// Email helper for sending tickets after successful payments
// Uses SMTP settings from environment variables.

const { generateTicketPdfBuffer } = require("./ticketPdf");
const EmailService = require("../services/email.service");

const safeString = (v) => String(v == null ? "" : v);

const buildTicketEmail = (booking) => {
	const route = booking?.schedule?.route;
	const bus = booking?.schedule?.bus;
	const passenger = booking?.passenger;

	const subject = "Bus Ticket Confirmation";
	const seatText = Array.isArray(booking?.seats) ? booking.seats.join(", ") : "";
	const total = booking?.totalPrice != null ? safeString(booking.totalPrice) : "";
	const passengerName = safeString(passenger?.name).trim() || "Customer";
	const routeLabel = `${safeString(route?.source)} -> ${safeString(route?.destination)}`.trim();
	const dateTimeLabel = `${safeString(booking?.schedule?.date)} ${safeString(booking?.schedule?.time)}`.trim();

	const text = [
		`Hi ${passengerName},`,
		"",
		"Your booking is confirmed. Your e-ticket PDF is attached.",
		"",
		`Booking ID: ${safeString(booking?._id)}`,
		`Route: ${routeLabel}`,
		`Travel Date & Time: ${dateTimeLabel}`,
		`Bus: ${safeString(bus?.name)}${bus?.vehicleNumber ? ` (${bus.vehicleNumber})` : ""}`,
		`Passenger: ${passengerName}${passenger?.gender ? ` (${safeString(passenger.gender)})` : ""}`,
		`Seats: ${seatText}`,
		`Total: ${total}`,
		"",
		"Thank you for choosing SmartBus.",
	].join("\n");

	const html = `
		<div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; line-height: 1.5; color: #0f172a;">
			<h2 style="margin:0 0 8px;">Bus Ticket Confirmation</h2>
			<p style="margin:0 0 16px; color:#475569;">Hi ${passengerName}, your booking is confirmed. Your e-ticket PDF is attached.</p>
			<div style="border:1px solid #e2e8f0; border-radius: 12px; padding: 14px; background:#f8fafc;">
				<div><strong>Booking ID:</strong> ${safeString(booking?._id)}</div>
				<div><strong>Route:</strong> ${routeLabel}</div>
				<div><strong>Travel Date & Time:</strong> ${dateTimeLabel}</div>
				<div><strong>Bus:</strong> ${safeString(bus?.name)}${bus?.vehicleNumber ? ` (${safeString(bus.vehicleNumber)})` : ""}</div>
				<div><strong>Passenger:</strong> ${passengerName}${passenger?.gender ? ` (${safeString(passenger.gender)})` : ""}</div>
				<div><strong>Seats:</strong> ${seatText}</div>
				<div><strong>Total:</strong> ${total}</div>
			</div>
			<p style="margin:16px 0 0; color:#475569; font-size: 12px;">Thank you for choosing SmartBus.</p>
		</div>
	`;

	return { subject, html, text };
};

exports.sendTicketEmailSafely = async (booking) => {
	try {
		const to = safeString(booking?.user?.email).trim();
		if (!to) {
			// eslint-disable-next-line no-console
			console.warn("Booking user email missing; skipping ticket email");
			return false;
		}

		let emailService;
		try {
			emailService = new EmailService();
		} catch (e) {
			// eslint-disable-next-line no-console
			console.warn("SMTP not configured; skipping ticket email");
			return false;
		}

		let pdfBuffer;
		try {
			pdfBuffer = await generateTicketPdfBuffer(booking);
		} catch (e) {
			// eslint-disable-next-line no-console
			console.error("Ticket PDF generation failed; skipping ticket email", e);
			return false;
		}

		const { subject, html, text } = buildTicketEmail(booking);
		await emailService.sendEmail({
			to,
			sub: subject,
			message: html,
			text,
			attachments: [
				{
					filename: `ticket-${safeString(booking?._id)}.pdf`,
					content: pdfBuffer,
					contentType: "application/pdf",
				},
			],
		});

		// Persist marker (best-effort)
		if (booking?.payment) {
			booking.payment.emailSentAt = new Date();
			await booking.save().catch(() => undefined);
		}

		return true;
	} catch (e) {
		// Provide actionable hints for the most common misconfiguration: Gmail SMTP.
		const provider = safeString(process.env.SMTP_PROVIDER).trim().toLowerCase();
		const responseCode = Number(e?.responseCode || 0);
		if (provider === "gmail" && (e?.code === "EAUTH" || responseCode === 535)) {
			const hasSmtpPass = Boolean(safeString(process.env.SMTP_PASS).trim());
			const hasSmtpPassword = Boolean(safeString(process.env.SMTP_PASSWORD).trim());
			const passMismatch =
				hasSmtpPass &&
				hasSmtpPassword &&
				safeString(process.env.SMTP_PASS).trim() !== safeString(process.env.SMTP_PASSWORD).trim();

			// eslint-disable-next-line no-console
			console.error(
				"Gmail SMTP auth failed (535). Use a Google App Password (16 chars) instead of your normal Gmail password, and restart the backend after updating backend/.env."
			);
			if (passMismatch) {
				// eslint-disable-next-line no-console
				console.error("Both SMTP_PASS and SMTP_PASSWORD are set but different; clear one to avoid using the wrong password.");
			}

			// Expected failure when Gmail credentials are not accepted; keep booking flow intact.
			return false;
		}

		// eslint-disable-next-line no-console
		console.error("Ticket email failed", e);
		return false;
	}
};
