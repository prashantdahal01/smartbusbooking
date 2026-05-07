const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTicketHtml, buildTicketViewModel } = require("./ticketTemplate");

const makeBookingFixture = () => ({
	_id: "66a1b2c3d4e5f60718293abc",
	status: "confirmed",
	seats: ["12A", "12B"],
	passenger: {
		name: "Priya Sharma",
		age: 28,
		gender: "female",
		phone: "9800000000",
	},
	passengers: [
		{ seatLabel: "12A", name: "Priya Sharma", age: 28, gender: "female", phone: "9800000000" },
		{ seatLabel: "12B", name: "Anita Sharma", age: 26, gender: "female", phone: "9811111111" },
	],
	boardingPoint: {
		name: "Koteshwor, Kathmandu",
		time: "07:30",
		order: 15,
	},
	droppingPoint: {
		name: "New Bus Park, Pokhara",
		time: "14:30",
		order: 27,
	},
	totalPrice: 2400,
	seatPriceBreakdown: [
		{ seatLabel: "12A", price: 1200, seatType: "SEATER" },
		{ seatLabel: "12B", price: 1200, seatType: "SEATER" },
	],
	pricePerSeat: 1200,
	payment: {
		provider: "esewa",
		status: "paid",
		refId: "ESW-99887766",
		transactionUuid: "txn-123456789",
		paidAt: "2026-04-30T09:15:00.000Z",
	},
	createdAt: "2026-04-30T08:59:00.000Z",
	updatedAt: "2026-04-30T09:15:05.000Z",
	schedule: {
		date: "2026-05-24",
		time: "07:45",
		arrivalTime: "14:25",
		route: {
			source: "Kathmandu",
			destination: "Pokhara",
		},
		bus: {
			name: "RoadWay Express - Coach #47",
			vehicleNumber: "BA 1 KHA 1234",
			phone: "01-4445555",
			type: "AC / Seater",
			busTypes: ["SEATER"],
		},
	},
});

test("buildTicketViewModel returns real booking details", () => {
	const view = buildTicketViewModel(makeBookingFixture());

	assert.equal(view.bookingReference, "#SB-18293ABC");
	assert.equal(view.routeLabel, "Kathmandu → Pokhara");
	assert.equal(view.seatNumbers, "12A, 12B");
	assert.equal(view.paymentProvider, "eSewa");
	assert.equal(view.platformLabel, "15");
	assert.equal(view.totalAmount, "NPR 2,400");
	assert.equal(view.baseFare, "NPR 2,400");
});

test("buildTicketHtml renders the ticket sections and QR panel", async () => {
	const html = await buildTicketHtml(makeBookingFixture());

	assert.match(html, /Trip Summary/);
	assert.match(html, /Departure Information/);
	assert.match(html, /Payment Receipt/);
	assert.match(html, /Important Instructions/);
	assert.match(html, /Your Digital Ticket/);
	assert.match(html, /#SB-18293ABC/);
	assert.match(html, /Priya Sharma/);
});
