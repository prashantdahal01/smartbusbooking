const fs = require("fs");
const path = require("path");
const multer = require("multer");

const BUS_IMAGE_FIELD_TO_CATEGORY = {
	busImage: "bus",
	seatLayoutImage: "seat-layout",
	sleeperLayoutImage: "sleeper-layout",
	image: "bus", // legacy single-image field support
};

const busImageUploadFields = [
	{ name: "busImage", maxCount: 1 },
	{ name: "seatLayoutImage", maxCount: 1 },
	{ name: "sleeperLayoutImage", maxCount: 1 },
	{ name: "image", maxCount: 1 },
];

const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/webp",
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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
		const safeExt = ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : "";
		const category = BUS_IMAGE_FIELD_TO_CATEGORY[file.fieldname] || "misc";
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		cb(null, `bus-${category}-${unique}${safeExt}`);
	},
});

function imageFileFilter(req, file, cb) {
	if (!file.mimetype) return cb(new Error("Invalid file"));

	if (!Object.prototype.hasOwnProperty.call(BUS_IMAGE_FIELD_TO_CATEGORY, file.fieldname)) {
		return cb(new Error("Invalid upload field for bus image"));
	}

	const ext = path.extname(file.originalname || "").toLowerCase();
	const isValidMimeType = ALLOWED_IMAGE_MIME_TYPES.has(String(file.mimetype || "").toLowerCase());
	const isValidExtension = ALLOWED_IMAGE_EXTENSIONS.has(ext);

	if (isValidMimeType && isValidExtension) return cb(null, true);
	return cb(new Error("Only jpg, jpeg, png, and webp images are allowed"));
}

const uploadBusImages = multer({
	storage,
	fileFilter: imageFileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
	},
});

module.exports = {
	uploadBusImages,
	busImageUploadFields,
};
