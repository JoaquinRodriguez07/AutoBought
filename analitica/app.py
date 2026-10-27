"""Dashboard interno de AutoBought para vendedores.

Se corre con `streamlit run app.py`. Los datos se piden al backend en cada
interacción (sin caché): un cambio de stock o una venta nueva se ve con
tocar cualquier filtro o el botón «Actualizar datos».
"""

from datetime import datetime
from zoneinfo import ZoneInfo

import altair as alt
import streamlit as st

import api
import datos

# El mismo valor por defecto que STOCK_BAJO en el backend (analytics.py).
STOCK_BAJO_POR_DEFECTO = 5

# El contenedor corre en UTC: la hora de los datos se muestra en la de acá.
ZONA_HORARIA = ZoneInfo("America/Montevideo")

PERIODOS = {
    "Últimos 30 días": 30,
    "Últimos 90 días": 90,
    "Últimos 12 meses": 365,
    "Todas las ventas": None,
}

# Una sola serie: un solo color, el primero de la paleta de gráficos.
COLOR_BARRAS = "#2a78d6"
# Streamlit no le da color de tema al texto de Altair: un gris medio se lee
# sobre el fondo claro y sobre el oscuro.
COLOR_ETIQUETAS = "#8b8a85"

st.set_page_config(
    page_title="Dashboard · AutoBought",
    page_icon=":material/monitoring:",
    layout="wide",
)


def cerrar_sesion(aviso: str | None = None) -> None:
    st.session_state.pop("token", None)
    st.session_state.pop("email", None)
    if aviso:
        st.session_state["aviso"] = aviso


def pedir(funcion, *args):
    """Llama a la API y resuelve los errores comunes a todas las secciones."""
    try:
        return funcion(*args)
    except api.SesionVencida:
        cerrar_sesion("Tu sesión venció. Volvé a ingresar.")
    except api.SinPermiso:
        cerrar_sesion("Esta cuenta no tiene acceso al dashboard: es solo para vendedores.")
    except api.ApiError as error:
        st.error(f"No se pudieron cargar los datos. {error}")
        st.stop()
    st.rerun()


def pantalla_login() -> None:
    _, centro, _ = st.columns([1, 1.2, 1])
    with centro:
        st.caption("AUTOBOUGHT")
        st.title("Dashboard del vendedor")
        st.write("Ingresá con tu cuenta de vendedor para ver el stock y las ventas de la tienda.")

        if aviso := st.session_state.pop("aviso", None):
            st.warning(aviso)

        with st.form("login"):
            email = st.text_input("Correo electrónico")
            password = st.text_input("Contraseña", type="password")
            enviado = st.form_submit_button("Ingresar", type="primary", width="stretch")

        if not enviado:
            return
        if not email.strip() or not password:
            st.error("Completá el correo y la contraseña.")
            return

        try:
            token = api.login(email.strip(), password)
            # Un cliente también puede iniciar sesión: el backend es el que
            # decide si la cuenta es de vendedor.
            api.verificar_vendedor(token)
        except api.SinPermiso:
            st.error("Esta cuenta no tiene acceso al dashboard: es solo para vendedores.")
            return
        except (api.CredencialesInvalidas, api.SesionVencida, api.ApiError) as error:
            st.error(str(error))
            return

        st.session_state["token"] = token
        st.session_state["email"] = email.strip()
        st.rerun()


def barra_lateral() -> int:
    """Sesión y opciones generales. Devuelve el umbral de stock bajo."""
    with st.sidebar:
        st.caption("Sesión de vendedor")
        st.text(st.session_state["email"])
        if st.button("Cerrar sesión", icon=":material/logout:", width="stretch"):
            cerrar_sesion()
            st.rerun()

        st.divider()
        umbral = st.number_input(
            "Stock bajo: hasta cuántas unidades",
            min_value=0,
            max_value=1000,
            value=STOCK_BAJO_POR_DEFECTO,
            step=1,
            help="Un repuesto con esta cantidad o menos se marca como stock bajo.",
        )
        # Tocar el botón ya vuelve a correr la app, y con eso a pedir los datos.
        st.button("Actualizar datos", icon=":material/refresh:", width="stretch")
    return int(umbral)


def seccion_resumen(tabla_stock, umbral: int) -> None:
    resumen = datos.resumen_stock(tabla_stock)
    columnas = st.columns(4)
    columnas[0].metric("Repuestos en el catálogo", datos.miles(resumen["repuestos"]), border=True)
    columnas[1].metric("Unidades en stock", datos.miles(resumen["unidades"]), border=True)
    columnas[2].metric(
        "Con stock bajo",
        datos.miles(resumen["stock_bajo"]),
        help=f"Entre 1 y {umbral} unidades.",
        border=True,
    )
    columnas[3].metric("Sin stock", datos.miles(resumen["sin_stock"]), border=True)


def _color_estado(estado: str) -> str:
    # Fondos translúcidos: se leen igual con el tema claro y con el oscuro.
    # El estado además va escrito en su columna: el color no es la única pista.
    if estado == datos.SIN_STOCK:
        return "background-color: rgba(227, 73, 72, 0.22)"
    if estado == datos.STOCK_BAJO:
        return "background-color: rgba(237, 161, 0, 0.22)"
    return ""


def seccion_stock(tabla_stock) -> None:
    filtros = st.columns([2, 2, 1.4])
    texto = filtros[0].text_input(
        "Buscar", placeholder="Nombre, código o fabricante", key="stock_texto"
    )
    categorias = filtros[1].multiselect(
        "Categorías",
        sorted(tabla_stock["category"].unique()),
        placeholder="Todas",
        key="stock_categorias",
    )
    filtro_estado = filtros[2].selectbox("Estado", list(datos.FILTROS_ESTADO), key="stock_estado")

    filtrada = datos.filtrar_stock(tabla_stock, texto, categorias, filtro_estado)
    st.caption(
        f"{datos.miles(len(filtrada))} de {datos.miles(len(tabla_stock))} repuestos, "
        "de menos a más stock."
    )

    if filtrada.empty:
        st.info("Ningún repuesto coincide con los filtros.")
        return

    columnas = ["part_code", "name", "manufacturer", "category", "stock", "estado"]
    st.dataframe(
        filtrada[columnas].style.map(_color_estado, subset=["estado"]),
        hide_index=True,
        height=560,
        column_config={
            "part_code": st.column_config.TextColumn("Código"),
            "name": st.column_config.TextColumn("Repuesto", width="large"),
            "manufacturer": st.column_config.TextColumn("Fabricante"),
            "category": st.column_config.TextColumn("Categoría"),
            "stock": st.column_config.NumberColumn("Stock", format="%d"),
            "estado": st.column_config.TextColumn("Estado"),
        },
    )


def grafico_mas_vendidos(tabla) -> alt.Chart:
    base = alt.Chart(tabla).encode(
        y=alt.Y(
            "repuesto:N",
            sort=alt.SortField("puesto"),
            title=None,
            # Los nombres largos se cortan con "…"; el completo está en el
            # tooltip y en la tabla de abajo.
            axis=alt.Axis(labelLimit=240),
        ),
        x=alt.X("units_sold:Q", title="Unidades vendidas", axis=alt.Axis(tickCount=5)),
        tooltip=[
            alt.Tooltip("puesto:Q", title="Puesto"),
            alt.Tooltip("name:N", title="Repuesto"),
            alt.Tooltip("part_code:N", title="Código"),
            alt.Tooltip("category:N", title="Categoría"),
            alt.Tooltip("units_sold:Q", title="Unidades vendidas", format=",d"),
            alt.Tooltip("stock:Q", title="Stock actual"),
        ],
    )
    barras = base.mark_bar(color=COLOR_BARRAS, cornerRadiusEnd=4)
    etiquetas = base.mark_text(align="left", baseline="middle", dx=6, color=COLOR_ETIQUETAS).encode(
        text=alt.Text("units_sold:Q", format=",d")
    )
    # Alto fijo por barra para que los nombres no se pisen con muchos puestos.
    return (barras + etiquetas).properties(height=alt.Step(30))


def seccion_mas_vendidos(token: str, umbral: int) -> None:
    filtros = st.columns([2, 2, 1.4])
    periodo = filtros[0].selectbox("Período", list(PERIODOS), index=2, key="vendidos_periodo")
    limite = filtros[1].select_slider(
        "Cantidad de repuestos", options=[5, 10, 15, 20, 30, 50], value=10, key="vendidos_limite"
    )

    respuesta = pedir(api.mas_vendidos, token, limite, PERIODOS[periodo])
    tabla = datos.tabla_mas_vendidos(respuesta["parts"], umbral)

    if tabla.empty:
        st.info("No hay ventas registradas en este período.")
        return

    st.subheader(f"Los {len(tabla)} repuestos más vendidos · {periodo.lower()}")
    st.caption(
        "Ordenados por unidades vendidas. No cuentan los pedidos cancelados; "
        "sí los repuestos que hoy están agotados."
    )
    st.altair_chart(grafico_mas_vendidos(tabla), width="stretch")

    columnas = ["puesto", "part_code", "name", "manufacturer", "category", "units_sold", "stock", "estado"]
    st.dataframe(
        tabla[columnas].style.map(_color_estado, subset=["estado"]),
        hide_index=True,
        column_config={
            "puesto": st.column_config.NumberColumn("Puesto", format="%d"),
            "part_code": st.column_config.TextColumn("Código"),
            "name": st.column_config.TextColumn("Repuesto", width="large"),
            "manufacturer": st.column_config.TextColumn("Fabricante"),
            "category": st.column_config.TextColumn("Categoría"),
            "units_sold": st.column_config.NumberColumn("Unidades vendidas", format="%d"),
            "stock": st.column_config.NumberColumn("Stock actual", format="%d"),
            "estado": st.column_config.TextColumn("Estado"),
        },
    )


def dashboard() -> None:
    token = st.session_state["token"]
    umbral = barra_lateral()

    respuesta_stock = pedir(api.stock, token, umbral)
    tabla_stock = datos.tabla_stock(respuesta_stock["parts"])

    st.caption("AUTOBOUGHT")
    st.title("Dashboard")
    st.caption(f"Datos registrados en el sistema al {datetime.now(ZONA_HORARIA):%d/%m/%Y %H:%M:%S}.")

    seccion_resumen(tabla_stock, umbral)

    pestana_stock, pestana_vendidos = st.tabs(["Stock actual", "Más vendidos"])
    with pestana_stock:
        seccion_stock(tabla_stock)
    with pestana_vendidos:
        seccion_mas_vendidos(token, umbral)


if "token" in st.session_state:
    dashboard()
else:
    pantalla_login()
