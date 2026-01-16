const User = require("../models/User");
const bcrypt = require("bcryptjs");

exports.getLogin = (req, res) => {
    res.render("auth/login", { title: "Login" });
};

exports.getRegister = (req, res) => {
    res.render("auth/register", { title: "Register" });
};

exports.postRegister = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            req.flash("error_msg", "Email already registered");
            return res.redirect("/auth/register");
        }

        const hashed = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            password: hashed
        });

        await newUser.save();

        req.flash("success_msg", "Registration successful! Please login.");
        res.redirect("/auth/login");
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Something went wrong");
        res.redirect("/auth/register");
    }
};

exports.postLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            req.flash("error_msg", "Invalid email or password");
            return res.redirect("/auth/login");
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            req.flash("error_msg", "Invalid email or password");
            return res.redirect("/auth/login");
        }

        req.session.user = user;
        // After login, determine teams membership and set/ask for current team
        const Team = require("../models/Team");
        const teams = await Team.find({ members: user._id });
        if (!teams || teams.length === 0) {
            req.session.currentTeam = null;
            req.flash("success_msg", "Welcome back! You are not part of any team yet.");
            return res.redirect("/");
        }

        if (teams.length === 1) {
            req.session.currentTeam = teams[0]._id;
            req.flash("success_msg", "Welcome back! Joined your team.");
            return res.redirect("/");
        }

        // multiple teams -> ask user to select
        req.session.currentTeam = null;
        req.flash("info_msg", "You belong to multiple teams. Please select which team to join.");
        return res.redirect("/teams/select");
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Something went wrong");
        res.redirect("/auth/login");
    }
};

exports.logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/auth/login");
    });
};
