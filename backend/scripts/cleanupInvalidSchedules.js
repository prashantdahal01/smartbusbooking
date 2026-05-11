require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { Bus } = require("../modules/bus/bus.model");
const { Schedule } = require("../modules/schedule/schedule.model");

const run = async () => {
  try {
    await connectDB();

    const allBusIds = await Bus.distinct("_id");
    const inactiveBusIds = await Bus.find({ isActive: false }).distinct("_id");

    const orphanedSchedulesResult = await Schedule.deleteMany({
      bus: { $nin: allBusIds },
    });

    const inactiveBusSchedulesResult = inactiveBusIds.length > 0
      ? await Schedule.deleteMany({ bus: { $in: inactiveBusIds } })
      : { deletedCount: 0 };

    const deletedCount = Number(orphanedSchedulesResult.deletedCount || 0)
      + Number(inactiveBusSchedulesResult.deletedCount || 0);

    // eslint-disable-next-line no-console
    console.log("Cleanup completed", {
      orphanedSchedulesDeleted: Number(orphanedSchedulesResult.deletedCount || 0),
      inactiveBusSchedulesDeleted: Number(inactiveBusSchedulesResult.deletedCount || 0),
      totalDeleted: deletedCount,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Cleanup failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

void run();
