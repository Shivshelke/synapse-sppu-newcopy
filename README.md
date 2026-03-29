# 🧠 SYNAPSE SPPU PYQ — Setup Guide

A complete PYQ (Previous Year Questions) portal for SPPU Engineering students.

---

## 📁 Project Structure

```
synapse-sppu/
├── server.js               ← Main Express server
├── package.json
├── .env.example            ← Copy to .env
├── data/
│   ├── config.json         ← Years, branches, subjects
│   └── files.json          ← File metadata (auto-generated)
├── uploads/                ← Uploaded PDFs (auto-created)
│   └── year/branch/subject/
├── middleware/
│   └── auth.js             ← Admin auth guard
├── routes/
│   ├── auth.js             ← Login / logout / change-password
│   ├── api.js              ← Public browsing API
│   └── admin.js            ← Protected upload/delete API
└── public/
    ├── index.html          ← Public portal homepage
    ├── login.html          ← Admin login page
    ├── dashboard.html      ← Admin dashboard
    ├── css/
    │   ├── style.css       ← Public styles
    │   └── dashboard.css   ← Dashboard styles
    └── js/
        ├── main.js         ← Public portal JS
        └── dashboard.js    ← Dashboard JS
```

---

## 🚀 Local Setup (Step by Step)

### 1. Install Node.js
Download from https://nodejs.org (v18 or higher recommended)

### 2. Clone / Download the project
```bash
cd synapse-sppu
```

### 3. Install dependencies
```bash
npm install
```

### 4. Configure environment (optional)
```bash
cp .env.example .env
# Edit .env and set a strong SESSION_SECRET
```

### 5. Start the server
```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

### 6. Open in browser
- **Public portal:** http://localhost:3000
- **Admin login:** http://localhost:3000/login.html

---

## 🔐 Default Admin Credentials

| Field    | Value        |
|----------|--------------|
| Username | `admin`      |
| Password | `password123`|

> ⚠️ **Change the password immediately after first login!**

---

## 🔑 How to Change Admin Password

**Option A — Through the Dashboard (Recommended)**
1. Login at `/login.html`
2. Go to **Change Password** in the sidebar
3. Enter current password and new password
4. Click **Update Password**

**Option B — Direct hash update**
1. Install bcryptjs: `npm install -g bcryptjs`
2. Generate a new hash: `node -e "const b=require('bcryptjs'); b.hash('yourNewPassword',10).then(console.log)"`
3. Open `data/config.json`
4. Replace the `password` field with the new hash

---

## ➕ How to Add New Categories

### Add a subject (via Dashboard)
1. Login → **Categories** panel
2. Select Year → Enter subject name → Click **Add Subject**

### Add a branch (via Dashboard)
1. Login → **Categories** panel
2. Select Year → Enter branch name → Click **Add Branch**

### Add a subject manually (via config.json)
Open `data/config.json` and add to the `subjects` array:
```json
"third": {
  "subjects": [
    "Data Structures",
    "Your New Subject Here"
  ]
}
```

---

## 📤 How to Upload Papers

1. Login at `/login.html`
2. Go to **Upload Paper** panel
3. Select: Year → Branch → Subject
4. Drag & drop or click to select a PDF (max 20MB)
5. Click **Upload Paper**

Files are stored at:
```
uploads/{year}/{branch}/{subject}/{filename}_{timestamp}.pdf
```

---

## 🌐 Deployment Guide

### Option A: Render (Free tier available)

1. Push code to GitHub (make sure `uploads/` and `data/files.json` are in `.gitignore` or handled separately)
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Environment:** Node
5. Add environment variables:
   - `SESSION_SECRET` = (a long random string)
   - `PORT` = 3000
6. Deploy!

> **Note:** Render's free tier resets the filesystem on deploy. For persistent file storage, use a cloud storage service like Cloudinary or AWS S3 (requires code modification).

---

### Option B: Railway

1. Push to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Add environment variables in Railway dashboard
4. Railway auto-detects Node.js and deploys

---

### Option C: VPS / Self-hosted (Best for file persistence)

```bash
# Install PM2
npm install -g pm2

# Start app
pm2 start server.js --name synapse

# Auto-start on reboot
pm2 startup
pm2 save
```

---

## 🔒 Security Notes

- Admin routes (`/admin/*`) require session auth — direct URL access is blocked
- File uploads are restricted to PDF only, max 20MB
- Sessions expire after 24 hours
- In production, set `secure: true` on cookies and use HTTPS

---

## 🛠️ How to Modify

### Change file size limit
In `routes/admin.js`, find:
```js
limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
```
Change `20` to your desired MB limit.

### Change session duration
In `server.js`, find:
```js
maxAge: 24 * 60 * 60 * 1000 // 24 hours
```

### Add a new year
In `data/config.json`, add a new key under `years`:
```json
"fifth": {
  "label": "5th Year",
  "branches": ["Computer Engineering"],
  "subjects": []
}
```
Then update the frontend selects in `dashboard.html` and `index.html`.

---

## 📞 Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Make sure Node.js ≥ 16 is installed |
| Can't login | Check `data/config.json` has correct hash; default is `password123` |
| File not uploading | Check `uploads/` folder exists and is writable |
| Port in use | Change `PORT` in `.env` |
| Session not persisting | Set a strong `SESSION_SECRET` in `.env` |
