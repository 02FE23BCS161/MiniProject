const Notification = require("../models/notifications");
const File = require("../models/File");
const Team = require("../models/Team");

exports.listNotifications = async (req, res) => {
    const notifications = await Notification.find({
        user: req.session.user._id
    }).populate({ path: "relatedFile", populate: [{ path: 'owner', select: 'name' }, { path: 'team', select: 'teamName' }] }).sort({ createdAt: -1 });

    // populate current team for access checks in view
    let currentTeamObj = null;
    if (req.session.currentTeam) {
        currentTeamObj = await Team.findById(req.session.currentTeam).populate('leader');
    }

    res.render("notifications/notifications", {
        title: "Notifications",
        notifications,
        currentTeam: currentTeamObj,
        user: req.session.user
    });
};

exports.markRead = async (req, res) => {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.redirect("/notifications");
};

// Leader approves change from notification (disabled - approvals must be performed from Files page)
exports.approveFromNotification = async (req, res) => {
    const { notificationId } = req.params;
    try {
        // Mark notification as read and inform the user to approve from Files view
        await Notification.findByIdAndUpdate(notificationId, { read: true });
        req.flash("info_msg", "Approve/Reject from Notifications is disabled. Please approve changes from the Files page where leader actions are available.");
        res.redirect("/notifications");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Unable to process request");
        res.redirect("/notifications");
    }
};

// Leader rejects change from notification (disabled - approvals must be performed from Files page)
exports.rejectFromNotification = async (req, res) => {
    const { notificationId } = req.params;
    try {
        await Notification.findByIdAndUpdate(notificationId, { read: true });
        req.flash("info_msg", "Approve/Reject from Notifications is disabled. Please reject changes from the Files page where leader actions are available.");
        res.redirect("/notifications");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Unable to process request");
        res.redirect("/notifications");
    }
};
