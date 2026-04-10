// Generates a simple PDF ticket for a booking
// Used for both download/print and email attachment

const PDFDocument = require("pdfkit");

const safeString = (v) => String(v == null ? "" : v);

const formatPoint = (p) => {
	const name = safeString(p?.name).trim();
	const date = safeString(p?.date).trim();
	const time = safeString(p?.time).trim();
	if (!name && !date && !time) return "";
	const dt = [date, time].filter(Boolean).join(" ").trim();
	return dt ? `${name} (${dt})`.trim() : name;
};

const formatDeparture = (booking) => {
	const date = safeString(booking?.schedule?.date).trim();
	const time = safeString(booking?.schedule?.time).trim();
	return [date, time].filter(Boolean).join(" ").trim();
};

const line = (doc, label, value) => {
	doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
	doc.font("Helvetica").text(safeString(value));
};

const generateTicketPdfBuffer = (booking) =>
	new Promise((resolve, reject) => {
		try {
			const doc = new PDFDocument({ size: "A4", margin: 50 });
			const chunks = [];

			doc.on("data", (c) => chunks.push(c));
			doc.on("end", () => resolve(Buffer.concat(chunks)));
			doc.on("error", reject);

			const route = booking?.schedule?.route;
			const bus = booking?.schedule?.bus;
			const passenger = booking?.passenger;

			doc.fontSize(22).fillColor("#0f172a").text("SmartBus Ticket", { align: "center" });
			doc.moveDown(0.25);
			doc.fontSize(10).fillColor("#475569").text("Please carry this ticket during travel.", { align: "center" });
			doc.moveDown(1);

			doc.fontSize(12).fillColor("#0f172a");
			line(doc, "Booking ID", booking?._id);
			line(doc, "Status", booking?.status);
			line(
				doc,
				"Route",
				`${safeString(route?.source).trim()} -> ${safeString(route?.destination).trim()}`.trim()
			);
			if (booking?.boardingPoint?.name) {
				line(doc, "Boarding", formatPoint(booking.boardingPoint));
			}
			if (booking?.droppingPoint?.name) {
				line(doc, "Dropping", formatPoint(booking.droppingPoint));
			}
			line(doc, "Departure", formatDeparture(booking));
			line(
				doc,
				"Bus",
				`${safeString(bus?.name).trim()}${bus?.vehicleNumber ? ` (${safeString(bus.vehicleNumber).trim()})` : ""}`.trim()
			);
			line(
				doc,
				"Passenger",
				`${safeString(passenger?.name).trim()}${passenger?.gender ? ` (${safeString(passenger.gender).trim()})` : ""}${
					passenger?.age != null ? `, Age ${safeString(passenger.age).trim()}` : ""
				}`.trim()
			);
			line(doc, "Seats", Array.isArray(booking?.seats) ? booking.seats.join(", ") : "");
			line(doc, "Total", booking?.totalPrice != null ? safeString(booking.totalPrice) : "");

			const paymentProvider = safeString(booking?.payment?.provider).trim();
			const paymentStatus = safeString(booking?.payment?.status).trim();
			if (paymentProvider || paymentStatus) {
				line(doc, "Payment", `${paymentProvider} ${paymentStatus}`.trim());
			}
			if (booking?.payment?.refId) {
				line(doc, "Reference", booking.payment.refId);
			}

			doc.moveDown(1);
			doc.fontSize(10).fillColor("#475569").text(`Issued at: ${new Date().toISOString()}`);

			doc.end();
		} catch (e) {
			reject(e);
		}
	});

module.exports = { generateTicketPdfBuffer };
