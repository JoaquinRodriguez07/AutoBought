"""ModelT de un auto del catálogo (marca, modelo y motor)."""

from sqlalchemy import Column, Integer, String

from app.db.base import Base


class CarModel(Base):
    __tablename__ = "car_model"

    id = Column(Integer, primary_key = True)
    brand = Column(String(60), nullable = False)
    model = Column(String(60), nullable = False)
    engine_code = Column(String(60), nullable = True)