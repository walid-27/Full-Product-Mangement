const fs = require("fs/promises");
const path = require("path");
const { randomUUID } = require("crypto");
const sharp = require("sharp");
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { loadEnv } = require("../config/env");
const AppError = require("../utils/AppError");

const isSupportedImage = (buffer) => (
    (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
    (buffer.length > 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP")
);
let s3;
const getS3 = (config) => {
    if (!s3) s3 = new S3Client({
        region: "auto",
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY }
    });
    return s3;
};

const uploadImage = async (file, organization) => {
    if (!file?.buffer || !isSupportedImage(file.buffer)) {
        throw new AppError("Only valid JPEG, PNG, or WebP images are allowed", 422, "INVALID_IMAGE");
    }
    const buffer = await sharp(file.buffer).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const key = `${organization}/${randomUUID()}.webp`;
    const config = loadEnv();
    if (config.STORAGE_DRIVER === "r2") {
        await getS3(config).send(new PutObjectCommand({ Bucket: config.R2_BUCKET, Key: key, Body: buffer, ContentType: "image/webp" }));
        return config.R2_PUBLIC_URL ? `${config.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}` : key;
    }
    const directory = path.join(__dirname, "../../uploads");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, path.basename(key)), buffer, { flag: "wx" });
    return path.basename(key);
};

const deleteImage = async (stored) => {
    if (!stored) return;
    const config = loadEnv();
    const key = stored.startsWith("http") ? new URL(stored).pathname.replace(/^\//, "") : stored;
    if (config.STORAGE_DRIVER === "r2") {
        await getS3(config).send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: key }));
        return;
    }
    await fs.unlink(path.join(__dirname, "../../uploads", path.basename(key))).catch((err) => {
        if (err.code !== "ENOENT") throw err;
    });
};

module.exports = { uploadImage, deleteImage, isSupportedImage };
