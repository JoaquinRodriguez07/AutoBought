from sqlalchemy import Column, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class Favorite(Base):
    __tablename__ = "favorite"
    __table_args__ = (UniqueConstraint("client_id", "part_id"),)

    favorite_id = Column(Integer, primary_key=True)
    client_id = Column(Integer, ForeignKey("client.user_id"), nullable=False)
    part_id = Column(Integer, ForeignKey("part.id"), nullable=False)

    client = relationship("Client", back_populates="favorites")
    part = relationship("Part", back_populates="favorites")
