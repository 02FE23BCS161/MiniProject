const fs = require("fs");
const path = require("path");
const File = require("../models/File");
const Node = require("../models/Node");
const Team = require("../models/Team");
const Notification = require("../models/notifications");

exports.listFiles = async (req, res) => {
    // Only show files for the current team (if set). If user has no team, show informative message.
    const currentTeam = req.session.currentTeam;
    if (!currentTeam) {
        // user may not be part of any team; show empty list and message
        return res.render("files/files", { title: "Files", files: [], noTeam: true, currentTeam: null, user: req.session.user });
    }

    // Fetch current team with leader populated
    const Team = require("../models/Team");
    const team = await Team.findById(currentTeam).populate("leader");
    
    const files = await File.find({ team: currentTeam }).populate("owner").populate("storageNode");
    res.render("files/files", { title: "Files", files, noTeam: false, currentTeam: team, user: req.session.user });
};

exports.uploadForm = async (req, res) => {
    res.render("files/upload", { title: "Upload File" });
};

exports.uploadFile = async (req, res) => {
    const { fileName, fileType, fileContent, primaryNodeId } = req.body;
    const file = req.file; // multer stores uploaded file info here

    try {
        const currentTeam = req.session.currentTeam;
        if (!currentTeam) {
            req.flash("error_msg", "You must join a team to upload files.");
            return res.redirect("/files");
        }

        if (!primaryNodeId) {
            req.flash("error_msg", "Please select a primary node.");
            return res.redirect("/files/upload");
        }

        // Fetch team with nodes populated
        const team = await Team.findById(currentTeam).populate("nodes");
        if (!team || !team.nodes || team.nodes.length === 0) {
            req.flash("error_msg", "Team has no storage nodes configured.");
            return res.redirect("/files");
        }

        // Verify selected node exists and belongs to team
        const primaryNode = team.nodes.find(n => n._id.toString() === primaryNodeId);
        if (!primaryNode) {
            req.flash("error_msg", "Selected node does not belong to your team.");
            return res.redirect("/files/upload");
        }

        let finalFileName = fileName;
        let fileSize = 0;

        if (fileType === "upload") {
            // Handle local file upload: persist to disk under public/uploads
            if (!file) {
                req.flash("error_msg", "No file selected.");
                return res.redirect("/files/upload");
            }

            finalFileName = fileName && fileName.trim() ? fileName.trim() : file.originalname;
            fileSize = file.size;

            // ensure upload directory exists
            const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            // create unique filename on disk
            const safeName = Date.now() + '-' + (file.originalname || 'upload');
            const destPath = path.join(uploadsDir, safeName);
            fs.writeFileSync(destPath, file.buffer);

            // Attach upload metadata to be saved on File document
            req._savedUpload = {
                filePath: path.join('uploads', safeName).replace(/\\/g, '/'),
                originalName: file.originalname,
                mimeType: file.mimetype
            };

            // If the uploaded file is a text-like mime type and small, capture its content for inline viewing
            try {
                const displayableTypes = ['application/json', 'application/xml', 'text/csv', 'application/javascript'];
                const isText = (file.mimetype && (file.mimetype.startsWith('text/') || displayableTypes.includes(file.mimetype)));
                const MAX_INLINE_BYTES = 200 * 1024; // 200 KB
                if (isText && file.buffer && file.size <= MAX_INLINE_BYTES) {
                    // store UTF-8 content for inline display
                    req._savedUpload.fileContent = file.buffer.toString('utf8');
                }
            } catch (e) {
                // ignore content extraction errors
            }

        } else if (fileType === "create") {
            // Handle new file creation
            if (!finalFileName || !finalFileName.trim()) {
                req.flash("error_msg", "File name is required.");
                return res.redirect("/files/upload");
            }

            finalFileName = finalFileName.trim();
            // Calculate size based on content
            fileSize = fileContent ? Buffer.byteLength(fileContent, 'utf8') : 0;
        } else {
            req.flash("error_msg", "Invalid file type.");
            return res.redirect("/files/upload");
        }

        // Create file with pending_confirmation status (no size constraint)
        const newFile = new File({
            fileName: finalFileName,
            fileSize,
            fileContent: fileContent || (req._savedUpload && req._savedUpload.fileContent) || "",
            originalName: req._savedUpload ? req._savedUpload.originalName : undefined,
            mimeType: req._savedUpload ? req._savedUpload.mimeType : undefined,
            filePath: req._savedUpload ? req._savedUpload.filePath : undefined,
            owner: req.session.user._id,
            team: currentTeam,
            storageNode: primaryNode._id,
            replicas: team.nodes.filter(n => n._id.toString() !== primaryNode._id.toString()), // Other nodes are replicas
            status: "pending_confirmation", // File created but awaiting confirmation
            changeType: "create",
            lastModifiedBy: req.session.user._id
        });

        await newFile.save();

        // Update primary node storage immediately (no size constraint)
        primaryNode.fileCount++;
        primaryNode.usedStorage += fileSize;
        primaryNode.availableStorage = primaryNode.totalStorage - primaryNode.usedStorage;
        await primaryNode.save();

        // Create notification for team members
        const actionMsg = fileType === "upload" ? "uploaded a file" : "created a file";
        const notifMsg = `${req.session.user.name} ${actionMsg}: "${finalFileName}". This change needs to be confirmed before syncing to backup nodes.`;
        
        // Create notification for the member who initiated the change
        const notification = new Notification({
            user: req.session.user._id,
            message: notifMsg,
            type: "file_change",
            relatedFile: newFile._id,
            team: currentTeam,
            changeType: "create",
            initiatedBy: req.session.user._id,
            requiresApproval: false,
            actionStatus: "pending"
        });
        await notification.save();

        // Notify all team members about the pending change (members should confirm)
        await Notification.insertMany(
            team.members.map(memberId => ({
                user: memberId,
                message: notifMsg,
                type: "file_change",
                relatedFile: newFile._id,
                team: currentTeam,
                changeType: "create",
                initiatedBy: req.session.user._id,
                requiresApproval: false,
                actionStatus: "pending"
            }))
        );

        req.flash("success_msg", `File created and stored on ${primaryNode.nodeName}. Awaiting your confirmation before sync to backup nodes.`);
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to process file");
        res.redirect("/files");
    }
};

// POST /files/:fileId/confirm - Member confirms the change
exports.confirmChange = async (req, res) => {
    const { fileId } = req.params;
    try {
        const file = await File.findById(fileId).populate("team");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        if (file.status === "synced") {
            req.flash("error_msg", "This file has already been synced.");
            return res.redirect("/files");
        }

        // Mark file as pending approval (awaiting leader approval)
        file.status = "pending_approval";
        await file.save();

        // Create notification for leader to approve
        const notif = new Notification({
            user: file.team.leader,
            message: `${req.session.user.name} confirmed changes for file "${file.fileName}". Please review and approve to sync to backup nodes.`,
            type: "approval_required",
            relatedFile: file._id,
            team: file.team._id,
            changeType: "create",
            initiatedBy: req.session.user._id,
            requiresApproval: true,
            actionStatus: "pending"
        });
        await notif.save();

        req.flash("success_msg", "Changes confirmed. Awaiting leader approval to sync to backup nodes.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to confirm change");
        res.redirect("/files");
    }
};

// POST /files/:fileId/approve - Leader approves and syncs to all nodes
exports.approveAndSync = async (req, res) => {
    const { fileId } = req.params;
    try {
        const file = await File.findById(fileId).populate("team").populate("storageNode").populate("replicas");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        const team = await Team.findById(file.team._id).populate("leader");
        if (team.leader._id.toString() !== req.session.user._id.toString()) {
            req.flash("error_msg", "Only team leader can approve changes.");
            return res.redirect("/files");
        }

        // Simulate syncing to all replica nodes
        if (file.replicas && file.replicas.length > 0) {
            for (let replica of file.replicas) {
                replica.fileCount++;
                replica.usedStorage += file.fileSize;
                replica.availableStorage = replica.totalStorage - replica.usedStorage;
                await replica.save();
            }
        }

        // Mark file as synced
        file.status = "synced";
        await file.save();

        // Notify all team members of completion
        // Update any pending approval notifications for this file
        await Notification.updateMany({ relatedFile: file._id, actionStatus: 'pending' }, { actionStatus: 'approved', approver: req.session.user._id });

        const notif = new Notification({
            user: team.leader._id,
            message: `File "${file.fileName}" has been approved and synced to all backup nodes.`,
            type: "sync_complete",
            relatedFile: file._id,
            team: team._id,
            actionStatus: 'approved',
            approver: req.session.user._id
        });
        await notif.save();

        await Notification.insertMany(
            team.members.map(memberId => ({
                user: memberId,
                message: `File "${file.fileName}" has been synced to all backup nodes.`,
                type: "sync_complete",
                relatedFile: file._id,
                team: team._id,
                actionStatus: 'approved',
                approver: req.session.user._id
            }))
        );

        req.flash("success_msg", "Changes approved. File synced to all backup nodes.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to approve changes");
        res.redirect("/files");
    }
};

// POST /files/:fileId/reject - Leader rejects changes (revert)
exports.rejectChange = async (req, res) => {
    const { fileId } = req.params;
    try {
        const file = await File.findById(fileId).populate("team").populate("storageNode");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        const team = await Team.findById(file.team._id).populate("leader");
        if (team.leader._id.toString() !== req.session.user._id.toString()) {
            req.flash("error_msg", "Only team leader can reject changes.");
            return res.redirect("/files");
        }

        // Revert: free up space on primary node and delete file
        const primaryNode = file.storageNode;
        primaryNode.fileCount--;
        primaryNode.usedStorage -= file.fileSize;
        primaryNode.availableStorage = primaryNode.totalStorage - primaryNode.usedStorage;
        await primaryNode.save();

        // Delete the file
        await File.findByIdAndDelete(fileId);

        // Notify team members
        // Update any pending approval notifications for this file
        await Notification.updateMany({ relatedFile: file._id, actionStatus: 'pending' }, { actionStatus: 'rejected', approver: req.session.user._id });

        await Notification.insertMany(
            team.members.map(memberId => ({
                user: memberId,
                message: `Changes for file "${file.fileName}" have been rejected and reverted.`,
                type: "change_rejected",
                relatedFile: file._id,
                team: team._id,
                actionStatus: 'rejected',
                approver: req.session.user._id
            }))
        );

        req.flash("success_msg", "Changes rejected. File has been reverted and removed.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to reject changes");
        res.redirect("/files");
    }
};

// GET /files/:fileId/edit-form - Show edit form with old and new content side-by-side
exports.editForm = async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId).populate("owner").populate("team");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        // Check if user is part of the team
        if (!file.team.members.find(m => m.toString() === req.session.user._id.toString())) {
            req.flash("error_msg", "You don't have permission to edit this file");
            return res.redirect("/files");
        }

        res.render("files/edit", { title: "Edit File", file });
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to load edit form");
        res.redirect("/files");
    }
};

// POST /files/:fileId/edit - Submit file edit (member action)
exports.editFile = async (req, res) => {
    const { fileId } = req.params;
    const { fileName, fileContent } = req.body;

    try {
        const file = await File.findById(fileId).populate("team");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        // Only team members can edit
        if (!file.team.members.find(m => m.toString() === req.session.user._id.toString())) {
            req.flash("error_msg", "You don't have permission to edit this file");
            return res.redirect("/files");
        }

        // Save old content for comparison
        file.oldFileName = file.fileName;
        file.oldFileContent = file.fileContent;
        file.oldFileSize = file.fileSize;

        // Update with new content
        file.fileName = fileName.trim();
        file.fileContent = fileContent || "";
        file.fileSize = fileContent ? Buffer.byteLength(fileContent, 'utf8') : 0;
        file.lastModifiedBy = req.session.user._id;
        file.lastEditDate = new Date();

        // Set status based on current status
        if (file.status === "synced") {
            file.status = "pending_confirmation";
            file.changeType = "edit";
        } else if (file.status === "pending_confirmation" || file.status === "pending_approval") {
            // Keep existing status, just update content
            file.changeType = "edit";
        }

        await file.save();

        // Create notification for team members about the edit
        const notifMsg = `${req.session.user.name} modified file "${file.fileName}". Changes need confirmation and leader approval.`;

        await Notification.insertMany(
            file.team.members.map(memberId => ({
                user: memberId,
                message: notifMsg,
                type: "file_change",
                relatedFile: file._id,
                team: file.team._id,
                changeType: "edit",
                initiatedBy: req.session.user._id,
                requiresApproval: false,
                actionStatus: "pending"
            }))
        );

        req.flash("success_msg", "File edited successfully. Changes are pending confirmation and leader approval.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to edit file");
        res.redirect("/files");
    }
};

// POST /files/:fileId/delete-request - Member requests file deletion (with approval workflow)
exports.deleteFileRequest = async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await File.findById(fileId).populate("team");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        // Only team members can request deletion
        if (!file.team.members.find(m => m.toString() === req.session.user._id.toString())) {
            req.flash("error_msg", "You don't have permission to delete this file");
            return res.redirect("/files");
        }

        // Save current state in case of rejection
        file.oldFileName = file.fileName;
        file.oldFileContent = file.fileContent;
        file.oldFileSize = file.fileSize;

        // Mark file as pending deletion
        file.status = "pending_delete";
        file.changeType = "delete";
        file.lastModifiedBy = req.session.user._id;
        file.lastEditDate = new Date();
        await file.save();

        // Notify team members and leader about deletion request
        const notifMsg = `${req.session.user.name} requested to delete file "${file.fileName}". Leader approval is required.`;

        await Notification.insertMany(
            file.team.members.map(memberId => ({
                user: memberId,
                message: notifMsg,
                type: "file_change",
                relatedFile: file._id,
                team: file.team._id,
                changeType: "delete",
                initiatedBy: req.session.user._id,
                requiresApproval: true,
                actionStatus: "pending"
            }))
        );

        req.flash("success_msg", "File deletion requested. Awaiting leader approval.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to request file deletion");
        res.redirect("/files");
    }
};

// POST /files/:fileId/confirm-edit - Member confirms an edit (after editing)
exports.confirmEdit = async (req, res) => {
    const { fileId } = req.params;

    try {
        const file = await File.findById(fileId).populate("team");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        if (file.changeType !== "edit") {
            req.flash("error_msg", "This action only applies to edited files");
            return res.redirect("/files");
        }

        // Move from pending_confirmation to pending_approval
        file.status = "pending_approval";
        await file.save();

        // Create notification for leader to approve the edit
        const notif = new Notification({
            user: file.team.leader,
            message: `${req.session.user.name} confirmed edit for file "${file.fileName}". Please review and approve changes.`,
            type: "approval_required",
            relatedFile: file._id,
            team: file.team._id,
            changeType: "edit",
            initiatedBy: req.session.user._id,
            requiresApproval: true,
            actionStatus: "pending"
        });
        await notif.save();

        req.flash("success_msg", "Edit confirmed. Awaiting leader approval.");
        res.redirect("/files");
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to confirm edit");
        res.redirect("/files");
    }
};

// GET /files/:fileId/download - stream or send the file for download
exports.downloadFile = async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId).populate('team');
        if (!file) {
            req.flash('error_msg', 'File not found');
            return res.redirect('/files');
        }

        // Check team membership
        if (!file.team.members.find(m => m.toString() === req.session.user._id.toString())) {
            req.flash('error_msg', "You don't have permission to download this file");
            return res.redirect('/files');
        }

        // If file was uploaded and stored on disk
        if (file.filePath) {
            const absPath = path.join(__dirname, '..', 'public', file.filePath);
            if (!fs.existsSync(absPath)) {
                req.flash('error_msg', 'File not available on server');
                return res.redirect('/files');
            }

            const downloadName = file.originalName || file.fileName || 'download';
            return res.download(absPath, downloadName);
        }

        // Otherwise if fileContent exists (text), send as text file
        if (file.fileContent) {
            const buffer = Buffer.from(file.fileContent, 'utf8');
            res.setHeader('Content-Disposition', `attachment; filename="${file.fileName || 'file'}.txt"`);
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.send(buffer);
        }

        req.flash('error_msg', 'No downloadable content for this file');
        res.redirect('/files');
    } catch (err) {
        console.log(err);
        req.flash('error_msg', 'Failed to download file');
        res.redirect('/files');
    }
};

// GET /files/:fileId/view - View file content (for all team members)
exports.viewFile = async (req, res) => {
    try {
        const file = await File.findById(req.params.fileId).populate("owner").populate("team").populate("lastModifiedBy");
        if (!file) {
            req.flash("error_msg", "File not found");
            return res.redirect("/files");
        }

        // Check if user is part of the team
        if (!file.team.members.find(m => m.toString() === req.session.user._id.toString())) {
            req.flash("error_msg", "You don't have permission to view this file");
            return res.redirect("/files");
        }

        // If the file was uploaded to disk and we don't have inline content, try to read it for display when safe
        try {
            const displayableTypes = ['application/json', 'application/xml', 'text/csv', 'application/javascript'];
            const isText = (file.mimeType && (file.mimeType.startsWith('text/') || displayableTypes.includes(file.mimeType)));
            const MAX_INLINE_BYTES = 200 * 1024; // 200 KB
            if (!file.fileContent && file.filePath && isText) {
                const absPath = path.join(__dirname, '..', 'public', file.filePath);
                if (fs.existsSync(absPath)) {
                    const stats = fs.statSync(absPath);
                    if (stats.size <= MAX_INLINE_BYTES) {
                        const content = fs.readFileSync(absPath, 'utf8');
                        file.fileContent = content;
                        // persist so future views don't need to read from disk
                        try { await file.save(); } catch (e) { /* ignore save errors */ }
                    }
                }
            }
        } catch (e) {
            // ignore read errors and continue to render (download option will be available)
        }

        res.render("files/view", { title: "View File", file, user: req.session.user });
    } catch (error) {
        console.log(error);
        req.flash("error_msg", "Failed to load file");
        res.redirect("/files");
    }
};
