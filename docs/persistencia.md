# Persistencia de los datos de AutoBought

## Índice

- [Introducción](#introducción)
- [La Base de Datos](#la-base-de-datos)
- [El Object-Relational Mapper (ORM)](#el-object-relational-mapper-orm)
- [Versionando con Alembic](#versionando-con-alembic)
- [Los Scripts de Testeo](#los-scripts-de-testeo)
- [Privacidad y Permanencia](#privacidad-y-permanencia)

## Introducción

Siguiendo las buenas prácticas de la industria, los componentes de software del backend de esta aplicación actuan como procesos  completamente desprovistos de memoria, stateless. Esto se elige por las claras ventajas de mayor escalabilidad y tolerancia a fallos, pero este diseño brinda consigo un desafío igual de claro: la persistencia. Sin una memoria durable y segura, esta aplicación no podría hacer e-commerce o siquiera mostrar partes a los usuarios. Por tal razón, hay también herramientas y componentes de software diseñados específicamente para la provisión de persistencia. Implementar este software permite a nuestro proyecto centralizar toda la complejidad de la persistencia en su propio componente, mejorando así el desempeño del resto de la aplicación.

## La Base de Datos

La información permanente de AutoBought se guarda en PostgreSQL. En producción, PostgreSQL 17 corre dentro de un contenedor Docker en una máquina virtual de Oracle Cloud Infrastructure (OCI). Sus archivos de datos están en un volumen de la máquina: no dependen de la memoria temporal de la aplicación ni del ciclo de vida de una ejecución del backend. Por eso, reiniciar o volver a desplegar la API no elimina el catálogo, las cuentas ni los pedidos.

El recorrido de una consulta es el siguiente:

1. El navegador descarga el frontend estático de React desde Vercel y, cuando necesita datos o realizar una operación, envía una solicitud a la API.
2. Vercel ejecuta el backend FastAPI como una función serverless. El navegador no se conecta directamente con PostgreSQL.
3. El backend obtiene la dirección de la base desde la variable de entorno `DATABASE_URL`, abre una conexión PostgreSQL mediante SQLAlchemy y el controlador `psycopg2`, y ejecuta la operación solicitada.
4. PostgreSQL responde al backend, que devuelve el resultado a través de la API. El frontend presenta ese resultado al usuario.

La URL de conexión incluye los datos necesarios para localizar la instancia, seleccionar la base y autenticar al backend. Por ser una credencial, se configura en el entorno del servicio del backend en Vercel; no se incorpora al código del frontend ni se escribe en este documento. En Docker, la configuración local o remota también se toma del entorno y se usa para formar la URL.

El backend crea un `engine` compartido y sesiones de base de datos para atender las operaciones. El pool mantiene conexiones reutilizables; `pool_pre_ping` comprueba una conexión antes de reutilizarla y `pool_recycle` descarta las que superaron cinco minutos. Estas opciones ayudan a recuperarse de conexiones inactivas que la base o la red hayan cerrado. FastAPI abre una sesión para la operación que la necesita y la cierra al terminar, incluso si ocurre un error.

El esquema —las tablas, columnas, índices y restricciones— se administra con migraciones de Alembic. La tabla `alembic_version` permite saber qué revisión está aplicada. Antes de cargar datos, los scripts de catálogo y pruebas verifican que la base esté en la última migración; los seeds agregan o preparan datos, pero no crean ni modifican tablas. Para preparar una base nueva se aplica primero `alembic upgrade head`.

En desarrollo se puede usar un contenedor PostgreSQL local o configurar el perfil remoto de Docker. En producción, la topología documentada es Vercel hacia la base en Oracle por PostgreSQL/TCP (puerto 5432). La documentación de despliegue deja pendiente confirmar si ese enlace usa TLS y si hay un proxy o firewall delante de la máquina virtual; por lo tanto, no se debe asumir aquí que el cifrado en tránsito ya está verificado.

## El Object-Relational Mapper (ORM)

La aplicación utiliza SQLAlchemy como ORM (*Object-Relational Mapper*). Los modelos de Python representan las entidades relacionales de la aplicación —por ejemplo, repuestos, modelos de auto, usuarios, direcciones, carritos, pedidos, pagos y compatibilidades— y describen cómo se relacionan entre sí. La información que se consulta o modifica mediante esos modelos corresponde a tablas y filas de PostgreSQL.

Se eligió un ORM para mantener el acceso a datos junto al código del dominio, con nombres y estructuras que el resto del backend ya utiliza. Así, una modificación en las entidades se puede seguir desde el modelo hasta las operaciones que lo usan y, cuando cambia el esquema, hasta su migración. Esto facilita leer, revisar y mantener el código sin tener que reconstruir manualmente en cada lugar cómo se relacionan las tablas.

SQLAlchemy también construye y ejecuta las consultas SQL a partir de las operaciones sobre modelos y sesiones: filtrar repuestos, buscar un usuario, insertar un pedido o relacionar sus artículos no requiere concatenar y mantener a mano cada sentencia SQL. El ORM administra parámetros y relaciones, lo que reduce duplicación y errores en consultas repetidas, y permite usar la misma capa para PostgreSQL y, en pruebas puntuales, SQLite.

El ORM no reemplaza a SQL ni decide por sí solo el diseño de la base. Las migraciones de Alembic controlan los cambios de esquema; las restricciones de PostgreSQL protegen la integridad de los datos; y, cuando una operación específica lo requiere, el proyecto puede ejecutar SQL explícito. Por ejemplo, el seed del catálogo utiliza un *advisory lock* de PostgreSQL para coordinar ejecuciones concurrentes.

## Versionando con Alembic

Alembic administra las versiones del esquema de la base. Cada cambio estructural —por ejemplo, agregar una columna, una tabla o una restricción— se registra como una revisión de migración en `backend/migrations/versions/`. Una revisión define `upgrade()`, que aplica el cambio, y `downgrade()`, que lo revierte. Las revisiones se encadenan para que Alembic pueda recorrer el historial y aplicar los cambios en el orden correcto.

La configuración está en `backend/alembic.ini`; no contiene credenciales. Al ejecutar Alembic, `backend/migrations/env.py` toma la conexión de `DATABASE_URL`, la misma configuración y el mismo `engine` que usa el backend. También carga los modelos registrados en `Base.metadata` de SQLAlchemy. De ese modo, al crear una revisión con autogeneración, Alembic compara los modelos con el esquema actual y propone las diferencias.

La autogeneración produce un borrador, no una migración lista para aplicar sin revisión. Antes de usarla hay que comprobar que representa el cambio deseado, que no propone borrar datos por error y que los métodos `upgrade()` y `downgrade()` son adecuados. En especial, un renombre puede aparecer como eliminación y creación; si se quiere conservar los datos, hay que corregir la migración para expresar el renombre. Cuando el cambio depende de una transformación de datos o Alembic no lo detecta, la migración se completa explícitamente.

Las migraciones se ejecutan desde `backend/` con `uv run alembic upgrade head`, o desde Docker con `docker exec backend uv run alembic upgrade head`. `head` significa la última revisión disponible en el código; Alembic aplica las revisiones que todavía falten y registra la versión alcanzada en la tabla `alembic_version`. Así, una base nueva se prepara aplicando todas las revisiones, mientras que una base existente avanza desde su versión actual sin volver a ejecutar las anteriores. Antes de migrar una base remota, hay que verificar que `DATABASE_URL` apunta al destino previsto y realizar un respaldo.

El proyecto mantiene separadas las responsabilidades: Alembic crea y modifica tablas, columnas, índices y restricciones; los scripts de seed cargan o actualizan registros, pero no cambian el esquema. Por eso, los seeds llaman a `require_head` y se niegan a ejecutarse si la base no está en la última revisión. Si se trabaja con una base antigua creada antes de Alembic, no alcanza con ejecutar `upgrade head`: primero se verifica y registra su esquema de partida con `scripts.db_baseline`, según las instrucciones de la guía de desarrollo.

## Los Scripts de Testeo

Los scripts de prueba cargan información útil para desarrollar y probar la aplicación contra la base. No sustituyen a las migraciones: antes de ejecutar cualquiera de estos seeds, la base debe estar creada y actualizada con `alembic upgrade head`. Se pueden ejecutar desde el contenedor del backend; por ejemplo:

```bash
docker exec backend uv run python -m scripts.seed
docker exec backend uv run python -m scripts.seed_demo_users
docker exec backend uv run python -m scripts.seed_order_history
```

### `seed.py`: catálogo

Este script lee `backend/data/car_models.json` y `backend/data/parts.json`, producidos por `scripts.generate_dataset`, y los carga en la base. Si esos archivos todavía no existen, primero hay que generar el conjunto de datos.

La carga es repetible: agrega los modelos de auto, repuestos y compatibilidades que todavía no existen; no duplica filas ya presentes. Para los repuestos que reconoce por su código, actualiza el nombre, la descripción, las especificaciones y la garantía si cambiaron en el archivo. No modifica sus precios ni su stock y tampoco altera pedidos, carritos o favoritos. Sí elimina las compatibilidades obsoletas de los repuestos administrados por el catálogo, pero no elimina los repuestos ni los datos transaccionales.

Las operaciones del catálogo se confirman en una sola transacción: si la carga falla, se revierte para no dejar una actualización incompleta. Los inserts por lotes reducen los viajes a la base remota. Las restricciones únicas y `ON CONFLICT DO NOTHING` evitan duplicar repuestos y compatibilidades; en PostgreSQL, un *advisory lock* también coordina ejecuciones simultáneas para evitar duplicar modelos de auto. El script comprueba la revisión de Alembic antes de empezar.

### `seed_demo_users.py`: cuentas y compra de ejemplo

Este script crea tres clientes de prueba con direcciones ya cargadas y un vendedor administrador para probar las funciones de vendedor. Los datos se validan con los mismos esquemas y funciones que utiliza la API; si dejan de cumplir las reglas vigentes, el script falla en vez de insertar datos que la aplicación rechazaría. Las contraseñas de estas cuentas se guardan como hashes, y los clientes se marcan como verificados para poder iniciar sesión y comprar.

Una cuenta de cliente incluye una compra pagada de ejemplo con repuestos del catálogo. Para crearla, el script agrega los artículos al carrito y utiliza la lógica de pedidos de la aplicación; luego marca el pago como aprobado, como si el proveedor de pagos lo hubiera confirmado. Si el catálogo todavía no tiene repuestos disponibles para esa compra, crea la cuenta y las direcciones, pero informa que no pudo generar el pedido. Por eso conviene ejecutar `seed.py` primero.

Si ya existe una cuenta con el mismo correo, el script la saltea en lugar de duplicarla. Las credenciales incluidas en el propio script son únicamente datos públicos de prueba: deben utilizarse en entornos locales o de demostración, no como credenciales reales de producción. Las compras de prueba no guardan datos de tarjetas; los pagos reales se procesan con Mercado Pago.

### `seed_order_history.py`: historial para el dashboard

Este script genera un historial sintético de pedidos de los últimos doce meses para probar el dashboard del vendedor, incluyendo tendencias de ventas, productos más vendidos, proyecciones y alertas de reposición. Se ejecuta después de cargar el catálogo, porque selecciona repuestos existentes.

Como parte de la preparación crea 300 clientes ficticios del dominio `historico.autobought.com`, cada uno con una dirección. Sus contraseñas se generan aleatoriamente y no se guardan; por eso esas cuentas no sirven para iniciar sesión. Además, se desactivan sus correos de marketing para que no reciban comunicaciones de tareas diarias.

Los pedidos se generan con una tendencia creciente, variaciones estacionales y una distribución de popularidad que hace que algunos productos se vendan mucho más que otros. También se eligen repuestos con poco stock en categorías específicas para producir casos de riesgo y alertas en el dashboard. Los pedidos se guardan como pagados, junto con sus artículos y precios congelados, y reciben estados acordes a su antigüedad.

El script no usa el flujo normal de compra para insertar el historial: inserta pedidos, sus pagos y artículos directamente, en lotes mensuales, para reducir las consultas a la base remota. Así no descuenta unidades del stock actual del catálogo. El historial puede reproducirse con la misma semilla y fecha de corte. Se pueden indicar ambas opciones con `--semilla` y `--hasta AAAA-MM-DD`; si se omite la fecha, se usa el día de ejecución. Si ya encuentra clientes del dominio histórico, no vuelve a generar los datos. Esta comprobación evita duplicar el historial, por lo que cambiar la semilla no sirve para agregar otra serie mientras esos clientes sigan en la base.

## Privacidad y Permanencia

PostgreSQL conserva los datos que la aplicación necesita entre solicitudes y despliegues. Entre ellos están el catálogo de repuestos y sus precios y stock, modelos de auto y compatibilidades; las cuentas de clientes y vendedores; los hashes de contraseñas y el estado de verificación; las direcciones, carritos, favoritos y alertas; los pedidos, sus artículos, direcciones de envío, estados e información del pago; y los datos operativos del dashboard, como el uso de IA y los resúmenes guardados. Las restricciones y relaciones de la base vinculan estos registros, por ejemplo, los artículos de un pedido con el pedido y los repuestos correspondientes.

Las imágenes de los repuestos no se guardan como contenido binario en PostgreSQL. Son archivos estáticos del frontend, ubicados en `frontend/public/repuestos/`, que se incluyen y sirven como recursos de la aplicación desplegada en Vercel. El modelo de repuesto en la base almacena información de producto, no el archivo de imagen. Por eso, actualizar el despliegue del frontend puede cambiar esos recursos sin modificar los registros del catálogo, y una copia de la base por sí sola no incluye las imágenes.

Los secretos y credenciales tampoco son registros de la base ni archivos que deban incluirse en el repositorio. Se proporcionan al backend mediante variables de entorno: por ejemplo, `DATABASE_URL`, `SECRET_KEY`, credenciales SMTP, claves de Mercado Pago, la clave de Gemini y el secreto de las tareas programadas. En Vercel se configuran para el servicio del backend; localmente se usan en el entorno de ejecución, normalmente desde un `.env` que no se sube a Git. El frontend no debe recibir secretos del backend.

En particular, Mercado Pago procesa los pagos: la tienda conserva la información necesaria para representar el pedido y su estado de pago, pero no almacena números de tarjeta. Del mismo modo, las contraseñas de usuario se persisten como hashes, no como texto legible. Las cuentas, compras y clientes generados por los scripts sí quedan en la base hasta que se eliminen mediante un procedimiento explícito; no desaparecen automáticamente al terminar una prueba o reiniciar Vercel.
