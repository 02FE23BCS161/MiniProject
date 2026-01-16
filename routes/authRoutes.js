const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// login
router.get("/login", authController.getLogin);
router.post("/login", authController.postLogin);

// register
router.get("/register", authController.getRegister);
router.post("/register", authController.postRegister);

// logout
router.get("/logout", authController.logout);

module.exports = router;
