const multer = require('multer')
const fs = require("fs");
const path = require("path");

const uploadsPath = path.join(__dirname, "../../uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
}

    const Storage = multer.diskStorage({
        destination: (req, file, cb)=>{
            cb(null, uploadsPath)
        },
        filename: (req, file, cb)=>{
            const ext = path.extname(file.originalname);

            const filename = Date.now() + ext

            cb(null, filename)
        }
    })


    const fileFilter = (req, file, cb)=>{
        const AllowedTypes = ["image/jpeg", "image/png", "image/webp"]

        if(!AllowedTypes.includes(file.mimetype)) return cb(null, false);

        cb(null, true)
    }

    const upload = multer({
        storage: Storage,
        fileFilter,
        limits: {
            fileSize: 5 * 1024 * 1024,
            files: 1,
            fields: 10  
    }
    })

    module.exports = upload