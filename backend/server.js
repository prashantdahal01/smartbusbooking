// Express application entry point
// Initializes the server, connects to MongoDB, and registers all API routes

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Load environment variables
dotenv.config();

// Connect to MongoDB
// connectDB();

const app = express();

// Middleware
app.use(cors());             // Enable Cross-Origin Resource Sharing
app.use(express.json());     // Parse incoming JSON request bodies

// Routes
// app.use("/api/auth", require("./routes/auth.routes"));
// app.use("/api/users", require("./routes/user.routes"));
// app.use("/api/admin", require("./routes/admin.routes"));
// app.use("/api/operator", require("./routes/operator.routes"));
// app.use("/api/bookings", require("./routes/booking.routes"));
// app.use("/api/buses", require("./routes/bus.routes"));
// app.use("/api/routes", require("./routes/route.routes"));
// app.use("/api/schedules", require("./routes/schedule.routes"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
