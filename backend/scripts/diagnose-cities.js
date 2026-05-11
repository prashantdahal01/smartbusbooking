/**
 * Diagnostic script to check cities in Jhapa district
 * Run: node backend/scripts/diagnose-cities.js
 */

require("dotenv").config({ path: ".env.local" });
const mongoose = require("mongoose");

async function main() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/smartbusbooking";
    console.log(`\n📡 Connecting to MongoDB at: ${mongoUri}\n`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Get the City collection directly
    const db = mongoose.connection;
    const citiesCollection = db.collection("cities");
    const districtsCollection = db.collection("districts");

    // Find Jhapa district
    console.log("🔍 Looking for Jhapa district...\n");
    const jhapa = await districtsCollection.findOne({ name: /jhapa/i });
    if (!jhapa) {
      console.log("❌ Jhapa district not found");
      process.exit(1);
    }

    console.log(`✅ Found Jhapa district:`);
    console.log(`   _id: ${jhapa._id}`);
    console.log(`   name: ${jhapa.name}`);
    console.log(`   key: ${jhapa.key}\n`);

    // Find all cities in Jhapa
    console.log("🔍 Looking for cities in Jhapa...\n");
    const cities = await citiesCollection
      .find({ district: jhapa._id })
      .toArray();

    console.log(`Found ${cities.length} cities in Jhapa:\n`);
    cities.forEach((city, idx) => {
      console.log(`${idx + 1}. ${city.name}`);
      console.log(`   _id: ${city._id}`);
      console.log(`   key: ${city.key}`);
      console.log(`   district: ${city.district}\n`);
    });

    // Check for any "kakarbhitta" or similar
    console.log("\n🔍 Searching for kakarbhitta-like cities (anywhere)...\n");
    const kakaCities = await citiesCollection
      .find({
        $or: [
          { name: /kakarbhit/i },
          { name: /kakarvit/i },
          { key: "kakarbhitta" },
          { key: "kakarvita" },
        ],
      })
      .toArray();

    if (kakaCities.length === 0) {
      console.log("❌ No kakarbhitta-like cities found in database");
    } else {
      console.log(`✅ Found ${kakaCities.length} kakarbhitta-like cities:\n`);
      kakaCities.forEach((city) => {
        console.log(`City: ${city.name}`);
        console.log(`  _id: ${city._id}`);
        console.log(`  key: ${city.key}`);
        console.log(`  district: ${city.district}`);
        
        // Check if district matches Jhapa
        if (String(city.district) === String(jhapa._id)) {
          console.log(`  ✅ Belongs to Jhapa`);
        } else {
          console.log(`  ❌ Does NOT belong to Jhapa`);
        }
        console.log();
      });
    }

    console.log("\n✅ Diagnostic complete");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
