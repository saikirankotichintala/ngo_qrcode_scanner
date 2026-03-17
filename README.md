🌱 NGO QR Code Scanner

A full-stack product tracking system designed for NGOs to bring transparency, storytelling, and impact visibility to handmade products.
Each bag is connected to the people who made it through a simple QR scan.

✨ Key Highlights

🔗 QR-based storytelling – Scan a product to see who made it

👩‍🏭 Employee identity system with auto-generated IDs

🤖 AI-powered story enhancement using Groq

📦 Product lifecycle tracking

📱 Offline-first support with sync capability

# NGO QR Code Scanner

A full-stack product-tracking system built for NGOs to increase transparency and impact storytelling. Each product (bag) gets a unique QR code that links to the maker(s), materials, images and an AI-enhanced story.

## Highlights

- QR-driven storytelling: scan a product to immediately see its journey and maker profile.
- Employee identity system (auto-generated worker_id) and role-based access (admin / volunteer).
- AI-assisted story generation and enhancements (Groq / LLaMA model integration).
- Product lifecycle management with offline-first frontend sync.

## Tech stack

- Backend: Flask, PyMongo, python-dotenv
- Frontend: React + Vite
- Database: MongoDB
- AI: Groq (LLaMA 3.x)

## Repository layout

```
ngo_qrcode_scanner/
├─ backend/         # Flask API and server-side code
├─ frontend/        # React app (Vite)
└─ README.md
```

## Quickstart (macOS)

These steps get both backend and frontend running locally.

Prerequisites:

- Python 3.10+
- Node.js 18+
- MongoDB (local or Atlas)

1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create a `.env` file in `backend/` with the variables below (replace values):

```
MONGO_URI=your_mongodb_connection_string
MONGO_DB_NAME=ngo_db
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant
API_BASE_URL=http://127.0.0.1:5000
FRONTEND_BASE_URL=http://127.0.0.1:5173
```

Run the backend server:

```bash
python app.py
```

2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the app: http://127.0.0.1:5173/#/login

## API summary

Note: Admin-only routes expect header `X-User-Role: admin`.

- Employee
	- POST /create-employee
	- GET /employees
	- PUT /employee/<id> (admin)
	- DELETE /employee/<id> (admin)

- Product / Bag
	- POST /create-bag
	- GET /all-bags
	- GET /bag/<id>
	- PUT /bag/<id> (admin)
	- DELETE /bag/<id> (admin)

- AI
	- POST /ai/story  — generate or enhance a story for an employee/product

- Assets
	- GET /qr/<filename>
	- GET /product-image/<filename>

## Demo credentials

Use these for local dev only (do not use in production):

- Admin: admin / 1234
- Volunteer: volunteer / 1234

## Environment variables (backend)

- MONGO_URI — MongoDB connection string
- MONGO_DB_NAME — database name
- GROQ_API_KEY — API key for Groq AI
- GROQ_MODEL — model name to use
- API_BASE_URL — backend URL
- FRONTEND_BASE_URL — frontend URL used in CORS or links

## Development notes

- Role-based protection is implemented using the `X-User-Role` header in routes. Replace with proper auth (JWT/OAuth) before production.
- Image/QR uploads are served from backend asset endpoints. Ensure write permissions in the upload directory.

## Troubleshooting

- 'vite' not recognized: run `npm install` in `frontend/`.
- Groq errors (e.g. 1010): check network, VPN/proxy or expired API key.
- Mongo connection errors: verify `MONGO_URI` and that MongoDB is reachable.

## Security & production checklist

- Never commit `.env` or secrets to git.
- Replace demo credentials and enable proper authentication.
- Use HTTPS and secure cookies in production.
- Rotate API keys if exposed.

## Roadmap / Future enhancements

- Payment integration and direct purchases
- Analytics dashboard (impact tracking)
- Multi-language support for stories
- Mobile app wrapper / PWA improvements

## Contributing

Contributions are welcome. Open an issue or submit a PR with a clear description of the change. For larger items, please open an issue first so we can discuss design and scope.

## License

Specify your license here (e.g. MIT) or add a LICENSE file.

---

If you'd like, I can add:

- Badges (CI, license, coverage)
- Screenshots or a short demo GIF
- A diagram showing the architecture and data flow

If you want me to make any of those additions now, tell me which and I'll add them.
