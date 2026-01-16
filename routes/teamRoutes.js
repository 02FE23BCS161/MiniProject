const express = require("express");
const router = express.Router();
const teamController = require("../controllers/teamController");
const { isAuthenticated } = require("../middleware/auth");

// list teams
router.get("/", isAuthenticated, teamController.listTeams);

// create team
router.get("/create", isAuthenticated, teamController.createTeamForm);
router.post("/create", isAuthenticated, teamController.createTeam);

// select team when user has multiple
router.get("/select", isAuthenticated, teamController.selectTeamForm);
router.post("/select", isAuthenticated, teamController.selectTeam);

// view specific team
router.get("/:id", isAuthenticated, teamController.viewTeam);
// add member (only leader)
router.post("/:id/add-member", isAuthenticated, teamController.addMember);

module.exports = router;
