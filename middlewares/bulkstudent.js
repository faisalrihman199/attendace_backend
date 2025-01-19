const multer = require("multer");

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// File filter to allow only CSV and Excel files
const fileFilter = (req, file, cb) => {
  const acceptedMimeTypes = [
    "text/csv", // for CSV files
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // for .xlsx Excel files
    "application/vnd.ms-excel", // for .xls Excel files
  ];

  if (acceptedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept the file
  } else {
    cb(new Error("Only CSV and Excel files are allowed"), false); // Reject the file
  }
};

// Initialize Multer with memory storage and file filter
const upload = multer({ storage, fileFilter });

module.exports = upload;