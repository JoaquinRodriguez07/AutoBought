from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, false, text
from sqlalchemy.orm import relationship

from app.db.base import Base


class PaymentMethod(Base):
    __tablename__ = "payment_method"

    payment_method_id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.user_id"), nullable=False)
    method = Column(String(60), nullable=False)
    card_type = Column(String(30), nullable=False)
    holder = Column(String(120), nullable=False)
    last_four = Column(String(4), nullable=False)
    expiry = Column(String(5), nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False, server_default=false())

    # Como mucho una fila principal por cliente (también ante requests concurrentes).
    __table_args__ = (
        Index(
            "uq_payment_method_one_primary",
            "client_id",
            unique=True,
            postgresql_where=text("is_primary"),
            sqlite_where=text("is_primary"),
        ),
    )

    client = relationship("Client", back_populates="payment_methods")
