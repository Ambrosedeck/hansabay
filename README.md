# PackStream

A simple, password-protected streaming site with three dynamic content packs
(**Starter**, **Booster**, **Premium**) and an admin panel.

```
Admin Panel → Pack → Category / Folder → Video / Link
```

## Quick start

```bash
npm install
cp .env.example .env      # edit passwords + SESSION_SECRET
npm start                 # http://localhost:3000
```

- Public site: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`

Default credentials (first run only, taken from `.env` / built-in defaults):

| What            | Default        |
| --------------- | -------------- |
| Admin password  | `admin123`     |
| Starter pack    | `starter123`   |
| Booster pack    | `booster123`   |
| Premium pack    | `premium123`   |

Change all of them from the admin panel after first login.

Requires **Node.js 22.13+** (uses the built-in SQLite module, no native builds).

## What the admin can do

- Edit each pack's name, description, price, currency and password.
- Create / rename / delete / reorder categories (folders) and move them between packs.
- Add **videos** (upload a file or use an external URL – direct `.mp4`, YouTube, Vimeo)
  and **links** (any URL), give them a title, and place them in any category.
- Reorder videos and links inside a category, move them between categories/packs.
- Change the admin password.

Every change is live on the public site immediately.

## Storage

Uploaded video files go through a small storage abstraction in `src/storage/`:

| `STORAGE_DRIVER` | Where files live                                   |
| ---------------- | -------------------------------------------------- |
| `local` (default)| `UPLOAD_DIR` on the server, streamed with Range support |
| `s3`             | Any S3-compatible bucket (AWS S3, R2, MinIO, Spaces) served through short-lived presigned URLs |

To use S3:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
# then set STORAGE_DRIVER=s3 and the S3_* variables in .env
```

Each item records which driver stored it, so you can switch drivers later and
older videos continue to play. To add another backend, drop a file in
`src/storage/` implementing `save / delete / serve` and register it in
`src/storage/index.js`.

Uploaded files are never served directly — `/media/:id` checks that the viewer
has unlocked the pack (or is admin) before streaming/redirecting.

## Project layout

```
server.js               Express app
src/config.js           env configuration
src/db.js               SQLite schema + first-run seed
src/queries.js          shared DB queries
src/auth.js             session helpers (admin + unlocked packs)
src/passwords.js        scrypt hashing
src/routes/public.js    /api/packs …   (public site)
src/routes/admin.js     /api/admin/…   (admin panel)
src/routes/media.js     /media/:id     (protected video streaming)
src/storage/            local + s3 drivers
public/                 static front-end (index.html, admin.html, css, js)
data/                   SQLite DB + local uploads (git-ignored)
```

## Deploying

Set `NODE_ENV=production`, a strong `SESSION_SECRET`, and put the app behind
HTTPS (cookies are marked `secure` in production). Make sure `data/` (or your
configured `DATABASE_PATH` / `UPLOAD_DIR`) is on persistent storage, or use the
`s3` driver for uploads.
