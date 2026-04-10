const { getDistrictsCached } = require("../services/districtData.service");

exports.getDistricts = async (req, res) => {
	try {
		const districts = await getDistrictsCached();
		return res.json(districts);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
