import multer from "multer";
import fs from "fs";
import { dirname, join, extname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 1️⃣ Ensure upload directory exists
const uploadDir = join(__dirname, "../public/images");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 2️⃣ Configure storage
const storage = multer.diskStorage({
    destination: (req: any, file: any, callback: (arg0: null, arg1: string) => void) => {
        callback(null, uploadDir);
    },

    filename: (req: any, file: { originalname: string; }, callback: (arg0: null, arg1: string) => void) => {
        const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = extname(file.originalname);
        callback(null, uniqueName + ext);
    }
});

// 3️⃣ File filter (allow only images)
function fileFilter(req: Express.Request, file: Express.Multer.File, callback: multer.FileFilterCallback) {
    if (!file.mimetype.startsWith("image/")) {
        return callback(new Error("Only image files are allowed!"));
    }
    callback(null, true);
}

// 4️⃣ Max file size = 5MB PER file
export const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});