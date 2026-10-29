# Ingenier-a-de-software-II

## Carga de datos

Con el stack levantado (`docker compose up -d`), los scripts se corren dentro del contenedor del backend, en este orden. Todos se pueden correr más de una vez: si los datos ya están, no hacen nada.

```bash
# 1. Catálogo: modelos de autos y repuestos (backend/data/*.json)
docker exec backend uv run python -m scripts.seed

# 2. Clientes de prueba con direcciones, y un vendedor (opcional)
docker exec backend uv run python -m scripts.seed_demo_users

# 3. Historial de pedidos de los últimos 12 meses, para el dashboard del vendedor
docker exec backend uv run python -m scripts.seed_order_history
```

Sin Docker, desde `backend/` y con el `.venv` activado: `python -m scripts.seed`, etc.

### Catálogo

`scripts.seed` carga `backend/data/car_models.json` (84 modelos de 24 marcas) y `backend/data/parts.json` (3990 repuestos). Esos archivos se generan con `scripts.generate_dataset`: para agregar un auto o un repuesto, se edita ese script y se vuelve a correr. Los repuestos nuevos van al final de sus listas (`EXTRA_ENGINE_PARTS`, etc.) y las marcas nuevas al final de `NEW_BRAND_MODELS`, para no cambiar el código ni el stock de los que ya existen.

Cada repuesto tiene su fabricante (`MANUFACTURERS` en el mismo script), como en una casa de repuestos real: las pastillas del Onix pueden ser Bosch, Brembo o TRW, y cada una es un producto distinto, con su código, precio y stock. El fabricante principal de cada tipo de repuesto lo hace para todos los autos; los demás solo para algunos. Según el tipo, un repuesto es de un motor (filtros, bujías, embrague...), de un modelo (pastillas y discos delanteros, faro, radiador...), de una plataforma (`PLATFORMS`: los modelos que comparten la base mecánica, aunque sean de marcas distintas, comparten frenos traseros, dirección, escape, faro trasero...) o sirve para todos (aceite, lámparas, fusibles...).

Cada repuesto trae además una descripción, sus especificaciones técnicas (diámetro, material, medidas, etc., según el tipo) y su garantía: cuántos meses y quién la cubre, el fabricante o el vendedor (las marcas económicas de `VENDOR_WARRANTY` no tienen garantía de fábrica en el país y la cubre la tienda). Ni el nombre ni la descripción nombran autos ("Radiador Valeo", no "Radiador Valeo Chevrolet Onix"): para qué autos es cada repuesto lo dicen sus compatibilidades, que el detalle muestra en la pestaña Aplicaciones. Los de motor sí llevan el código del motor ("Filtro de aceite Mann-Filter 1.4 8V"). El script falla si un repuesto tiene como fabricante una marca de auto, o si el nombre o la descripción nombran una marca o un modelo de auto.

Sobre una base que ya tiene el catálogo, `scripts.seed` no lo vuelve a cargar: agrega las columnas nuevas de `part` si faltan, agrega lo que la base no tiene (modelos de auto, repuestos y compatibilidades nuevas, por ejemplo de una marca agregada) y actualiza, por código, el nombre, la descripción, las especificaciones y la garantía de los repuestos que ya existen, sin tocar precios, stock, pedidos, carritos ni favoritos. Así, después de bajar cambios del catálogo alcanza con volver a correrlo (también contra la base de la nube).

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

`scripts.seed_demo_users` crea 3 clientes con direcciones cargadas, y un vendedor:

| Correo | Contraseña | Para probar |
|---|---|---|
| `ana.perez@autobought.com` | `Repuestos2026` | 2 direcciones, una compra pagada en el historial |
| `martin.rodriguez@autobought.com` | `Motor2026x` | Dirección en Maldonado |
| `lucia.fernandez@autobought.com` | `Frenos2026x` | Dirección en el interior con apartamento y S/N |
| `vendedor@autobought.com` | `Ventas2026x` | Vendedor: con el mismo login entra a `/dashboard` en vez de a la tienda |

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

## Dashboard del vendedor

El dashboard interno (stock actual y repuestos más vendidos) es una app de [Streamlit](https://streamlit.io) en `analitica/`. No se conecta a la base: pide los datos a los endpoints `/api/v1/analytics/*` del backend con el token del vendedor, así que solo entran las cuentas de vendedor (a un cliente el backend le responde 403 y el dashboard no lo deja pasar del login).

Con `docker compose up -d` se levanta junto con el resto en http://localhost:8501. Se entra con el vendedor de `scripts.seed_demo_users` (`vendedor@autobought.com`). Desde la tienda, el vendedor llega con el botón «Abrir dashboard» de `/dashboard`, que abre esa dirección (se cambia con `VITE_DASHBOARD_URL`).

- **Stock actual:** todos los repuestos de menos a más stock, con búsqueda por nombre, código o fabricante, filtro por categoría y por estado. Con 5 unidades o menos un repuesto figura como *Stock bajo* (el umbral se cambia en la barra lateral) y con 0, como *Sin stock*.
- **Más vendidos:** ranking por unidades vendidas en los últimos 30 días, 90 días, 12 meses o en total. No cuentan los pedidos cancelados y sí los repuestos agotados, que son justo los que hay que reponer.

Los datos se piden de nuevo en cada interacción (no hay caché): un cambio de stock o una venta nueva se ve tocando cualquier filtro o «Actualizar datos». Para que los gráficos tengan forma, cargar antes `scripts.seed_order_history`.

Sin Docker, con el backend corriendo en el puerto 8000:

```bash
cd analitica
uv sync
uv run streamlit run app.py                                         # http://localhost:8501
AUTOBOUGHT_API_URL=http://otro-backend:8000 uv run streamlit run app.py   # contra otro backend
uv sync --group dev && uv run pytest                                # tests
```

## Mails

El backend manda mails para verificar el correo al registrarse, recuperar la contraseña y avisar cuando la contraseña cambia; para confirmar cada compra; para avisar que volvió el stock de un repuesto agotado (botón «Avisame cuando haya»); y recordatorios de carrito abandonado y de mantenimiento. Los mails de pedidos ante un cambio de estado o una cancelación, y el aviso de baja de precio de un favorito, ya están en `app/core/notificaciones.py`: falta que las pantallas del vendedor y la cancelación los llamen.

**En local** no hace falta configurar nada: `docker compose up -d` levanta **Mailpit**, un servidor de mail falso. Todos los mails que manda el backend, a cualquier dirección, se ven en http://localhost:8025 y no llega nada a ningún correo real.

**Para mandarlos de verdad** se usa la cuenta de Gmail del equipo con una *contraseña de aplicación* (la cuenta necesita la verificación en dos pasos activada; la contraseña se crea en *Cuenta de Google → Seguridad → Contraseñas de aplicación*). Se completan las variables `SMTP_*` y `EMAIL_FROM` del `.env` siguiendo el ejemplo de `.env.example`, y se recrea el backend (`docker compose up -d backend`). La contraseña de aplicación se comparte por un canal privado: nunca se sube al repositorio.

Los usuarios de prueba de `scripts.seed_demo_users` ya tienen el correo verificado. Un usuario nuevo puede navegar y usar el carrito, pero para confirmar una compra tiene que verificar el correo con el enlace del mail.

### Tareas diarias

Los recordatorios de carrito abandonado (24 horas sin tocarlo) y de mantenimiento (según cada cuánto se cambia el repuesto: aceite y filtros a los 6 meses, bujías a los 12, etc.) los manda un script:

```bash
docker exec backend uv run python -m scripts.tareas_diarias
```

En el servidor lo corre cron una vez por día (`0 10 * * * docker exec backend uv run python -m scripts.tareas_diarias`). Se puede correr más de una vez: cada recordatorio sale una sola vez.

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

**Pit** es el asistente: un botón flotante abajo a la derecha (para clientes con sesión) que abre un chat al costado, sin salir de la página. El cliente cuenta con sus palabras qué le pasa al auto (con un vehículo elegido) y conversa con Pit, que le da un diagnóstico breve, la urgencia y los repuestos que le sirven. La conversación sigue al navegar por la tienda y se borra al cerrar sesión; el historial que se le manda a la IA lo firma el backend (`app/ia/firma.py`), así nadie puede inventar mensajes de Pit. La IA (Gemini, `backend/app/ia/`) solo interpreta el síntoma y elige tipos de repuesto de una lista cerrada; los repuestos concretos los elige el backend entre los que existen, son compatibles con el vehículo y tienen stock.

Para usarlo en local, poné `GEMINI_API_KEY` en el `.env` de la raíz (ver `.env.example`) y reiniciá el backend. Sin clave, el asistente responde "no disponible" y ofrece buscar el mismo texto en el catálogo. Cada cliente tiene un límite de consultas por día (`IA_LIMITE_DIARIO`, 20 por defecto) y cada consulta queda registrada con sus tokens en la tabla `uso_ia`. Los tests usan un cliente de IA falso: el CI nunca llama a la IA real.
