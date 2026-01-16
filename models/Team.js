const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema({
    teamName: { type: String, required: true, unique: true },
    // optional leader reference and name for display
    leader: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    leaderName: { type: String },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Nodes: first node is primary, rest are backup/replicas
    nodes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Node" }],
    // Pending changes awaiting member confirmation and leader approval
    pendingChanges: {
        type: [{
            changeId: mongoose.Schema.Types.ObjectId,
            fileId: { type: mongoose.Schema.Types.ObjectId, ref: "File" },
            changeType: { type: String, enum: ["create", "update", "delete"], default: "create" },
            changeData: mongoose.Schema.Types.Mixed, // stores the file data/changes
            initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // member confirmation
            leaderApproved: { type: Boolean, default: false },
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            status: { type: String, enum: ["pending_confirmation", "pending_approval", "approved", "rejected"], default: "pending_confirmation" },
            createdAt: { type: Date, default: Date.now }
        }],
        default: []
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Team", TeamSchema);