const fs = require("fs");
const path = require("path");
const multer = require("multer");

function ensureDir(dirPath) {
	try {
		fs.mkdirSync(dirPath, { recursive: true });
	} catch {
		// ignore
	}
}

const busUploadsDir = path.join(__dirname, "..", "uploads", "buses");
ensureDir(busUploadsDir);

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		ensureDir(busUploadsDir);
		cb(null, busUploadsDir);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || "").toLowerCase();
		const safeExt = ext && ext.length <= 10 ? ext : "";
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		cb(null, `bus-${unique}${safeExt}`);
	},
});

function imageFileFilter(req, file, cb) {
	// Allow common image types
	if (!file.mimetype) return cb(new Error("Invalid file"));
	if (file.mimetype.startsWith("image/")) return cb(null, true);
	return cb(new Error("Only image uploads are allowed"));
}

const uploadBusImage = multer({
	storage,
	fileFilter: imageFileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
	},
});

module.exports = {
	uploadBusImage,
};
