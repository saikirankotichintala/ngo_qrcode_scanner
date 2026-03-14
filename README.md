# NGO QR Code Scanner

A full-stack NGO product tracking system that links every handmade bag to employee stories through QR codes.

## Features

- Employee registration with auto-generated `worker_id` values.
- AI-assisted employee story generation and improvement via Groq.
- Product (bag) registration with:
  - Multiple employee selection.
  - Material tracking.
  - Product photo upload (local file or camera capture path in UI).
- Automatic QR code generation for each product.
- Bag details page that displays maker info, material, image, and stories.
- Admin product/employee management (edit and delete flows).
- Offline queue + sync for employee and product submissions in the frontend.
- Role-based frontend routes (`admin`, `volunteer`).

## Tech Stack

- Backend: Flask, PyMongo, python-dotenv, qrcode
- Frontend: React, React Router, Vite
- Database: MongoDB

## Project Structure

```text
ngo_qrcode_scanner/
|-- backend/
|   |-- app.py
|   |-- employee.py
|   |-- product.py
|   |-- bag.py
|   |-- gemini.py
|   |-- db.py
|   |-- config.py
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |-- package.json
|   `-- vite.config.js
`-- README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- MongoDB Atlas (or local MongoDB)

## Backend Setup

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
MONGO_URI=your_mongodb_connection_string
MONGO_DB_NAME=ngo_db

# Optional but recommended for AI story assistant
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant

# Optional, used for URL generation
API_BASE_URL=http://127.0.0.1:5000
FRONTEND_BASE_URL=http://127.0.0.1:5173
```

Run backend:

```powershell
python app.py
```

Backend default URL: `http://127.0.0.1:5000`

## Frontend Setup

```powershell
cd frontend
cmd /c npm install
cmd /c npm run dev
```

Frontend default URL: `http://127.0.0.1:5173/#/login`

Demo credentials:

- `admin / 1234`
- `volunteer / 1234`

## API Endpoints

- `GET /` - Backend health message.
- `POST /create-employee` - Create employee (`name`, `story`).
- `GET /employees` - List employees.
- `PUT /employee/<employee_id>` - Update employee (admin role required).
- `DELETE /employee/<employee_id>` - Delete employee (admin role required).
- `POST /ai/story` - Generate or improve employee story using Groq.
- `POST /create-bag` - Create bag/product and QR code.
- `GET /all-bags` - List all bags.
- `GET /bag/<bag_id>` - Get bag details.
- `PUT /bag/<bag_id>` - Update bag material/image (admin role required).
- `DELETE /bag/<bag_id>` - Delete bag, related QR, and image (admin role required).
- `GET /qr/<filename>` - Serve QR image.
- `GET /product-image/<filename>` - Serve uploaded product image.

Admin-only backend operations are enforced using the `X-User-Role: admin` request header.

## Validation Status

Current project checks completed:

- Backend Python files compile successfully.
- Frontend production build (`npm run build`) succeeds.

## Troubleshooting

- If you see `'vite' is not recognized`, run `cmd /c npm install` inside `frontend`.
- If PowerShell blocks npm scripts (`npm.ps1 cannot be loaded`), use `cmd /c npm ...`.
- If AI calls fail with `Groq request failed: error code: 1010`, avoid VPN/proxy and retry from a trusted network.
- If backend fails at startup with `MONGO_URI is missing in .env`, verify `backend/.env`.

## Security Notes

- Do not commit `backend/.env` or API keys.
- Replace demo credentials with real authentication before production.
- Rotate exposed API keys immediately if they were shared or pushed accidentally.

