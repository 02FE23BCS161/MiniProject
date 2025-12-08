const Team = require("../models/Team");

// Load teams for the logged-in user and set res.locals.userTeams
exports.loadUserTeams = async (req, res, next) => {
    if (!req.session.user) {
        res.locals.userTeams = [];
        return next();
    }

    try {
        const teams = await Team.find({ members: req.session.user._id });
        res.locals.userTeams = teams || [];

        // If user is member of exactly one team and no currentTeam set, auto-select it
        if ((!req.session.currentTeam || !req.session.currentTeam.toString) && res.locals.userTeams.length === 1) {
            req.session.currentTeam = res.locals.userTeams[0]._id;
        }

        // expose currentTeam to views
        if (req.session.currentTeam) {
            const current = await Team.findById(req.session.currentTeam);
            res.locals.currentTeam = current || null;
        } else {
            res.locals.currentTeam = null;
        }

        next();
    } catch (err) {
        console.log(err);
        res.locals.userTeams = [];
        res.locals.currentTeam = null;
        next();
    }
};

// Middleware to require a current team (redirect to selection if multiple, or show message)
exports.requireTeam = async (req, res, next) => {
    if (!req.session.user) return res.redirect("/auth/login");

    try {
        const teams = await Team.find({ members: req.session.user._id });

        if (!teams || teams.length === 0) {
            // user not part of any team
            req.flash("error_msg", "You are not part of any team. Ask your team leader to add you or create a new team.");
            res.locals.userTeams = [];
            res.locals.currentTeam = null;
            return next();
        }

        if (teams.length === 1) {
            req.session.currentTeam = teams[0]._id;
            res.locals.currentTeam = teams[0];
            return next();
        }

        // multiple teams -> if currentTeam set and valid, continue; else redirect to select
        if (req.session.currentTeam) {
            const ct = teams.find(t => t._id.toString() === req.session.currentTeam.toString());
            if (ct) {
                res.locals.currentTeam = ct;
                return next();
            }
        }

        // otherwise ask user to pick a team
        return res.redirect("/teams/select");
    } catch (err) {
        console.log(err);
        return next();
    }
};

// Check that the current user is member of the given team id
exports.userIsMemberOf = async (userId, teamId) => {
    const team = await Team.findOne({ _id: teamId, members: userId });
    return !!team;
};
