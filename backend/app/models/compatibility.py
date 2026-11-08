"""ModelT de la compatibilidad entre un repuesto y un auto, con el rango de años."""

from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base

class Compatibility(Base):
    __tablename__ = "compatibility"

    part_id = Column(Integer, ForeignKey("part.id"), primary_key = True)
    car_model_id = Column(Integer, ForeignKey("car_model.id"), primary_key = True)
    year_from = Column(Integer, nullable = False)
    year_to = Column(Integer, nullable = False)

    part = relationship("Part", back_populates = "compatibilities")
    car_model = relationship("CarModel")