const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const ApiError = require('../utils/apiError');

const uploadDirectory = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const MIME_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf'],
]);

const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename(req, file, callback) {
    callback(null, `${randomUUID()}${MIME_EXTENSIONS.get(file.mimetype)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!MIME_EXTENSIONS.has(file.mimetype)) {
      return callback(
        new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Тек JPG, PNG, WEBP және PDF файлдары қабылданады'),
      );
    }
    return callback(null, true);
  },
});

module.exports = { upload, uploadDirectory, MIME_EXTENSIONS };
