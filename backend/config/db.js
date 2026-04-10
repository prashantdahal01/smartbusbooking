// Establishes and exports the MongoDB connection using Mongoose
const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("Missing MONGO_URI (or MONGODB_URI) env var");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5001,
    connectTimeoutMS: 5001,
  });

  // eslint-disable-next-line no-console
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
};

module.exports = connectDB;
