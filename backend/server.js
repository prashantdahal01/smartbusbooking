const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

app.use(cors());
app.use(express.json());

// Static assets (bus images, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (req, res) => {
	res.json({ status: "ok" });
});

// Routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/districts", require("./routes/district.routes"));
app.use("/api/routes", require("./routes/route.routes"));
app.use("/api/stops", require("./routes/stop.routes"));
app.use("/api/schedules", require("./routes/schedule.routes"));
app.use("/api/bookings", require("./routes/booking.routes"));
app.use("/api/payments", require("./routes/payment.routes"));
app.use("/api/operator", require("./routes/operator.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

// Basic error handler
app.use((err, req, res, next) => {
	// eslint-disable-next-line no-console
	console.error(err);
	res.status(500).json({ message: "Internal server error" });
});

const start = async () => {
	await connectDB();
	const port = Number(process.env.PORT) || 5000;
	app.listen(port, () => {
		// eslint-disable-next-line no-console
		console.log(`Backend listening on port ${port}`);
	});
};

if (require.main === module) {
	start().catch((e) => {
		// eslint-disable-next-line no-console
		console.error(e);
		process.exit(1);
	});
}

module.exports = app;