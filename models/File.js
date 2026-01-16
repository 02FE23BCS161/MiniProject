const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema({
    fileName: { type: String, required: true },
    fileType: { type: String },
    fileSize: { type: Number },
    fileContent: { type: String, default: "" }, // Store text content (for created/edited text files)
    // For uploads: store original name, mime type and server path
    originalName: { type: String },
    mimeType: { type: String },
    filePath: { type: String },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    team: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
    // Primary node stores the file initially
    storageNode: { type: mongoose.Schema.Types.ObjectId, ref: "Node" },
    // Backup/replica nodes (synced only after leader approval)
    replicas: [{ type: mongoose.Schema.Types.ObjectId, ref: "Node" }],
    // Track change status (for create, edit, delete operations)
    status: { type: String, enum: ["pending_confirmation", "pending_approval", "synced", "pending_delete"], default: "pending_confirmation" },
    changeType: { type: String, enum: ["create", "edit", "delete"], default: "create" },
    // For edits: store old content for comparison
    oldFileContent: { type: String, default: "" },
    oldFileName: { type: String },
    oldFileSize: { type: Number },
    // Track who made the change and the current change requester
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadDate: { type: Date, default: Date.now },
    lastEditDate: { type: Date }
});

module.exports = mongoose.model("File", FileSchema);
