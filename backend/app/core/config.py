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

# Los mails salen en segundo plano, después de responder. En Vercel no: la
# función se congela al responder y la tarea puede no correr nunca, así que
# allá se mandan antes de responder (Vercel define VERCEL=1). Se puede
# forzar con MAILS_EN_SEGUNDO_PLANO=1 o 0.
MAILS_EN_SEGUNDO_PLANO = os.getenv(
    "MAILS_EN_SEGUNDO_PLANO", "0" if os.getenv("VERCEL") else "1"
) == "1"

# Inteligencia artificial (Gemini). Sin clave, las funcionalidades con IA
# responden "no disponible" y la aplicación sigue funcionando.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Solo para probar en local contra un servidor falso, sin gastar.
GEMINI_API_URL = os.getenv("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/interactions")
IA_TIMEOUT_SEGUNDOS = float(os.getenv("IA_TIMEOUT_SEGUNDOS", "30"))
# Consultas a la IA por usuario en las últimas 24 horas (controla el costo).
IA_LIMITE_DIARIO = int(os.getenv("IA_LIMITE_DIARIO", "20"))

# Mercado Pago. Con la cuenta de prueba, el token es el "Access Token" de
# las credenciales de prueba. Sin token, comprar responde "pago no disponible".
MERCADOPAGO_ACCESS_TOKEN = os.getenv("MERCADOPAGO_ACCESS_TOKEN", "")
# Clave secreta de los webhooks (panel de Mercado Pago > Webhooks). Si está,
# se rechazan los avisos que no vienen firmados por Mercado Pago.
MERCADOPAGO_WEBHOOK_SECRET = os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "")
MERCADOPAGO_API_URL = os.getenv("MERCADOPAGO_API_URL", "https://api.mercadopago.com").rstrip("/")
MERCADOPAGO_TIMEOUT_SEGUNDOS = float(os.getenv("MERCADOPAGO_TIMEOUT_SEGUNDOS", "15"))
# Dirección pública del backend, a la que Mercado Pago manda los avisos de
# pago. Sin ella (en local), no hay avisos y el pedido queda pendiente.
BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")

# Vercel Cron lo manda para llamar a /tareas/diarias. Vacío: nadie puede llamarlo.
CRON_SECRET = os.getenv("CRON_SECRET", "")
