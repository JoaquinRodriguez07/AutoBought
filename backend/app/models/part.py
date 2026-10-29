from sqlalchemy import JSON, Column, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base

class Part(Base):
    __tablename__ = "part"

    id = Column(Integer, primary_key = True)
    part_code = Column(String(50), nullable = False)
    name = Column(String(120), nullable = False)
    manufacturer = Column(String(60), nullable = False)
    category = Column(String(60), nullable = False)
    color = Column(String(40), nullable = True)
    price = Column(Integer, nullable = False)
    stock = Column(Integer, nullable = False, default = 0)
    description = Column(Text, nullable = True)
    # Pares [nombre, valor], en el orden en que se muestran. En Postgres va
    # JSONB: el JSON común no se puede comparar y el catálogo hace
    # SELECT DISTINCT sobre los repuestos.
    specifications = Column(JSON().with_variant(JSONB(), "postgresql"), nullable = True)
    warranty_months = Column(Integer, nullable = True)
    # "fabricante" o "vendedor": quién cubre la garantía.
    warranty_provider = Column(String(20), nullable = True)

    compatibilities = relationship("Compatibility", back_populates = "part")
    cart_items = relationship("CartItem", back_populates="part")
    order_items = relationship("OrderItem", back_populates="part")
    favorites = relationship("Favorite", back_populates="part", cascade="all, delete-orphan")