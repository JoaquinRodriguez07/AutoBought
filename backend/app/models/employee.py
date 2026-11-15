"""ModelT del vendedor (un usuario del portal de la tienda)."""

from sqlalchemy import Boolean, Column, ForeignKey, Integer, false, true

from app.models.user import User


class Employee(User):
    __tablename__ = "employee"

    user_id = Column(Integer, ForeignKey("user.user_id"), primary_key=True)
    # Un administrador además da de alta y de baja vendedores (sección
    # "Equipo" del portal).
    is_admin = Column(Boolean, nullable=False, default=False, server_default=false())
    # Dado de baja: no se borra (puede tener cosas a su nombre), pero no
    # puede entrar ni usar una sesión que tuviera abierta.
    active = Column(Boolean, nullable=False, default=True, server_default=true())

    __mapper_args__ = {"polymorphic_identity": "employee"}
