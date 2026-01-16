const Team = require("../models/Team");
const User = require("../models/User");

exports.listTeams = async (req, res) => {
    const teams = await Team.find().populate("members");
    res.render("teams/teams", { title: "Teams", teams });
};

exports.createTeamForm = (req, res) => {
    res.render("teams/create", { title: "Create Team" });
};

exports.createTeam = async (req, res) => {
    const { teamName, leaderName, primaryNodeName, backupNodeNames } = req.body;

    try {
        const Node = require("../models/Node");

        // Parse backupNodeNames if it's a JSON string
        let selectedBackupNodeNames = [];
        if (backupNodeNames) {
            try {
                selectedBackupNodeNames = typeof backupNodeNames === 'string' ? JSON.parse(backupNodeNames) : backupNodeNames;
            } catch (e) {
                selectedBackupNodeNames = Array.isArray(backupNodeNames) ? backupNodeNames : (backupNodeNames ? [backupNodeNames] : []);
            }
        }

        // Validate: backup nodes should not exceed 3
        if (selectedBackupNodeNames.length > 3) {
            req.flash("error_msg", "Maximum 3 backup nodes allowed.");
            return res.redirect("/teams/create");
        }

        // Create primary node automatically
        const primaryNode = new Node({
            nodeId: 'PRIMARY-' + Date.now(),
            nodeName: primaryNodeName,
            totalStorage: 0, // No size constraint
            usedStorage: 0,
            availableStorage: 0,
            fileCount: 0,
            status: "online"
        });

        await primaryNode.save();

        // Create backup nodes
        const backupNodes = [];
        if (selectedBackupNodeNames && selectedBackupNodeNames.length > 0) {
            for (const backupName of selectedBackupNodeNames) {
                if (backupName && backupName.trim()) {
                    const backupNode = new Node({
                        nodeId: 'BACKUP-' + Date.now() + '-' + Math.random(),
                        nodeName: backupName.trim(),
                        totalStorage: 0, // No size constraint
                        usedStorage: 0,
                        availableStorage: 0,
                        fileCount: 0,
                        status: "online"
                    });
                    await backupNode.save();
                    backupNodes.push(backupNode._id);
                }
            }
        }

        // Collect all nodes: primary first, then backups
        const allNodeIds = [primaryNode._id, ...backupNodes];

        // Try to find a user matching the provided leader name
        let leaderUser = null;
        if (leaderName && leaderName.trim()) {
            leaderUser = await User.findOne({ name: leaderName.trim() });
        }

        const members = [];
        // Always include the creator as a member
        if (req.session.user && req.session.user._id) members.push(req.session.user._id);

        // If leader is a known user, ensure they're a member too
        let leaderId = null;
        if (leaderUser) {
            leaderId = leaderUser._id;
            if (!members.find(m => m.toString() === leaderId.toString())) members.push(leaderId);
        } else if (req.session.user && req.session.user._id) {
            // Fallback: set creator as leader if lookup failed
            leaderId = req.session.user._id;
        }

        const team = new Team({
            teamName,
            leader: leaderId,
            leaderName: leaderName || (req.session.user && req.session.user.name) || "",
            members,
            nodes: allNodeIds // [primaryNode, ...backupNodes]
        });

        await team.save();
        
        const backupCount = selectedBackupNodeNames.length;
        const msg = backupCount === 0 ? "Team created with 1 primary node only" 
                  : backupCount === 1 ? "Team created with 1 primary and 1 backup node"
                  : "Team created with 1 primary and 2 backup nodes";
        req.flash("success_msg", msg);
        res.redirect("/teams");
    } catch (err) {
        console.log("Error creating team:", err);
        // Check for duplicate key error (MongoDB error code 11000)
        if (err.code === 11000 || err.keyValue?.teamName) {
            req.flash("error_msg", "Team already exists. Please choose a different team name.");
            return res.redirect("/teams/create");
        }
        req.flash("error_msg", "Failed to create team");
        res.redirect("/teams/create");
    }
};

exports.viewTeam = async (req, res) => {
    try {
        const team = await Team.findById(req.params.id).populate("members").populate("leader");
        res.render("teams/view", { title: "Team Details", team, user: req.session.user });
    } catch (err) {
        req.flash("error_msg", "Team not found");
        res.redirect("/teams");
    }
};

// POST /teams/:id/add-member
exports.addMember = async (req, res) => {
    const { memberEmail } = req.body;
    try {
        const team = await Team.findById(req.params.id);
        if (!team) {
            req.flash("error_msg", "Team not found");
            return res.redirect("/teams");
        }

        // check leader permission
        const sessionUserId = req.session.user && req.session.user._id;
        const isLeader = (team.leader && sessionUserId && team.leader.toString() === sessionUserId.toString())
            || (!team.leader && req.session.user && team.leaderName === req.session.user.name);

        if (!isLeader) {
            req.flash("error_msg", "Only the team leader can add members");
            return res.redirect(`/teams/${team._id}`);
        }

        const userToAdd = await User.findOne({ email: memberEmail });
        if (!userToAdd) {
            req.flash("error_msg", "No user found with that email");
            return res.redirect(`/teams/${team._id}`);
        }

        // don't add duplicates
        if (team.members.find(m => m.toString() === userToAdd._id.toString())) {
            req.flash("error_msg", "User is already a member");
            return res.redirect(`/teams/${team._id}`);
        }

        team.members.push(userToAdd._id);
        await team.save();
        req.flash("success_msg", "Member added successfully");
        res.redirect(`/teams/${team._id}`);
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Failed to add member");
        res.redirect(`/teams/${req.params.id}`);
    }
};

// show selection form when user belongs to multiple teams
exports.selectTeamForm = async (req, res) => {
    try {
        // populate leader so the view can determine if the current user is the leader
        const teams = await Team.find({ members: req.session.user._id }).populate("leader");
        res.render("teams/select", { title: "Select Team", teams, user: req.session.user });
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Unable to load teams");
        res.redirect("/");
    }
};

exports.selectTeam = async (req, res) => {
    const { teamId } = req.body;
    try {
        const team = await Team.findById(teamId);
        if (!team) {
            req.flash("error_msg", "Invalid team selection");
            return res.redirect("/teams/select");
        }
        // ensure user is member
        if (!team.members.map(m => m.toString()).includes(req.session.user._id.toString())) {
            req.flash("error_msg", "You are not a member of that team");
            return res.redirect("/teams/select");
        }

        req.session.currentTeam = team._id;
        req.flash("success_msg", `Joined team ${team.teamName}`);
        res.redirect("/");
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Failed to select team");
        res.redirect("/teams/select");
    }
};
