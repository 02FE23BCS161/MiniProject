# Distributed File System Simulator

A simple team-scoped distributed file system simulator built with Node.js, Express, MongoDB (Mongoose) and EJS. This project implements team isolation, multi-node storage (primary + 0–2 backups), a 2-step approval workflow for changes (member confirm → leader approve), and notifications for workflow events.

---

## Table of Contents
- Project Overview
- Key Features
- Tech Stack
- Repository Structure
- Models
- Controllers & Routes
- File lifecycle / Approval workflow
- Notifications
- How to run (Development)
- Environment variables
- Common tasks / Manual test flow
- Troubleshooting
- Next steps & TODOs

---

## Project Overview
This application simulates a distributed file storage workflow for teams. Files are initially stored on a team's primary node. When a member creates or edits a file, the change goes through a two-step confirmation:
1. Member confirms the change (becomes `pending_approval`).
2. Team leader approves or rejects the change. On approval, replicas (backup nodes) are updated (file status becomes `synced`).

Team isolation is enforced: nodes, files, and actions are scoped to `session.currentTeam`.

## Key Features
- Teams with a leader and members
- Auto-created primary node on team creation, optional 0-2 backup nodes
- Files stored on a primary node; replicas synced after leader approval
- Two-step approval workflow for file create/edit/delete
- Notifications for changes and approval requests
- Team-scoped node listing and API
- UI pages: Home, Teams (create/select/view), Files (list/upload/edit/view), Nodes, Notifications

## Tech Stack
- Node.js
- Express
- MongoDB with Mongoose
- EJS templates
- Multer (in-memory) for file uploads
- express-session for session management
- connect-flash for flash messages

## Repository Structure (top-level)
```
package.json
server.js
config/
controllers/
models/
routes/
views/
public/
```

Notable folders:
- `controllers/` — request handlers for teams, files, nodes, notifications, auth
- `models/` — Mongoose models (User, Team, Node, File, Notification)
- `routes/` — Express route definitions
- `views/` — EJS templates for pages
- `public/` — static assets (css/js)

## Models (summary)
- `User` — { name, email, password, role }
- `Team` — { teamName, leader (ref User), leaderName, members[], nodes[] (refs to Node), pendingChanges[] }
- `Node` — { nodeId, nodeName, totalStorage, usedStorage, availableStorage, fileCount, status }
- `File` — { fileName, fileType, fileSize, fileContent, owner (User), team (Team), storageNode (Node), replicas[], status, changeType, oldFileContent, oldFileName, lastModifiedBy, uploadDate, lastEditDate }
- `Notification` — { user (User), message, type, relatedFile, team, changeType (create|edit|delete), initiatedBy, requiresApproval, actionStatus (pending|approved|rejected), approver, read }

> Note: The `File` model stores the file content in `fileContent` (text) — if you want binary file storage, adapt to a file store and save references instead.

## Controllers & Routes (high level)
- `controllers/teamController.js` — create teams (auto-create primary node + optional backups), view team, add members, select current team.
  - Routes: `GET /teams`, `GET/POST /teams/create`, `GET /teams/:id`, `POST /teams/:id/add-member`, `GET/POST /teams/select`.

- `controllers/fileController.js` — upload/create files, edit, confirm, leader approve/reject, delete-request, view file content.
  - Routes: `GET /files`, `GET/POST /files/upload`, `GET /files/:fileId/view`, `GET /files/:fileId/edit-form`, `POST /files/:fileId/edit`, `POST /files/:fileId/confirm`, `POST /files/:fileId/confirm-edit`, `POST /files/:fileId/approve`, `POST /files/:fileId/reject`, `POST /files/:fileId/delete-request`.

- `controllers/nodeController.js` — list nodes for the selected team, node API endpoint (team-scoped).
- `controllers/notificationController.js` — list notifications, mark as read. (Notifications now generally mark as read from the notifications page; approvals should be performed on the Files page to avoid duplicate side-effects.)

## File lifecycle / Approval workflow
- Create or upload file (member): status = `pending_confirmation`. Stored on primary node immediately (not on backups yet).
- Member confirms the change: status = `pending_approval`. This creates an approval notification for the team leader.
- Team leader approves: the system syncs the file to replicas (increment replica fileCount/usedStorage), status → `synced`. Approval also updates notification statuses.
- Rejection: on leader reject, the primary node is reverted (usedStorage/fileCount adjusted) and file is deleted (or restoration is done for edits based on `oldFileContent`). Notifications updated accordingly.

For edits:
- Edit stores `oldFileContent` and sets `changeType = "edit"`. Member must confirm; leader approves to sync.

For deletions:
- Member requests deletion, file is marked `pending_delete`. Leader approves to remove (or rejects to keep).

## Notifications
Notifications carry structured metadata (relatedFile, team, changeType). The notifications list is primarily informational and used to mark items as read; actual approve/reject side-effects occur from the Files page endpoints to avoid duplicate actions.

## How to run (Development)
1. Clone the repository and open it.
2. Install dependencies:

```powershell
npm install
```

3. Create a `.env` file in the project root with the following keys (example):

```
MONGO_URI=mongodb://localhost:27017/your-db
SESSION_SECRET=some-secret
PORT=3000
```

4. Start the server (recommended with nodemon for development):

```powershell
npx nodemon server.js
# or
node server.js
```

5. Visit `http://localhost:3000` and register/login.

## Environment Variables
- `MONGO_URI` — MongoDB connection string
- `SESSION_SECRET` — session secret for express-session
- `PORT` — port to run the server (default 3000)

## Common Manual Test Flow
1. Register two users (one will be leader). Log in as the leader.
2. Create a team: provide team name, leader name (auto-assigns primary node and optional backups).
3. Add a team member using the team view or the Change Team page.
4. As a member, upload or create a file, choosing the primary node. File status becomes `pending_confirmation`.
5. The member confirms the change (Confirm Change). File status becomes `pending_approval`.
6. Leader navigates to Files page and approves the change → file status becomes `synced` and replicas are updated.
7. Member edits a synced file: the edit stores `oldFileContent`, sets status → `pending_confirmation` then `pending_approval` after confirm; leader approves to sync edits.
8. Member requests delete: file becomes `pending_delete`. Leader can approve to delete or reject to restore.
9. Use Notifications page to view messages and mark them as read (approvals should be done from Files page).

## Notable Files
- `server.js` — app entrypoint and middleware setup
- `controllers/*` — business logic
- `models/*` — Mongoose models
- `routes/*` — route bindings
- `views/*` — EJS templates

## Troubleshooting
- If you see Mongoose ValidationError about enums (e.g. `changeType`), check `models/notifications.js` and `models/File.js` for enum values used by the controllers. The code expects `changeType` to be one of `create`, `edit`, `delete`.
- If nodemon restarts repeatedly, check for file saves or watchers modifying files. Also review stack traces for underlying application errors.
- If large files are needed or binary files are desired, the current in-memory Multer setup and `fileContent` text storage are insufficient — migrate to a file storage (filesystem, S3) and store references in the DB.

## Security & Notes
- Passwords should be securely hashed (bcrypt). Verify that registration code hashes passwords.
- Session handling uses `express-session`. Make sure `SESSION_SECRET` is set and production session store is used in production (not in-memory).
- This project is a simulator and intentionally uses simplified models (e.g., `fileContent` stored in DB) for demonstration.

## Next steps / TODOs
- Add tests (unit + integration) for the approval workflow.
- Implement binary file storage and streaming downloads.
- Add Socket.io or similar for real-time notifications.
- Improve UI/UX (modals for confirmations, inline notification badges).
- Add pagination and search/filter for files and notifications.

---

If you want, I can also:
- Add a short example of each HTTP endpoint and expected JSON (for API use).
- Add a small README section for deploying to production.

Enjoy working with the simulator!