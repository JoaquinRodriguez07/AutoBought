from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import DATABASE_URL

# pool_pre_ping: antes de usar una conexión guardada, se prueba con un
# SELECT 1 y, si la base la cerró (Oracle corta las inactivas, o alguien
# las terminó), se abre otra en vez de fallar con "server closed the
# connection unexpectedly". pool_recycle: además se descartan las que
# tienen más de 5 minutos, por si un corte no se detecta.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)