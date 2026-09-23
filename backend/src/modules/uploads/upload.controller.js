const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/apiError');
const { uploadDirectory } = require('../../config/upload');

const hasValidSignature = (filePath, mimeType) => {
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  try {
    fs.readSync(descriptor, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') {
    return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  }
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString() === '%PDF-';
  return false;
};

const uploadFile = (req, res) => {
  if (!req.file) throw new ApiError(422, 'FILE_REQUIRED', 'Файл қажет');
  if (!hasValidSignature(req.file.path, req.file.mimetype)) {
    fs.unlinkSync(req.file.path);
    throw new ApiError(415, 'INVALID_FILE_CONTENT', 'Файл мазмұны жарияланған түріне сәйкес емес');
  }
  return res.status(201).json({
    success: true,
    data: {
      filename: req.file.filename,
      url: `/api/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
};

const serveFile = (req, res, next) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDirectory, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return next(new ApiError(404, 'FILE_NOT_FOUND', 'Файл табылмады'));
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filePath);
};

module.exports = { uploadFile, serveFile };
