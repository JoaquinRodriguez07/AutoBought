# Ingenier-a-de-software-II

## Docker Compose

Copiar `.env.example` a `.env` en la raíz del repositorio y ejecutar
`chmod 600 .env`. Completar `POSTGRES_PASSWORD`, `DATABASE_URL` y
`REMOTE_DATABASE_URL` con credenciales nuevas antes de ejecutar
`docker compose up --build`. `.env` está ignorado por Git; no compartirlo.
Usar contraseñas distintas para las bases local y remota. En las URLs,
codificar los caracteres especiales de las contraseñas (percent-encoding).
Si un valor contiene `$`, escribirlo entre comillas simples en `.env`
para evitar la interpolación de Compose.

Los frontends están disponibles en `http://127.0.0.1:5173` (base local) y
`http://127.0.0.1:5174` (base remota). Los backends escuchan en los puertos
locales 8000 y 8001, respectivamente.

### Rotación de la contraseña expuesta

La contraseña anterior debe reemplazarse en **ambas bases existentes**.
Cambiar `.env` no cambia la contraseña almacenada en PostgreSQL:
`POSTGRES_PASSWORD` solo se aplica al inicializar un volumen nuevo.

1. Con acceso administrativo a cada base, abrir `psql` y ejecutar
   `\password ingsoft2` para asignar una contraseña nueva mediante el prompt.
   Para la base local iniciada con Compose:
   `docker compose exec postgres psql -U ingsoft2 -d ingsoft2db`.
   Para la remota, usar una conexión administrativa autorizada.
2. Actualizar `.env` y los demás clientes que usen esas credenciales.
   `POSTGRES_PASSWORD` y la contraseña de `DATABASE_URL` deben coincidir.
3. Recrear los servicios con
   `docker compose up -d --force-recreate postgres backend backend-remote`.
4. Verificar conexiones nuevas con las credenciales nuevas y comprobar que
   la contraseña anterior ya no permite autenticarse por contraseña en
   ninguna de las dos bases.

No eliminar el volumen para rotar la contraseña: contiene los datos locales.
