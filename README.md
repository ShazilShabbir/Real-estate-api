# Real Estate App — Backend

Minimal backend for a real-estate listing application.

## Description

This repository contains the Express.js backend for a real-estate app. It provides authentication, property CRUD, image uploads (Cloudinary), and basic API responses.

## Tech Stack

- Node.js
- Express
- MongoDB / Mongoose
- Passport / JWT (auth)
- Multer (file uploads)
- Cloudinary (image hosting)

## Repo Structure

- `src/` — application source code
  - `controllers/` — route handlers
  - `models/` — Mongoose models (`User`, `Property`)
  - `routes/` — Express routes (`authRoutes.js`, `propertyRoutes.js`)
  - `middleware/` — auth and upload middleware
  - `config/` — DB and passport configuration
  - `utils/` — helpers and API response classes
- `public/` — static files and temporary uploads
- `server.js` — app entrypoint

## Prerequisites

- Node 16+ (or recommended for the project)
- MongoDB instance (local or hosted)
- Cloudinary account (if uploading images)

## Environment Variables

Create a `.env` file in the project root with at least:

```
MONGO_URI=your_mongo_connection_string
JWT_SECRET=your_jwt_secret
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
PORT=5000
```

Adjust keys based on your existing `config` files.

## Install & Run (development)

Install dependencies:

```bash
npm install
```

Run in development (example):

```bash
npm run dev
# or
npm start
```

(Use the script names defined in `package.json`.)

## API Overview

Base URL: `/api` (adjust if different in `server.js`)

- Auth
  - `POST /api/auth/register` — register a new user
  - `POST /api/auth/login` — login and receive JWT
- Properties
  - `GET /api/properties` — list properties
  - `GET /api/properties/:id` — get a property
  - `POST /api/properties` — create a property (protected)
  - `PUT /api/properties/:id` — update a property (protected)
  - `DELETE /api/properties/:id` — delete a property (protected)

Refer to `src/routes` and `src/controllers` for exact routes and payloads.

## File Uploads

Image uploads use Cloudinary configured in `src/utils/cloudinary.js`. Ensure `CLOUDINARY_URL` is set.

## Tests

If there are tests configured, run:

```bash
npm test
```

## Contributing

- Fork the repo
- Create a feature branch
- Open a PR with a clear description

## Author

Created for the Real Estate App project.

---

