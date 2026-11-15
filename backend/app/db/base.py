"""La base declarativa de SQLAlchemy para los modelos."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """La clase de la que heredan todos los modelos."""