const mongoose = require("mongoose");

const NodeSchema = new mongoose.Schema({
    nodeId: { type: String, required: true },
    nodeName: { type: String, required: true },
    totalStorage: { type: Number, default: 1024 * 1024 * 1024 }, // 1GB
    usedStorage: { type: Number, default: 0 },
    availableStorage: { type: Number, default: 1024 * 1024 * 1024 },
    fileCount: { type: Number, default: 0 },
    status: { type: String, enum: ["online", "offline"], default: "online" }
});

module.exports = mongoose.model("Node", NodeSchema);
