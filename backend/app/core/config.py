"""Configuración del backend: lee las variables de entorno (ver .env.example)."""

import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

SECRET_KEY = os.getenv("SECRET_KEY")
# Sin clave, los tokens no se pueden firmar y los enlaces de los mails
# quedarían firmados con "None": mejor que el backend no arranque.
if not SECRET_KEY:
    raise RuntimeError("Falta SECRET_KEY (ver .env.example).")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Configurar antes de ofrecer retiro en producción: se utiliza en checkout y mails.
LOCAL_ADDRESS = os.getenv("LOCAL_ADDRESS", "").strip()
LOCAL_HOURS = os.getenv("LOCAL_HOURS", "").strip()

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
# forzar con SEND_MAILS_IN_BACKGROUND=1 o 0.
SEND_MAILS_IN_BACKGROUND = os.getenv(
    "MAILS_EN_SEGUNDO_PLANO", "0" if os.getenv("VERCEL") else "1"
) == "1"

# Inteligencia artificial (Gemini). Sin clave, las funcionalidades con IA
# responden "no disponible" y la aplicación sigue funcionando.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Solo para probar en local contra un servidor falso, sin gastar.
GEMINI_API_URL = os.getenv("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta/interactions")
AI_TIMEOUT_SECONDS = float(os.getenv("IA_TIMEOUT_SEGUNDOS", "30"))
# Consultas a la IA por usuario en las últimas 24 horas (controla el costo).
AI_DAILY_LIMIT = int(os.getenv("IA_LIMITE_DIARIO", "20"))
# Resumen del dashboard con IA (HU 6.3): cuántos repuestos y categorías se
# le pasan a la IA en cada lista. Más elementos, más tokens.
AI_SUMMARY_BEST_SELLERS = int(os.getenv("IA_RESUMEN_MAS_VENDIDOS", "3"))
AI_SUMMARY_AT_RISK = int(os.getenv("IA_RESUMEN_EN_RIESGO", "5"))
AI_SUMMARY_CATEGORIES = int(os.getenv("IA_RESUMEN_CATEGORIAS", "3"))
# Días de resúmenes que se guardan y se muestran en el historial. Los más
# viejos los borra la tarea diaria.
AI_SUMMARY_HISTORY_DAYS = int(os.getenv("IA_RESUMEN_DIAS_HISTORIAL", "7"))

# Mercado Pago. Con la cuenta de prueba, el token es el "Access Token" de
# las credenciales de prueba. Sin token, comprar responde "pago no disponible".
MERCADOPAGO_ACCESS_TOKEN = os.getenv("MERCADOPAGO_ACCESS_TOKEN", "")
# Clave secreta de los webhooks (panel de Mercado Pago > Webhooks). Si está,
# se rechazan los avisos que no vienen firmados por Mercado Pago.
MERCADOPAGO_WEBHOOK_SECRET = os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "")
MERCADOPAGO_API_URL = os.getenv("MERCADOPAGO_API_URL", "https://api.mercadopago.com").rstrip("/")
MERCADOPAGO_TIMEOUT_SECONDS = float(os.getenv("MERCADOPAGO_TIMEOUT_SEGUNDOS", "15"))
# Dirección pública del backend, a la que Mercado Pago manda los avisos de
# pago. Sin ella (en local), no hay avisos y el pedido queda pendiente.
BACKEND_URL = os.getenv("BACKEND_URL", "").rstrip("/")
# Cuánto tiempo tiene el cliente para pagar un pedido. Mientras tanto el
# stock queda reservado; pasado el plazo, el pedido se cancela y el stock vuelve.
MINUTES_TO_PAY = int(os.getenv("MINUTOS_PARA_PAGAR", "15"))

# Orígenes que pueden llamar a la API desde el navegador, separados por coma.
CORS_ORIGINS = [
    origen.strip().rstrip("/")
    for origen in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,"
        "http://127.0.0.1:5174,https://autobought.vercel.app",
    ).split(",")
    if origen.strip()
]

# Moneda en la que están los precios de la tienda (la que se cobra en Mercado Pago).
CURRENCY = os.getenv("MONEDA", "UYU")

# Cuánto duran los enlaces que van por mail.
EMAIL_VERIFICATION_LINK_MINUTES = int(os.getenv("VIGENCIA_VERIFICACION_MINUTOS", str(24 * 60)))
PASSWORD_RESET_LINK_MINUTES = int(os.getenv("VIGENCIA_RECUPERACION_MINUTOS", "30"))

# Bloqueo por intentos fallidos: tantos fallos dentro de la ventana bloquean
# el correo durante esa misma ventana.
MAX_FAILED_ATTEMPTS_SETTING = int(os.getenv("MAX_INTENTOS_FALLIDOS", "5"))
ATTEMPT_WINDOW_MINUTES = int(os.getenv("VENTANA_INTENTOS_MINUTOS", "15"))

# Vercel Cron lo manda para llamar a /tareas/diarias. Vacío: nadie puede llamarlo.
CRON_SECRET = os.getenv("CRON_SECRET", "")
