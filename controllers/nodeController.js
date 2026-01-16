const Node = require("../models/Node");
const File = require("../models/File");

exports.listNodes = async (req, res) => {
    try {
        const currentTeam = req.session.currentTeam;
        if (!currentTeam) {
            req.flash("error_msg", "You must join a team to view nodes.");
            return res.redirect("/");
        }

        // Get current team and its nodes
        const Team = require("../models/Team");
        const team = await Team.findById(currentTeam).populate("nodes");
        if (!team || !team.nodes) {
            return res.render("nodes/nodes", { title: "DFS Nodes", nodes: [] });
        }

        const nodes = team.nodes;

        // For each node, fetch files stored on it (as primary or replica)
        const nodesWithFiles = await Promise.all(
            nodes.map(async (node) => {
                const primaryFiles = await File.find({ storageNode: node._id })
                    .populate("owner", "username")
                    .populate("team", "teamName");
                
                const replicaFiles = await File.find({ replicas: node._id })
                    .populate("owner", "username")
                    .populate("team", "teamName");

                const allFiles = [
                    ...primaryFiles.map(f => ({ ...f.toObject(), role: "primary" })),
                    ...replicaFiles.map(f => ({ ...f.toObject(), role: "replica" }))
                ];

                // Remove duplicates (files that are both primary and replica)
                const uniqueFiles = [];
                const seenIds = new Set();
                for (const file of allFiles) {
                    if (!seenIds.has(file._id.toString())) {
                        seenIds.add(file._id.toString());
                        uniqueFiles.push(file);
                    }
                }

                return {
                    ...node.toObject(),
                    files: uniqueFiles,
                    fileCount: uniqueFiles.length
                };
            })
        );

        res.render("nodes/nodes", { title: "DFS Nodes", nodes: nodesWithFiles });
    } catch (err) {
        console.log(err);
        req.flash("error_msg", "Failed to load nodes");
        res.redirect("/");
    }
};

// API endpoint to return nodes as JSON (only for current team)
exports.listNodesAPI = async (req, res) => {
    try {
        const currentTeam = req.session.currentTeam;
        if (!currentTeam) {
            return res.status(403).json({ error: "You must join a team to view nodes." });
        }

        // Get current team and its nodes
        const Team = require("../models/Team");
        const team = await Team.findById(currentTeam).populate("nodes");
        if (!team || !team.nodes) {
            return res.json([]);
        }

        res.json(team.nodes);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch nodes" });
    }
};

// Nodes are created automatically during team creation
// No manual node creation form needed
