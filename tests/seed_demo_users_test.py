from app.core.security import verify_password
from app.crud import user as crud_user
from app.models.order import Order
from app.models.part import Part
from scripts.seed_demo_users import USUARIOS, crear_usuario


def _repuestos(db_session):
    for i, categoria in enumerate(["Filtros", "Frenos"]):
        db_session.add(Part(part_code=f"DEMO-{i}", name=categoria, category=categoria, price=1000, stock=10))
    db_session.commit()


def test_los_usuarios_de_prueba_cumplen_las_validaciones_y_se_crean_completos(db_session):
    # Si una regla cambia y un dato de prueba deja de ser válido, esto falla.
    _repuestos(db_session)

    for datos in USUARIOS:
        crear_usuario(db_session, datos)

    for datos in USUARIOS:
        cliente = crud_user.get_user_by_email(db_session, datos["cuenta"]["email"])
        assert verify_password(datos["cuenta"]["password"], cliente.password)
        assert len(cliente.shipping_addresses) == len(datos["direcciones"])
        vigentes = [m for m in cliente.payment_methods if not m.is_expired]
        assert len(vigentes) == len(datos["tarjetas"])
        assert sum(m.is_primary for m in cliente.payment_methods) == 1
        assert not any(m.is_primary and m.is_expired for m in cliente.payment_methods)
    assert db_session.query(Order).count() == 1


def test_correr_el_script_dos_veces_no_duplica_nada(db_session):
    for datos in USUARIOS:
        crear_usuario(db_session, datos)

    mensajes = [crear_usuario(db_session, datos) for datos in USUARIOS]

    assert all("ya existe" in mensaje for mensaje in mensajes)
