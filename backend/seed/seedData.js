// Seed script to populate the database with sample data for development and testing
// Run with: npm run seed

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");

const { User } = require("../modules/user/user.model");
const { Bus } = require("../modules/bus/bus.model");
const { Route } = require("../modules/route/route.model");
const { Schedule } = require("../modules/schedule/schedule.model");
const { Booking } = require("../modules/booking/booking.model");
const { SeatLock } = require("../modules/seatLock/seatLock.model");
const { City } = require("../modules/location/location.model");
const { District } = require("../modules/district/district.model");
const { Stop } = require("../modules/stop/stop.model");

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
			City.deleteMany({}),
			District.deleteMany({}),
		]);
	}

	const districtSeedData = [
		{ name: "Kathmandu", key: "kathmandu", cities: ["Kathmandu", "Kalanki", "Koteshwor", "Gongabu"] },
		{ name: "Bhaktapur", key: "bhaktapur", cities: ["Suryabinayak", "Thimi"] },
		{ name: "Kavre", key: "kavre", cities: ["Banepa", "Dhulikhel"] },
		{ name: "Sindhuli", key: "sindhuli", cities: ["Bardibas", "Sindhulimadi"] },
		{ name: "Sunsari", key: "sunsari", cities: ["Itahari", "Dharan"] },
		{ name: "Morang", key: "morang", cities: ["Biratchowk", "Belbari", "Laxminagar", "Pathari", "Urlabari"] },
		{ name: "Jhapa", key: "jhapa", cities: ["Damak", "Birtamod", "Kakarvitta"] },
		{ name: "Chitwan", key: "chitwan", cities: ["Chitwan", "Narayangadh", "Sauraha"] },
		{ name: "Kaski", key: "kaski", cities: ["Pokhara", "Prithvi Chowk", "Lakeside"] },
	];

	const districtDocs = new Map();
	for (const district of districtSeedData) {
		const districtDoc = await District.create({ name: district.name, key: district.key });
		districtDocs.set(district.key, districtDoc);
	}

	for (const district of districtSeedData) {
		const districtDoc = districtDocs.get(district.key);
		for (const cityName of district.cities) {
			const key = String(cityName || "").trim().toLowerCase();
			await City.create({ name: cityName, key, district: districtDoc._id });
		}
	}

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

	const kathmanduCity = await City.findOne({ key: "kathmandu" }).populate("district");
	const pokharaCity = await City.findOne({ key: "pokhara" }).populate("district");
	const chitwanCity = await City.findOne({ key: "chitwan" }).populate("district");

	const route1 = await Route.create({
		sourceCity: kathmanduCity._id,
		destinationCity: pokharaCity._id,
		sourceDistrict: kathmanduCity.district.name,
		destinationDistrict: pokharaCity.district.name,
		source: kathmanduCity.name,
		destination: pokharaCity.name,
		distance: 200,
		stops: [],
	});
	const route2 = await Route.create({
		sourceCity: kathmanduCity._id,
		destinationCity: chitwanCity._id,
		sourceDistrict: kathmanduCity.district.name,
		destinationDistrict: chitwanCity.district.name,
		source: kathmanduCity.name,
		destination: chitwanCity.name,
		distance: 150,
		stops: [],
	});
	const route3 = await Route.create({
		sourceCity: pokharaCity._id,
		destinationCity: chitwanCity._id,
		sourceDistrict: pokharaCity.district.name,
		destinationDistrict: chitwanCity.district.name,
		source: pokharaCity.name,
		destination: chitwanCity.name,
		distance: 120,
		stops: [],
	});

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
