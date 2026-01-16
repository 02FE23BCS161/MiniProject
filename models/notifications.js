const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    message: { type: String, required: true },
    // free-form type (e.g. file_change, approval_required, sync_complete, change_rejected)
    type: { type: String, default: "info" },
    // optional: reference to a file related to this notification
    relatedFile: { type: mongoose.Schema.Types.ObjectId, ref: "File", default: null },
    // optional: team context
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    // change type for file operations: create, edit, delete
    changeType: { type: String, enum: ["create", "edit", "delete"], default: null },
    // who initiated the change
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // whether this notification requires leader approval
    requiresApproval: { type: Boolean, default: false },
    // approval status: pending / approved / rejected
    actionStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    approver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    createdAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
});

module.exports = mongoose.model("Notification", NotificationSchema);
