const express = require("express");
const router = express.Router();
const multer = require("multer");
const fileController = require("../controllers/fileController");
const { isAuthenticated } = require("../middleware/auth");

// Configure multer for file uploads (optional - will be in memory)
const upload = multer({ storage: multer.memoryStorage() });

// list files
router.get("/", isAuthenticated, fileController.listFiles);

// upload file
router.get("/upload", isAuthenticated, fileController.uploadForm);
router.post("/upload", isAuthenticated, upload.single("file"), fileController.uploadFile);

// View file (all team members can view)
router.get("/:fileId/view", isAuthenticated, fileController.viewFile);
// Download file (if binary or user prefers download)
router.get("/:fileId/download", isAuthenticated, fileController.downloadFile);

// Change confirmation and approval workflow
router.post("/:fileId/confirm", isAuthenticated, fileController.confirmChange);
router.post("/:fileId/approve", isAuthenticated, fileController.approveAndSync);
router.post("/:fileId/reject", isAuthenticated, fileController.rejectChange);

// Edit file workflow
router.get("/:fileId/edit-form", isAuthenticated, fileController.editForm);
router.post("/:fileId/edit", isAuthenticated, fileController.editFile);
router.post("/:fileId/confirm-edit", isAuthenticated, fileController.confirmEdit);

// Delete file workflow
router.post("/:fileId/delete-request", isAuthenticated, fileController.deleteFileRequest);

module.exports = router;
