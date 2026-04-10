// Seed script to populate the database with sample data for development and testing
// Run with: npm run seed

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");

const User = require("../models/User");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Schedule = require("../models/Schedule");
const Booking = require("../models/Booking");
const SeatLock = require("../models/SeatLock");
const District = require("../models/District");
const Stop = require("../models/Stop");

const seed = async () => {
	await connectDB();

	const shouldClear = (process.env.SEED_CLEAR || "true").toLowerCase() === "true";
	if (shouldClear) {
		await Promise.all([
			SeatLock.deleteMany({}),
			Booking.deleteMany({}),
			Schedule.deleteMany({}),
			Stop.deleteMany({}),
			Route.deleteMany({}),
			Bus.deleteMany({}),
			User.deleteMany({}),
			District.deleteMany({}),
		]);
	}

	// Seed District -> Cities (minimal sample dataset; extend as needed)
	await District.insertMany(
		[
			{ name: "Kathmandu", cities: ["Kalanki", "Koteshwor", "Gongabu"] },
			{ name: "Bhaktapur", cities: ["Suryabinayak", "Thimi"] },
			{ name: "Kavre", cities: ["Banepa", "Dhulikhel"] },
			{ name: "Sindhuli", cities: ["Bardibas", "Sindhulimadi"] },
			{ name: "Sunsari", cities: ["Itahari", "Dharan"] },
			{ name: "Morang", cities: ["Biratchowk", "Belbari", "Laxminagar", "Pathari", "Urlabari"] },
			{ name: "Jhapa", cities: ["Damak", "Birtamod", "Kakarvitta"] },
			{ name: "Chitwan", cities: ["Narayangadh", "Sauraha"] },
			{ name: "Pokhara", cities: ["Prithvi Chowk", "Lakeside"] },
		],
		{ ordered: false }
	).catch(() => {
		// Ignore duplicates when seed is run without clearing.
	});

	const passwordHash = await bcrypt.hash("password123", 10);

	const admin = await User.create({
		name: "Admin",
		email: "admin@demo.com",
		password: passwordHash,
		role: "admin",
		phone: "9800000000",
		isActive: true,
	});

	const operator = await User.create({
		name: "Operator",
		email: "operator@demo.com",
		password: passwordHash,
		role: "operator",
		phone: "9811111111",
		isActive: true,
	});

	const customer = await User.create({
		name: "Customer",
		email: "customer@demo.com",
		password: passwordHash,
		role: "customer",
		phone: "9822222222",
		isActive: true,
	});

	const bus1 = await Bus.create({
		name: "Kathmandu Express",
		type: "AC",
		totalSeats: 32,
		operator: operator._id,
	});

	const bus2 = await Bus.create({
		name: "Pokhara Rider",
		type: "Non-AC",
		totalSeats: 28,
		operator: operator._id,
	});

	const route1 = await Route.create({ source: "Kathmandu", destination: "Pokhara", distance: 200 });
	const route2 = await Route.create({ source: "Kathmandu", destination: "Chitwan", distance: 150 });
	const route3 = await Route.create({ source: "Pokhara", destination: "Chitwan", distance: 120 });

	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = String(today.getMonth() + 1).padStart(2, "0");
	const dd = String(today.getDate()).padStart(2, "0");
	const dateStr = `${yyyy}-${mm}-${dd}`;

	const schedule1 = await Schedule.create({
		bus: bus1._id,
		route: route1._id,
		date: dateStr,
		time: "07:30",
		price: 900,
	});

	const schedule2 = await Schedule.create({
		bus: bus2._id,
		route: route2._id,
		date: dateStr,
		time: "09:00",
		price: 700,
	});

	await Booking.create({
		user: customer._id,
		schedule: schedule1._id,
		seats: [1, 2],
		status: "confirmed",
	});

	return {
		users: { admin: admin.email, operator: operator.email, customer: customer.email },
		password: "password123",
		schedules: [schedule1._id.toString(), schedule2._id.toString()],
	};
};

seed()
	.then((info) => {
		// eslint-disable-next-line no-console
		console.log("Seed completed:", info);
		process.exit(0);
	})
	.catch((e) => {
		// eslint-disable-next-line no-console
		console.error("Seed failed:", e);
		process.exit(1);
	});
