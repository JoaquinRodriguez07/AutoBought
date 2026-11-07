"""Tests del script que crea los usuarios de prueba."""

from app.core.security import verify_password
from app.crud import user as crud_user
from app.models.order import Order
from app.models.part import Part
from app.models.payment import PaymentStatus
from app.models.employee import Employee
from scripts.seed_demo_users import USUARIOS, VENDEDORES, create_user, create_seller


def _parts(db_session):
    for i, categoria in enumerate(["Filtros", "Frenos"]):
        db_session.add(Part(part_code=f"DEMO-{i}", name=categoria, manufacturer="Bosch", category=categoria, price=1000, stock=10))
    db_session.commit()


def test_los_usuarios_de_prueba_cumplen_las_validaciones_y_se_crean_completos(db_session):
    # Si una regla cambia y un dato de prueba deja de ser válido, esto falla.
    _parts(db_session)

    for data in USUARIOS:
        create_user(db_session, data)

    for data in USUARIOS:
        customer = crud_user.get_user_by_email(db_session, data["cuenta"]["email"])
        assert verify_password(data["cuenta"]["password"], customer.password)
        assert len(customer.shipping_addresses) == len(data["direcciones"])
    # La compra de ejemplo queda pagada.
    purchase = db_session.query(Order).one()
    assert purchase.payment.status == PaymentStatus.APPROVED


def test_correr_el_script_dos_veces_no_duplica_nada(db_session):
    for data in USUARIOS:
        create_user(db_session, data)

    messages = [create_user(db_session, data) for data in USUARIOS]

    assert all("ya existe" in msg for msg in messages)


def test_el_vendedor_de_prueba_se_crea_como_empleado_y_puede_iniciar_sesion(client, db_session):
    for data in VENDEDORES:
        create_seller(db_session, data)

    seller = crud_user.get_user_by_email(db_session, "vendedor@autobought.com")
    assert isinstance(seller, Employee)
    assert seller.user_type == "employee"
    assert seller.name == "Vendedor AutoBought"
    assert verify_password("Ventas2026x", seller.password)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "vendedor@autobought.com", "password": "Ventas2026x"},
    )
    token = response.json()["access_token"]
    ping = client.get("/api/v1/analytics/ping", headers={"Authorization": f"Bearer {token}"})
    assert ping.status_code == 200


def test_correr_el_script_dos_veces_no_duplica_al_vendedor(db_session):
    create_seller(db_session, VENDEDORES[0])

    msg = create_seller(db_session, VENDEDORES[0])

    assert "ya existe" in msg
    assert db_session.query(Employee).count() == 1
