# Secuencia: registro de cliente *(preliminar)*

> **Estado actual:** `Registro.jsx` valida el formulario y guarda el usuario
> **solo en `localStorage`** (`autobought-usuarios`, con la contraseña en texto
> plano). No existe endpoint de registro, así que esos usuarios no pueden iniciar
> sesión contra la API.
>
> **Ya existe y se reutiliza:** las validaciones del formulario (recuadro amarillo),
> `hash_password()` y `create_access_token()` en `core/security.py`, el modelo
> `Client` (herencia de `User`) y el auto-login posterior al registro
> (`App.jsx · registroExitoso()`).
>
> **Propuesto (a confirmar con el equipo):**
> - Endpoint `POST /api/v1/auth/register` con respuesta `201 { access_token }`, para
>   que el registro deje la sesión iniciada como hoy.
> - `409` si el email ya está registrado (también si dos registros compiten y salta
>   la restricción `UNIQUE`).
> - **Diferencias de datos a resolver:** el formulario pide `apellido` y `telefono`,
>   que no existen en `User`; y `User.username` es obligatorio y único, pero el
>   formulario no lo pide. Opciones: agregar columnas, guardar `name = nombre +
>   apellido`, y derivar `username` del email o pedirlo en el formulario.

```mermaid
---
config:
  theme: mc
---
sequenceDiagram
    autonumber
    actor C as Cliente

    box rgb(227,240,255) Frontend
        participant P as Pantallas<br/>(Registro)
        participant S as Estado y Sesión
        participant A as Cliente API
    end

    box rgb(247,251,255) Backend
        participant R as API REST
        participant Seg as Seguridad
        participant L as Lógica de negocio
    end

    participant DB as Base de Datos

    C->>P: Completa nombre, apellido, email, teléfono,<br/>contraseña, confirmación y acepta términos

    rect rgb(255,248,220)
        Note over P: Validaciones del formulario — implementadas en Registro.jsx
        alt Campos vacíos
            P-->>C: "Completá todos los campos."
        else Email sin "@"
            P-->>C: "Ingresá un correo electrónico válido."
        else Contraseña de menos de 6 caracteres
            P-->>C: "La contraseña debe tener al menos 6 caracteres."
        else Las contraseñas no coinciden
            P-->>C: "Las contraseñas no coinciden."
        else No aceptó los términos
            P-->>C: "Tenés que aceptar los términos y condiciones."
        end
    end

    opt Formulario válido
        P->>A: registrar({ nombre, apellido, email, telefono, password })
        A->>R: POST /api/v1/auth/register
        R->>R: Validar esquema (EmailStr, largo de contraseña)

        alt Datos inválidos
            R-->>A: 422 Datos inválidos
        else Datos válidos
            R->>L: ¿Existe un usuario con ese email?
            L->>DB: SELECT user WHERE email
            DB-->>L: usuario o nada
            L-->>R: resultado

            alt Email ya registrado
                R-->>A: 409 "Ya existe una cuenta con ese correo."
            else Email disponible
                R->>Seg: hash_password(password) (bcrypt)
                Seg-->>R: hash
                R->>L: Crear cliente
                L->>DB: INSERT user (user_type = "client") · INSERT client · COMMIT
                alt Violación de UNIQUE (registro simultáneo)
                    DB-->>L: error de integridad
                    L->>DB: ROLLBACK
                    L-->>R: email duplicado
                    R-->>A: 409 "Ya existe una cuenta con ese correo."
                else Insert correcto
                    DB-->>L: cliente creado
                    L-->>R: cliente
                    R->>Seg: create_access_token(sub, user_type = "client")
                    Seg-->>R: token
                    R-->>A: 201 { access_token, token_type }
                end
            end
        end

        Note over S,A: Manejo de la respuesta en el frontend
        alt 201
            A-->>P: token
            P->>S: registroExitoso(sesión)
            Note over P,S: App.jsx · registroExitoso() (ya existe)
            S->>S: Guardar sesión en localStorage
            par Carga del carrito (en segundo plano)
                S->>A: cargarCarrito() → GET /api/v1/cart
            and Navegación
                P-->>C: Redirige al inicio con la sesión iniciada
            end
        else 409 / 422 / error de red
            A-->>P: error
            P-->>C: Muestra el mensaje de error
        end
    end
```
