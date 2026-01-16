const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { isAuthenticated } = require("../middleware/auth");

// list notifications
router.get("/", isAuthenticated, notificationController.listNotifications);

// mark one as read
router.get("/read/:id", isAuthenticated, notificationController.markRead);

// Leader approves change from notification
router.post("/:notificationId/approve", isAuthenticated, notificationController.approveFromNotification);

// Leader rejects change from notification
router.post("/:notificationId/reject", isAuthenticated, notificationController.rejectFromNotification);

module.exports = router;
