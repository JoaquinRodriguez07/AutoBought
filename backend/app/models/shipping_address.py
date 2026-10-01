from sqlalchemy import Column, ForeignKey, Integer, String
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

    client = relationship("Client", back_populates="shipping_addresses")
