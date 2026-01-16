const express = require("express");
const router = express.Router();
const nodeController = require("../controllers/nodeController");
const { isAuthenticated } = require("../middleware/auth");

// list nodes (for UI display)
router.get("/", isAuthenticated, nodeController.listNodes);

// API: list nodes as JSON (for frontend to select during team creation)
router.get("/api/list", isAuthenticated, nodeController.listNodesAPI);

module.exports = router;
