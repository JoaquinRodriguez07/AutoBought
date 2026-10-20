# Secuencia: registro de cliente

> El formulario pide nombre y apellido por separado, pero el backend guarda un
> único `name`: el frontend los envía unidos. El registro devuelve el mismo token
> que el login, así que la sesión queda iniciada.

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

    alt Campos vacíos
        P-->>C: "Completá todos los campos."
    else Email con formato inválido
        P-->>C: "Ingresá un correo electrónico válido."
    else Teléfono que no es uruguayo
        P-->>C: "Ingresá un teléfono uruguayo válido (ej: 099 123 456)."
    else Contraseña de menos de 8 caracteres
        P-->>C: "La contraseña debe tener al menos 8 caracteres."
    else Las contraseñas no coinciden
        P-->>C: "Las contraseñas no coinciden."
    else No aceptó los términos
        P-->>C: "Tenés que aceptar los términos y condiciones."
    else Formulario válido
        P->>A: registrar({ nombre, apellido, email, telefono, password })
        A->>R: POST /api/v1/auth/register<br/>{ name: nombre + apellido, email, phone, password }
        R->>R: Validar esquema (EmailStr, contraseña de 8 a 72 bytes,<br/>nombre no vacío, normalizar teléfono uruguayo)

        alt Datos inválidos
            R-->>A: 422
        else Datos válidos
            R->>L: get_user_by_email(email)
            L->>DB: SELECT user WHERE email
            DB-->>L: usuario o nada
            L-->>R: resultado

            alt Email ya registrado
                R-->>A: 409 "El correo ya está en uso."
            else Email disponible
                R->>Seg: hash_password(password) (bcrypt)
                Seg-->>R: hash
                R->>L: create_client(name, email, hash, phone)
                L->>DB: INSERT user (user_type = "client") · INSERT client · COMMIT
                alt Violación de UNIQUE (registro simultáneo)
                    DB-->>L: IntegrityError
                    L-->>R: IntegrityError
                    R->>DB: ROLLBACK
                    R-->>A: 409 "El correo ya está en uso."
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
            P->>S: decodeToken(access_token)
            S-->>P: userId, userType
            P->>S: registroExitoso(sesión con nombre, email y teléfono)
            Note over P,S: App.jsx · registroExitoso()
            S->>S: Guardar sesión en localStorage
            par Carga del carrito (en segundo plano)
                S->>A: cargarCarrito() → GET /api/v1/cart
            and Navegación
                P-->>C: Redirige al inicio con la sesión iniciada
            end
        else 409 / 422 / error de red
            A-->>P: error ("Revisá los datos ingresados." en el 422)
            P-->>C: Muestra el mensaje de error
        end
    end
```
