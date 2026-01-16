require('dotenv').config();
const express = require('express');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const cookieParser = require('cookie-parser');
const nodeRoutes = require("./routes/nodeRoutes");
const teamMiddleware = require("./middleware/team");

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------------
// MongoDB Connection
// ------------------------------------------
mongoose.connect(process.env.ATLAS_URL)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));


// ------------------------------------------
// Middleware
// ------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(cookieParser());

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || "dfs-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.ATLAS_URL
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Flash messages
app.use(flash());

// Global flash message middleware
app.use((req, res, next) => {
    res.locals.success_msg = req.flash("success_msg");
    res.locals.error_msg = req.flash("error_msg");
    res.locals.user = req.session.user || null;
    next();
});

// Load user's teams and current team (if any) for all requests
app.use(teamMiddleware.loadUserTeams);


// ------------------------------------------
// EJS + Layouts
// ------------------------------------------
app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layout");

// ------------------------------------------
// Static folder
// ------------------------------------------
app.use(express.static(path.join(__dirname, "public")));


// ------------------------------------------
// Routes
// ------------------------------------------
app.use("/", require("./routes/indexRoutes"));
app.use("/auth", require("./routes/authRoutes"));
app.use("/teams", require("./routes/teamRoutes"));
app.use("/files", require("./routes/fileRoutes"));
app.use("/nodes", require("./routes/nodeRoutes"));
app.use("/notifications", require("./routes/notificationRoutes"));

// ------------------------------------------
// Start server
// ------------------------------------------
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

});
