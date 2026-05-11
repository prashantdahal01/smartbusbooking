const path = require("path");
const mongoose = require("mongoose");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const connectDB = require("../config/db");
const { Route } = require("../modules/route/route.model");
const { syncRoutePoints } = require("../services/routePointSync.service");

const run = async () => {
	await connectDB();

	const routes = await Route.find({}).select("_id source destination").lean();
	console.log(`[route-sync] Found ${routes.length} routes to synchronize.`);

	for (const route of routes) {
		await syncRoutePoints(route._id);
		console.log(`[route-sync] Synced ${route.source} -> ${route.destination} (${route._id})`);
	}

	await mongoose.connection.close();
	console.log("[route-sync] Completed route point synchronization.");
};

run().catch(async (error) => {
	console.error("[route-sync] Failed:", error);
	try {
		await mongoose.connection.close();
	} catch {
		// ignore close errors
	}
	process.exitCode = 1;
});
