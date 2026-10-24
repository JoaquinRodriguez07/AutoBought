import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = os.getenv("SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Mails. En local apuntan a Mailpit (docker compose); en producción, al SMTP
# de Gmail con una contraseña de aplicación (ver .env.example).
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "AutoBought <no-reply@autobought.local>")

# Los enlaces de los mails llevan a esta dirección del frontend.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

# Inteligencia artificial (Gemini). Sin clave, las funcionalidades con IA
# responden "no disponible" y la aplicación sigue funcionando.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Solo para probar en local contra un servidor falso, sin gastar.
GEMINI_API_URL = os.getenv("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/interactions")
IA_TIMEOUT_SEGUNDOS = float(os.getenv("IA_TIMEOUT_SEGUNDOS", "30"))
# Consultas a la IA por usuario en las últimas 24 horas (controla el costo).
IA_LIMITE_DIARIO = int(os.getenv("IA_LIMITE_DIARIO", "20"))
