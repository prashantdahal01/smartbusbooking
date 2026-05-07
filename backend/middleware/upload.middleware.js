const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

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

const storage = new CloudinaryStorage({
	cloudinary,
	params: (req, file) => {
		const category = BUS_IMAGE_FIELD_TO_CATEGORY[file.fieldname] || "misc";
		const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
		return {
			folder: "bus_images",
			allowed_formats: ["jpg", "jpeg", "png", "webp"],
			public_id: `bus-${category}-${unique}`,
			resource_type: "image",
		};
	},
});

function imageFileFilter(req, file, cb) {
	if (!file.mimetype) return cb(new Error("Invalid file"));

	if (!Object.prototype.hasOwnProperty.call(BUS_IMAGE_FIELD_TO_CATEGORY, file.fieldname)) {
		return cb(new Error("Invalid upload field for bus image"));
	}

	const originalName = String(file.originalname || "");
	const extIndex = originalName.lastIndexOf(".");
	const ext = extIndex >= 0 ? originalName.slice(extIndex).toLowerCase() : "";
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
