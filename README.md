# Ingenier-a-de-software-II

## Carga de datos

Con el stack levantado (`docker compose up -d`), los scripts se corren dentro del contenedor del backend, en este orden. Todos se pueden correr más de una vez: si los datos ya están, no hacen nada.

```bash
# 1. Catálogo: modelos de autos y repuestos (backend/data/*.json)
docker exec backend uv run python -m scripts.seed

# 2. Usuarios de prueba con direcciones y tarjetas (opcional)
docker exec backend uv run python -m scripts.seed_demo_users

# 3. Historial de pedidos de los últimos 12 meses, para el dashboard del vendedor
docker exec backend uv run python -m scripts.seed_order_history
```

Sin Docker, desde `backend/` y con el `.venv` activado: `python -m scripts.seed`, etc.

### Catálogo

`scripts.seed` carga `backend/data/car_models.json` (50 modelos) y `backend/data/parts.json` (509 repuestos). Esos archivos se generan con `scripts.generate_dataset`: para agregar un auto o un repuesto, se edita ese script y se vuelve a correr. Los repuestos nuevos van al final de sus listas (`EXTRA_ENGINE_PARTS`, etc.), para no cambiar el código ni el stock de los que ya existen.

`scripts.seed` no actualiza un catálogo ya cargado: para ver repuestos nuevos hay que recrear la base.

### Usuarios de prueba

`scripts.seed_demo_users` crea 3 clientes con direcciones y tarjetas cargadas:

| Correo | Contraseña | Para probar |
|---|---|---|
| `ana.perez@autobought.com` | `Repuestos2026` | 2 direcciones, Visa y Mastercard, una compra en el historial |
| `martin.rodriguez@autobought.com` | `Motor2026x` | American Express, OCA y una tarjeta vencida |
| `lucia.fernandez@autobought.com` | `Frenos2026x` | Dirección en el interior con apartamento y S/N, OCA |

### Historial de pedidos

`scripts.seed_order_history` crea unos 6.000 pedidos de 300 clientes ficticios (`clienteNNN@historico.autobought.com`, sin contraseña utilizable) repartidos en los últimos 12 meses. Se guardan como pedidos reales, para que el dashboard del vendedor (más vendidos, evolución de ventas, proyección de demanda, riesgo de agotamiento y alertas de reposición) tenga datos con forma:

- **Tendencia:** las ventas crecen a lo largo del año.
- **Estacionalidad:** diciembre es el mes más fuerte y enero el más flojo; refrigeración se vende más en verano, baterías y encendido en invierno, escobillas en otoño e invierno y filtros de habitáculo en primavera.
- **Estrellas y lentos:** aceite, escobillas, filtros, pastillas y bujías se venden mucho más que un faro, y en cada categoría hay pocos repuestos que se venden mucho y muchos que se venden poco.
- **Repuestos en riesgo:** algunos con stock bajo venden en el último mes más de lo que tienen, para que las alertas tengan casos. El script imprime cuáles son.

No descuenta stock: el stock del catálogo ya es el de hoy.

Es reproducible: con la misma semilla y la misma fecha final se generan exactamente los mismos pedidos, en SQLite o en Postgres. Por defecto la fecha final es hoy, así que corrido otro día genera los mismos pedidos corridos en el tiempo.

```bash
# Otra semilla o una fecha final fija
docker exec backend uv run python -m scripts.seed_order_history --semilla 7 --hasta 2026-10-19
```

Si cambia algo del catálogo o de los pedidos y hay que regenerar todo, lo más simple es recrear la base (`docker compose down -v`, que borra todos los datos locales) y volver a correr los tres scripts.
