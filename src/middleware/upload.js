const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 },
    fileFilter: (req, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp", "text/csv", "application/vnd.ms-excel"].includes(file.mimetype))
});

module.exports = upload;
