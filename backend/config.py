import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "").strip()
if not MONGO_URI:
    raise RuntimeError("MONGO_URI is missing in .env")

MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "ngo_db")

API_BASE_URL = os.getenv("API_BASE_URL", "").strip().rstrip("/")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "").strip().rstrip("/")
FALLBACK_API_BASE_URL = "http://127.0.0.1:5000"
FALLBACK_FRONTEND_BASE_URL = "http://127.0.0.1:8000"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip() or "llama-3.1-8b-instant"

PERSISTENT_DATA_DIR = os.getenv("PERSISTENT_DATA_DIR", "").strip()
_configured_data_root = Path(PERSISTENT_DATA_DIR).expanduser() if PERSISTENT_DATA_DIR else BASE_DIR
try:
    _configured_data_root.mkdir(parents=True, exist_ok=True)
    DATA_ROOT = _configured_data_root
except OSError:
    DATA_ROOT = BASE_DIR
    DATA_ROOT.mkdir(parents=True, exist_ok=True)

QR_DIR = DATA_ROOT / "qr"
QR_DIR.mkdir(parents=True, exist_ok=True)

PRODUCT_IMAGE_DIR = DATA_ROOT / "product_images"
PRODUCT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
