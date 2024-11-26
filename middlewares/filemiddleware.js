const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

// Set storage engine for Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/superadmin'; // Directory to store uploaded images
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Generate a unique filename
        const uniqueSuffix = uuidv4() + path.extname(file.originalname); // Using UUID for uniqueness
        cb(null, uniqueSuffix);
    }
});

// Initialize multer
const upload = multer({ storage });

// Export the upload middleware for single file uploads
module.exports = upload
