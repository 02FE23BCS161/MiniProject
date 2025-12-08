const express = require("express");
const router = express.Router();
const indexController = require("../controllers/indexController");

// home page
router.get("/", indexController.home);

module.exports = router;
