from sqlalchemy import Boolean, Column, Integer, String, false

from app.db.base import Base


class User(Base):
    __tablename__ = "user"

    user_id = Column(Integer, primary_key=True)
    user_type = Column(String(20), nullable=False, default="user")
    username = Column(String(60), nullable=False, unique=True)
    password = Column(String(255), nullable=False)
    name = Column(String(120), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    # Sin verificar se puede navegar, pero no confirmar compras.
    email_verified = Column(Boolean, nullable=False, default=False, server_default=false())

    __mapper_args__ = {
        "polymorphic_on": user_type,
        "polymorphic_identity": "user",
    }
