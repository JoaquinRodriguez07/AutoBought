# Guía de desarrollo

Todo lo necesario para trabajar en AutoBought: base de datos, carga de datos, dashboard, mails, tests y asistente con IA. Para una visión general del proyecto, ver el [README](../README.md).

## Índice

- [Base de datos y migraciones (Alembic)](#base-de-datos-y-migraciones-alembic)
  - [`DATABASE_URL`](#database_url)
  - [Base nueva (vacía)](#base-nueva-vacía)
  - [Base que ya existía antes de Alembic](#base-que-ya-existía-antes-de-alembic)
  - [Cambiar el esquema: nueva migración](#cambiar-el-esquema-nueva-migración)
  - [Migrar producción](#migrar-producción)
  - [Ver y revertir migraciones](#ver-y-revertir-migraciones)
  - [Códigos de repuesto repetidos](#códigos-de-repuesto-repetidos)
  - [Tests de migraciones](#tests-de-migraciones)
- [Carga de datos](#carga-de-datos)
  - [Catálogo](#catálogo)
  - [Imágenes de los repuestos](#imágenes-de-los-repuestos)
  - [Usuarios de prueba](#usuarios-de-prueba)
  - [Historial de pedidos](#historial-de-pedidos)
- [Dashboard del vendedor](#dashboard-del-vendedor)
- [Mails](#mails)
  - [Tareas diarias](#tareas-diarias)
- [Tests de punta a punta (E2E)](#tests-de-punta-a-punta-e2e)
- [Asistente de compra con IA](#asistente-de-compra-con-ia)
- [Estilo del código y los comentarios](#estilo-del-código-y-los-comentarios)

## Base de datos y migraciones (Alembic)

Las tablas de la base las crea y las cambia [Alembic](https://alembic.sqlalchemy.org): cada cambio de esquema es una *migración*, un archivo de `backend/migrations/versions/` con un `upgrade()` (aplicar el cambio) y un `downgrade()` (deshacerlo). La base guarda en la tabla `alembic_version` qué migración tiene aplicada, así que `alembic upgrade head` aplica solo las que faltan, en orden, y en Postgres cada corrida es todo o nada.

Las responsabilidades quedan separadas:

- **Alembic**: el esquema (tablas, columnas, índices, restricciones). Ya no se usa `create_all` ni se agregan columnas a mano.
- **Seeds** (`scripts.seed`, `scripts.seed_demo_users`, `scripts.seed_order_history`): solo los datos. Si la base no está en la última migración, no corren y dicen qué hacer.

| Revisión | Qué hace |
|---|---|
| `0001` baseline | Crea todas las tablas tal como las dejaban `create_all` y `add_missing_columns` antes de Alembic. |
| `0002` part_code único | Agrega `UNIQUE (part_code)` en `part` (`uq_part_part_code`). Si hay códigos repetidos, falla sin tocar nada y los lista. |
| `0003` seguimiento del pedido | Agrega el estado «Empaquetando» (`packing`) y la tabla `order_status_history` con cada cambio de estado. |
| `0004` equipo de vendedores | Agrega `is_admin` y `active` a `employee`. El vendedor más antiguo pasa a ser administrador. |
| `0005` motivo de cancelación | Agrega `order.cancellation_reason`: el texto con el que el vendedor explica la cancelación (va en el mail al cliente). |
| `0006` nota interna | Agrega `order.internal_note`: una nota del pedido que solo ve la tienda. |

### `DATABASE_URL`

Alembic usa la misma `DATABASE_URL` (y el mismo engine, `app/db/session.py`) que el backend; `alembic.ini` no tiene credenciales.

- **Con Docker** no hay que configurar nada: `docker-compose.yml` la arma con las variables `LOCAL_DB_*` del `.env` de la raíz, y los comandos se corren dentro del contenedor (`docker exec backend uv run alembic ...`).
- **Sin Docker**, desde `backend/`, se exporta en la terminal (con el Postgres de Docker publicado en el puerto 5432):

  ```bash
  export DATABASE_URL="postgresql+psycopg2://ingsoft2:<LOCAL_DB_PASSWORD>@localhost:5432/ingsoft2db"
  uv run alembic current
  ```

Ojo con a qué base apunta antes de correr una migración. La base de la nube (perfil `remoto`) se migra solo a propósito, con un respaldo hecho antes (`pg_dump`).

### Base nueva (vacía)

```bash
cp .env.example .env                              # completar LOCAL_DB_PASSWORD y SECRET_KEY
docker compose up -d
docker exec backend uv run alembic upgrade head   # crea todas las tablas
docker exec backend uv run python -m scripts.seed # y después los demás seeds (ver "Carga de datos")
```

No hace falta reconstruir la imagen al bajar migraciones o dependencias nuevas: `uv run` instala lo que falte según `uv.lock`.

### Base que ya existía antes de Alembic

Una base creada con los seeds viejos ya tiene las tablas, pero no tiene `alembic_version`: `alembic upgrade head` intentaría crearlas de nuevo (y fallaría sin cambiar nada). Hay que *marcarla* en la baseline (`stamp`) sin ejecutarla, pero solo si su esquema es realmente el de la baseline. No usar `alembic stamp` directamente: `scripts.db_baseline` lo verifica primero.

```bash
# 1. Comparar el esquema con la baseline. Solo mira, no cambia nada.
docker exec backend uv run python -m scripts.db_baseline check

# 2. Si dice que faltan tablas o columnas (por ejemplo, la base no se actualizó
#    desde antes de Mercado Pago y le falta la tabla payment): agregarlas.
#    Solo hace CREATE TABLE / ADD COLUMN y pasa specifications de JSON a JSONB. Nunca borra.
docker exec backend uv run python -m scripts.db_baseline completar

# 3. Marcarla en la baseline (vuelve a verificar; si no coincide, no hace nada).
docker exec backend uv run python -m scripts.db_baseline stamp

# 4. Aplicar las migraciones que siguen (0002: part_code único) y cargar datos.
docker exec backend uv run alembic upgrade head
docker exec backend uv run python -m scripts.seed
```

`check` compara tablas, columnas, tipos, nulos, defaults, claves primarias y foráneas, índices y restricciones únicas. Para eso aplica la baseline en un esquema temporal dentro de una transacción que después deshace (el usuario de la base necesita permiso para crear esquemas, como el dueño de la base local). Solo funciona con Postgres. El resultado se reparte en tres grupos:

- **Faltan**: `completar` las agrega.
- **Sobran**: tablas o columnas que la baseline no tiene. En las bases de antes de Mercado Pago aparecen `payment_method`, `order.payment_method_id` y su índice y clave foránea, que quedaron de las tarjetas guardadas. No se borran solas porque tienen datos. Si el equipo decide conservarlas por ahora, `stamp --permitir-sobrantes` sigue igual: no molestan al backend. Borrarlas requiere una migración aparte, acordada antes.
- **Son distintas** (otro tipo, otro nulo): hay que resolverlas a mano, sin stamp.

Si la base ya está bajo Alembic, o está vacía, `check` lo dice y no hay nada que marcar.

### Cambiar el esquema: nueva migración

1. Cambiar el modelo en `backend/app/models/`.
2. Con la base al día (`alembic upgrade head`), generar la migración comparando modelos contra base. Con `--rev-id` se sigue la numeración:

   ```bash
   docker exec backend uv run alembic revision --autogenerate -m "agregar columna x a part" --rev-id 0003
   ```

   El archivo aparece en `backend/migrations/versions/0003_agregar_columna_x_a_part.py` (la carpeta está montada en el contenedor).
3. **Revisarla antes de aplicarla.** Autogenerate es un borrador:
   - Un renombre (de tabla o columna) lo ve como borrar y crear: se pierden los datos. Cambiarlo por `op.alter_column(..., new_column_name=...)` / `op.rename_table`.
   - No detecta valores nuevos de un `Enum` de Postgres ni cambios en índices parciales: agregarlos a mano (`ALTER TYPE ... ADD VALUE`).
   - Una columna `nullable=False` nueva en una tabla con filas necesita `server_default` (o cargar los valores en la misma migración) o falla.
   - Que no haya `drop_table` / `drop_column` inesperados, y que `downgrade()` deshaga exactamente `upgrade()`.
   - Si hace falta mover datos, va en la misma migración con `op.execute(...)`.
4. Aplicarla y comprobar que no queda nada pendiente:

   ```bash
   docker exec backend uv run alembic upgrade head
   docker exec backend uv run alembic check      # "No new upgrade operations detected."
   ```

5. Correr los tests: `test_las_migraciones_coinciden_con_los_modelos*` falla si un modelo cambió sin su migración.

### Migrar producción

Vercel publica el código, pero **no corre las migraciones**. Cuando se mergea una PR con una migración nueva, quien mergea corre `alembic upgrade head` contra la base de producción. Si la migración solo agrega cosas (tablas, columnas con valor por defecto, valores de un `Enum`), conviene correrla **antes** del merge, desde la rama de la PR: el código que está en producción sigue funcionando con la base ya migrada, y el código nuevo encuentra la base lista.

Desde `backend/`, con `DATABASE_URL` apuntando a la base de producción solo en esa terminal (nunca en el `.env`, para no usarla sin querer en local). Con SQLAlchemy 2.1 la dirección tiene que empezar con `postgresql+psycopg2://`:

```bash
uv run alembic current        # en qué revisión está
uv run alembic upgrade head   # aplica las que faltan
```

### Ver y revertir migraciones

```bash
docker exec backend uv run alembic current            # en qué revisión está la base
docker exec backend uv run alembic history            # todas las revisiones
docker exec backend uv run alembic downgrade -1       # deshace la última (ej. 0002 -> 0001: quita el UNIQUE)
docker exec backend uv run alembic downgrade 0001     # vuelve a una revisión concreta
docker exec backend uv run alembic upgrade head --sql # muestra el SQL sin ejecutarlo
```

`alembic downgrade base` deshace también la baseline: **borra todas las tablas con sus datos**. Nunca contra una base con datos que importen.

### Códigos de repuesto repetidos

La migración 0002 no se aplica si dos repuestos comparten `part_code`. Para verlos (también los lista `scripts.db_baseline check`):

```sql
SELECT part_code, array_agg(id ORDER BY id) AS ids
FROM part GROUP BY part_code HAVING count(*) > 1;
```

No se arreglan solos, porque cada repuesto repetido puede tener pedidos, carritos, favoritos, avisos de stock y compatibilidades. Para ver qué tiene cada id:

```sql
SELECT p.id, p.name, p.price, p.stock,
  (SELECT count(*) FROM order_item    WHERE part_id = p.id) AS pedidos,
  (SELECT count(*) FROM cart_item     WHERE part_id = p.id) AS carritos,
  (SELECT count(*) FROM favorite      WHERE part_id = p.id) AS favoritos,
  (SELECT count(*) FROM stock_alert   WHERE part_id = p.id) AS avisos,
  (SELECT count(*) FROM compatibility WHERE part_id = p.id) AS compatibilidades
FROM part p WHERE p.part_code = '<código>';
```

Con un respaldo hecho y la decisión del equipo:

- **Son repuestos distintos** con el código mal puesto: se le da un código nuevo a uno (`UPDATE part SET part_code = '...' WHERE id = ...`). No rompe ninguna relación, porque todas apuntan al `id`.
- **Son el mismo repuesto** cargado dos veces: se elige el que queda, se pasan a ese `id` las referencias del otro y recién después se borra el otro. Hay que hacerlo en una transacción y cuidando los choques: `order_item`, `cart_item` y `compatibility` tienen clave (`pedido`/`carrito`/`repuesto`, `repuesto`/`auto`), y `favorite` y `stock_alert` son únicos por cliente y repuesto. En esos casos se suman las cantidades o se descarta la fila repetida.

Después, `alembic upgrade head`.

### Tests de migraciones

`tests/migrations_test.py` prueba las migraciones sobre una base vacía, la incorporación de una base existente (sin recrear tablas: mismos OID y mismos datos), el `UNIQUE` de `part_code`, el downgrade y el seed corrido dos veces y dos a la vez. Una parte corre en SQLite (siempre). La otra necesita un Postgres de prueba en `TEST_POSTGRES_URL`: sin la variable se saltea, y en el CI la tiene. Cada test crea su propia base con un nombre al azar y la borra al terminar, sin tocar las demás. Para correrlos en local con un Postgres descartable, en memoria (sin volumen):

```bash
docker run -d --rm --name pg-tests -p 55432:5432 --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=test postgres:17
cd backend
TEST_POSTGRES_URL=postgresql+psycopg2://postgres:test@localhost:55432/postgres uv run pytest ../tests/migrations_test.py
docker stop pg-tests
```

## Carga de datos

Con el stack levantado (`docker compose up -d`) y la base preparada con las migraciones (ver arriba), los scripts se corren dentro del contenedor del backend, en este orden. Todos se pueden correr más de una vez: si los datos ya están, no hacen nada.

```bash
# 0. Tablas (la primera vez, y cada vez que se bajan migraciones nuevas)
docker exec backend uv run alembic upgrade head

# 1. Catálogo: modelos de autos y repuestos (backend/data/*.json)
docker exec backend uv run python -m scripts.seed

# 2. Clientes de prueba con direcciones, y un vendedor (opcional)
docker exec backend uv run python -m scripts.seed_demo_users

# 3. Historial de pedidos de los últimos 12 meses, para el dashboard del vendedor
docker exec backend uv run python -m scripts.seed_order_history
```

Sin Docker, desde `backend/` y con `DATABASE_URL` exportada: `uv run alembic upgrade head`, `uv run python -m scripts.seed`, etc.

### Catálogo

`scripts.seed` carga `backend/data/car_models.json` (84 modelos de 24 marcas) y `backend/data/parts.json` (3990 repuestos). Esos archivos se generan con `scripts.generate_dataset`: para agregar un auto o un repuesto, se edita ese script y se vuelve a correr. Los repuestos nuevos van al final de sus listas (`EXTRA_ENGINE_PARTS`, etc.) y las marcas nuevas al final de `NEW_BRAND_MODELS`, para no cambiar el código ni el stock de los que ya existen.

Cada repuesto tiene su fabricante (`MANUFACTURERS` en el mismo script), como en una casa de repuestos real: las pastillas del Onix pueden ser Bosch, Brembo o TRW, y cada una es un producto distinto, con su código, precio y stock. El fabricante principal de cada tipo de repuesto lo hace para todos los autos; los demás solo para algunos. Según el tipo, un repuesto es de un motor (filtros, bujías, embrague...), de un modelo (pastillas y discos delanteros, faro, radiador...), de una plataforma (`PLATFORMS`: los modelos que comparten la base mecánica, aunque sean de marcas distintas, comparten frenos traseros, dirección, escape, faro trasero...) o sirve para todos (aceite, lámparas, fusibles...).

Cada repuesto trae además una descripción, sus especificaciones técnicas (diámetro, material, medidas, etc., según el tipo) y su garantía: cuántos meses y quién la cubre, el fabricante o el vendedor (las marcas económicas de `VENDOR_WARRANTY` no tienen garantía de fábrica en el país y la cubre la tienda). Ni el nombre ni la descripción nombran autos ("Radiador Valeo", no "Radiador Valeo Chevrolet Onix"): para qué autos es cada repuesto lo dicen sus compatibilidades, que el detalle muestra en la pestaña Aplicaciones. Los de motor sí llevan el código del motor ("Filtro de aceite Mann-Filter 1.4 8V"). El script falla si un repuesto tiene como fabricante una marca de auto, o si el nombre o la descripción nombran una marca o un modelo de auto.

Sobre una base que ya tiene el catálogo, `scripts.seed` no lo vuelve a cargar: agrega lo que la base no tiene (modelos de auto, repuestos y compatibilidades nuevas, por ejemplo de una marca agregada) y actualiza, por código, el nombre, la descripción, las especificaciones y la garantía de los repuestos que ya existen, sin tocar precios, stock, pedidos, carritos ni favoritos. Así, después de bajar cambios del catálogo alcanza con volver a correrlo (también contra la base de la nube, si ya está en la última migración).

Correrlo dos veces, o dos a la vez, no duplica nada. Los repuestos se insertan con `INSERT ... ON CONFLICT (part_code) DO NOTHING`, así que la restricción `UNIQUE` de la base frena un código repetido aunque otro proceso lo haya cargado entre la consulta y el insert. Las compatibilidades van igual, por su clave. Además, un *advisory lock* de Postgres hace que un segundo seed espere a que termine el primero, lo que también cubre a los modelos de auto, que no tienen una restricción única. Todo el seed es una sola transacción: si falla, no queda nada a medias.

### Imágenes de los repuestos

Los 3990 repuestos salen de 47 tipos de pieza (bujía, discos de freno, radiador...) y de 2 a 4 fabricantes por tipo. Cada repuesto muestra la imagen de su tipo en la versión de su fabricante: la del fabricante principal es la imagen base, y la de cada uno de los demás se genera a partir de ella cambiando el color o el diseño (107 imágenes en total). La tabla de tipos está en `frontend/src/imagenesRepuestos.js` (el tipo se reconoce por cómo empieza el nombre, y cada tipo tiene la descripción técnica que se le pide al modelo) y las imágenes en `frontend/public/repuestos/`. Son ilustrativas y genéricas, sin marcas, y se generan con Nano Banana Pro (`gemini-3-pro-image`), la API de imágenes de Gemini. Requiere una clave con facturación activa (unos USD 0,13 por imagen).

```bash
cd frontend
GEMINI_API_KEY=tu-clave npm run imagenes -- --variantes 3     # 3 opciones por tipo para comparar
npm run imagenes -- --elegir bujia 2                          # quedarse con la opción 2 de bujía
GEMINI_API_KEY=tu-clave npm run imagenes -- --solo bujia      # regenerar una o varias (separadas por coma)
GEMINI_API_KEY=tu-clave npm run imagenes                      # solo las que faltan (primero las bases, después las de fabricante)
npm run imagenes -- --prueba                                  # ver los prompts sin llamar a la API
GEMINI_API_KEY=tu-clave npm run imagenes -- --vistas          # segunda vista (otro ángulo) de cada imagen
```

Con `--vistas`, el script trabaja sobre las segundas vistas (`<imagen>-vista.webp`): la misma pieza desde otro ángulo, generada a partir de su imagen principal, que el detalle del repuesto muestra como miniatura. Acepta las mismas opciones (`--solo bateria-vista`, `--variantes`, `--elegir`).

Con `--variantes`, las opciones quedan en `frontend/imagenes-candidatas/` con un `index.html` para verlas lado a lado. Para más fidelidad, se puede dejar una foto real de la pieza en `frontend/imagenes-referencia/<tipo>.jpg` y el script la manda como referencia (solo fotos propias o con licencia libre). Además, la imagen original en 2K (tal como la devuelve el modelo) se guarda en `frontend/imagenes-originales/<tipo>.jpg`, para usarla más adelante como base de los modelos 3D; con `--variantes`, se guarda la de la variante elegida. Ninguna de esas tres carpetas se sube al repositorio.

La clave se pasa como variable de entorno y nunca se sube al repositorio. Opcionales: `GEMINI_IMAGE_MODEL` (otro modelo) y `GEMINI_IMAGE_SIZE` (`1K`, `2K` o `4K`; por defecto `2K`). Cada imagen se guarda como `.webp` de 600×600 px. Un test falla si algún repuesto del catálogo no tiene tipo o si a algún tipo le falta la imagen.

### Usuarios de prueba

`scripts.seed_demo_users` crea 3 clientes con direcciones cargadas, y un vendedor.

> **Solo para entornos locales y de prueba.** Estas contraseñas son públicas. En producción, la contraseña del vendedor es otra y se comparte por un canal privado.

| Correo | Contraseña | Para probar |
|---|---|---|
| `ana.perez@autobought.com` | `Repuestos2026` | 2 direcciones, una compra pagada en el historial |
| `martin.rodriguez@autobought.com` | `Motor2026x` | Dirección en Maldonado |
| `lucia.fernandez@autobought.com` | `Frenos2026x` | Dirección en el interior con apartamento y S/N |
| `vendedor@autobought.com` | `Ventas2026x` | Vendedor administrador: con el mismo login entra a `/dashboard` en vez de a la tienda, y en "Equipo" da de alta y de baja vendedores |

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

Si cambia algo del catálogo o de los pedidos y hay que regenerar todo, lo más simple es recrear la base (`docker compose down -v`, que borra todos los datos locales), aplicar las migraciones (`alembic upgrade head`) y volver a correr los tres scripts.

## Dashboard del vendedor

El dashboard es parte de la tienda en React, en la ruta `/dashboard`: al iniciar sesión, el vendedor (`vendedor@autobought.com` de `scripts.seed_demo_users`) entra directo ahí. Solo lo ven las sesiones de vendedor, y su código (con [Recharts](https://recharts.org) para los gráficos y [Base UI](https://base-ui.com) para los controles) se descarga recién cuando entra un vendedor. Los componentes están en `frontend/src/dashboard/`.

Los cálculos son del backend, en `/api/v1/analytics/*` (endpoints en `app/api/v1/endpoints/analytics.py`, cálculos puros en `app/core/analytics_math.py`). Responden 401 sin sesión y 403 a una cuenta de cliente. Para que los gráficos tengan forma, cargar antes `scripts.seed_order_history`.

| Sección | Endpoint | Qué muestra |
|---|---|---|
| Alertas de reposición | `stockout-risk?at_risk_only=true` | Arriba de todo: los repuestos con riesgo alto (destacados) o medio, con stock, demanda proyectada y días de cobertura. |
| Evolución de ventas | `sales-by-month` | Unidades o facturación de cada mes, con la proyección del mes que viene punteada. El último mes es el actual, hasta hoy. |
| Más vendidos | `best-sellers` | Ranking por unidades vendidas en el período. No cuentan los pedidos cancelados; sí los repuestos agotados. |
| Stock actual | `stock` | Todos los repuestos de menos a más stock, con su estado escrito: *Sin stock*, *Stock bajo* (5 unidades o menos) o *Normal*. |
| Proyección | `demand-forecast` | Demanda proyectada del mes que viene por repuesto. |
| Riesgo de agotamiento | `stockout-risk` | Días de cobertura y nivel de riesgo, del más urgente al menos urgente. |
| Detalle de un repuesto | `parts/{id}` | Stock, unidades vendidas, ventas de 12 meses con la proyección, cobertura y riesgo. Desde ahí se edita el repuesto y se ajusta el stock. |

- **Filtros:** categoría, repuesto (nombre o código) y período (3, 6 o 12 meses calendario, el actual incluido) en todas las secciones; van en la URL, así que al volver del detalle quedan como estaban. El período aplica a las ventas; la proyección siempre mira 12 meses.
- **Proyección:** regresión lineal (numpy) sobre las unidades de los últimos 12 meses, evaluada en el mes siguiente. El mes en curso se lleva a mes completo al ritmo que lleva (el día 15 de un mes de 30 cuenta el doble), si no siempre parecería una caída. Nunca da menos de 0 y no modifica ventas ni stock.
- **Riesgo:** días de cobertura = stock / (demanda proyectada / días del mes proyectado). Alto con menos de 15 días, medio de 15 a 30, bajo con más de 30 o sin demanda proyectada. Los umbrales están en `app/core/analytics_math.py`.
- **Alta, edición y stock:** `POST /api/v1/parts`, `PUT /api/v1/parts/{id}` y `PATCH /api/v1/parts/{id}/stock`, solo para vendedores. Un repuesto necesita al menos un vehículo compatible para aparecer en el catálogo. Reponer un agotado manda el aviso de «Avisame cuando haya», y bajar el precio, el de baja de precio a quienes lo tienen en favoritos.

## Mails

El backend manda mails para verificar el correo al registrarse, recuperar la contraseña y avisar cuando la contraseña cambia; para confirmar cada compra; para avisar que volvió el stock de un repuesto agotado (botón «Avisame cuando haya»); y recordatorios de carrito abandonado y de mantenimiento. El vendedor dispara desde el dashboard el aviso de vuelta de stock (al reponer un agotado) y el de baja de precio de un favorito. Los mails de pedidos ante un cambio de estado o una cancelación ya están en `app/core/notifications.py`: falta que la gestión de pedidos y la cancelación los llamen.

**En local** no hace falta configurar nada: `docker compose up -d` levanta **Mailpit**, un servidor de mail falso. Todos los mails que manda el backend, a cualquier dirección, se ven en http://localhost:8025 y no llega nada a ningún correo real.

**Para mandarlos de verdad** se usa la cuenta de Gmail del equipo con una *contraseña de aplicación* (la cuenta necesita la verificación en dos pasos activada; la contraseña se crea en *Cuenta de Google → Seguridad → Contraseñas de aplicación*). Se completan las variables `SMTP_*` y `EMAIL_FROM` del `.env` siguiendo el ejemplo de `.env.example`, y se recrea el backend (`docker compose up -d backend`). La contraseña de aplicación se comparte por un canal privado: nunca se sube al repositorio.

Los usuarios de prueba de `scripts.seed_demo_users` ya tienen el correo verificado. Un usuario nuevo puede navegar y usar el carrito, pero para confirmar una compra tiene que verificar el correo con el enlace del mail.

### Tareas diarias

Los recordatorios de carrito abandonado (24 horas sin tocarlo) y de mantenimiento (según cada cuánto se cambia el repuesto: aceite y filtros a los 6 meses, bujías a los 12, etc.) los manda un script:

```bash
docker exec backend uv run python -m scripts.daily_tasks
```

En producción el backend corre en Vercel, que no tiene cron de servidor: las tareas están expuestas en `GET /api/v1/tareas/diarias` y las llama **Vercel Cron** todos los días a las 10 (hora de Uruguay), según el `vercel.json` de la raíz. El endpoint solo responde si el pedido trae `Authorization: Bearer <CRON_SECRET>`; Vercel lo agrega solo si la variable `CRON_SECRET` está cargada en el proyecto de Vercel. Se puede correr más de una vez: cada recordatorio sale una sola vez, y si un mail falla, ese recordatorio se reintenta al día siguiente.

Estos mails, y el de baja de precio, son comerciales: traen el enlace «No quiero recibir estos mails» y se pueden apagar desde el perfil. Los 300 clientes ficticios de `scripts.seed_order_history` ya vienen dados de baja, para que las tareas diarias no les manden nada.

## Tests de punta a punta (E2E)

La carpeta `e2e/` tiene recorridos con [Playwright](https://playwright.dev) que abren la app en un Chrome de verdad y hacen lo que haría una persona: filtrar el catálogo desde el inicio (categoría, marca, fabricante), buscar, agregar al carrito y deshacer, favoritos, comprar con los datos guardados, registrarse y verificar el correo (leyendo el mail desde Mailpit) y entrar como vendedor.

**En GitHub** corren solos cada vez que se mergea a `dev` o a `main` (`.github/workflows/e2e.yml`), y también a mano desde *Actions → E2E → Run workflow*. Cada corrida levanta la app con una base nueva y carga `scripts.seed` y `scripts.seed_demo_users`. Si algo falla, abre un issue con la etiqueta `e2e` (o comenta el que ya esté abierto para esa rama) con los recorridos que fallaron y el link a la corrida; las capturas, los videos y los logs de la app quedan 7 días en el artefacto `e2e-fallas`.

**En local**, con la app levantada (`docker compose up -d`) y los dos seeds cargados:

```bash
cd e2e
npm ci
npx playwright install chromium   # solo la primera vez
npx playwright test               # todos los recorridos
npx playwright test --ui          # para verlos paso a paso
```

Ojo: en local usan tu base. Cada recorrido deja las cosas como estaban (deshace lo que agrega al carrito y a favoritos), pero la compra vacía el carrito de Ana antes de empezar y queda en su historial, y el registro crea un usuario `e2e-…@autobought.com` nuevo en cada corrida.

## Asistente de compra con IA

**Pit** es el asistente: un botón flotante abajo a la derecha (para clientes con sesión) que abre un chat al costado, sin salir de la página. El cliente cuenta con sus palabras qué le pasa al auto (con un vehículo elegido) y conversa con Pit, que le da un diagnóstico breve, la urgencia y los repuestos que le sirven. La conversación sigue al navegar por la tienda y se borra al cerrar sesión; el historial que se le manda a la IA lo firma el backend (`app/ia/signature.py`), así nadie puede inventar mensajes de Pit. La IA (Gemini, `backend/app/ia/`) solo interpreta el síntoma y elige tipos de repuesto de una lista cerrada; los repuestos concretos los elige el backend entre los que existen, son compatibles con el vehículo y tienen stock.

Para usarlo en local, poné `GEMINI_API_KEY` en el `.env` de la raíz (ver `.env.example`) y reiniciá el backend. Sin clave, el asistente responde "no disponible" y ofrece buscar el mismo texto en el catálogo. Cada cliente tiene un límite de consultas por día (`IA_LIMITE_DIARIO`, 20 por defecto) y cada consulta queda registrada con sus tokens en la tabla `uso_ia`. Los tests usan un cliente de IA falso: el CI nunca llama a la IA real.

## Estilo del código y los comentarios

**Idioma.** El código va en inglés: nombres de funciones, clases, variables, módulos y archivos. Los comentarios, los docstrings, los textos de pantalla y los mails van en español.

Algunos nombres siguen en español a propósito, porque son un contrato con otra parte y cambiarlos rompe algo:

- Las rutas de la API (`/pagos`, `/asistente`, `/tareas`): las usan el frontend, Vercel Cron y Mercado Pago.
- Los campos del JSON que lee el frontend (por ejemplo `estado` en la verificación del pago, o `texto`, `marca` y `firma` en el asistente) y los que se le piden a Gemini (`diagnostico`, `tipos`...).
- Las tablas y columnas de la base (`uso_ia`, `funcionalidad`): cambiarlas pide una migración.
- Las variables de entorno (`MINUTOS_PARA_PAGAR`, `IA_LIMITE_DIARIO`...): están cargadas en Vercel y en cada `.env`.
- Los nombres de las plantillas de mail (`verificar_correo`, `pago_sin_stock`...).

**Cabecera de cada archivo.** Una o dos líneas arriba de todo que digan qué hay en el archivo. En Python es el docstring del módulo; en JavaScript, un comentario `//`.

```python
"""Pedidos: armarlos desde el carrito, cambiar su estado, vencerlos y listarlos."""
```

```js
// El carrito del cliente, compartido por toda la tienda.
```

**Funciones.** Estilo Google, pero liviano:

- Las funciones públicas que no son obvias (`crud/`, `core/`, `ia/`, `api.js` y los helpers del frontend) llevan un docstring con qué hacen y, cuando ayuda, `Args:`, `Returns:` y `Raises:`. En JavaScript se usa JSDoc (`@param`, `@returns`).
- Los endpoints, los componentes de React y las funciones cortas no lo llevan: alcanza con una línea de qué hacen y, sobre todo, por qué.
- Un comentario explica lo que el código no dice (una regla del negocio, un caso raro, por qué se hace así), no repite lo que ya se lee.

```python
def refund(db: Session, payment: Payment, mp_client: MercadoPagoClient) -> bool:
    """Devuelve el pago en Mercado Pago y anota cuándo.

    Args:
        db: la sesión de la base.
        payment: el pago aprobado que se devuelve.
        mp_client: el cliente de Mercado Pago (en los tests, uno falso).

    Returns:
        Si la devolución salió. Si Mercado Pago falla, queda en el log y el
        cron la reintenta.
    """
```

