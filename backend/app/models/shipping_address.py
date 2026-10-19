from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, false, text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ShippingAddress(Base):
    __tablename__ = "shipping_address"

    shipping_address_id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.user_id"), nullable=False)
    personal_name = Column(String(50), nullable=False)
    street = Column(String(50), nullable=False)
    city = Column(String(50), nullable=False)
    number = Column(String(10), nullable=False)
    apartment = Column(String(10))
    department = Column(String(50), nullable=False)
    postal_code = Column(String(10))
    is_primary = Column(Boolean, nullable=False, default=False, server_default=false())

    # Como mucho una fila principal por cliente (también ante requests concurrentes).
    __table_args__ = (
        Index(
            "uq_shipping_address_one_primary",
            "client_id",
            unique=True,
            postgresql_where=text("is_primary"),
            sqlite_where=text("is_primary"),
        ),
    )

    client = relationship("Client", back_populates="shipping_addresses")
