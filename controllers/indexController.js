exports.home = async (req, res) => {
    try {
        let currentTeam = null;
        
        // If user is logged in and has selected a team, fetch that team's details
        if (req.session.user && req.session.currentTeam) {
            const Team = require("../models/Team");
            currentTeam = await Team.findById(req.session.currentTeam)
                .populate("members", "name email")
                .populate("leader", "name email");
        }
        
        res.render("home", {
            title: "DFS Simulator Home",
            user: req.session.user || null,
            currentTeam: currentTeam
        });
    } catch (err) {
        console.log("Error fetching team details:", err);
        res.render("home", {
            title: "DFS Simulator Home",
            user: req.session.user || null,
            currentTeam: null
        });
    }
};
