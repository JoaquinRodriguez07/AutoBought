# Secuencia: registro de cliente

> El formulario pide nombre y apellido por separado, pero el backend guarda un
> único `name`: el frontend los envía unidos. El registro devuelve el mismo token
> que el login, así que la sesión queda iniciada.
>
> Las reglas de validación son las mismas en el frontend (`validaciones.js`, avisa
> antes de enviar) y en el backend (`core/validators.py`, la que vale):
> - **Nombre y apellido:** solo letras, espacios, apóstrofos y guiones; al menos 2 letras.
> - **Teléfono:** obligatorio y uruguayo.
> - **Contraseña:** al menos 8 caracteres (máximo 72 bytes), con al menos una letra
>   y un número; no puede ser una contraseña común ni contener el usuario del correo.

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

    P->>P: validarRegistro (todos los campos a la vez)

    alt Hay errores en el formulario
        P-->>C: Muestra el error debajo de cada campo<br/>(ej: "La contraseña tiene que tener al menos una letra y un número.")
    else Formulario válido
        P->>A: registrar({ nombre, apellido, email, telefono, password })
        A->>R: POST /api/v1/auth/register<br/>{ name: nombre + apellido, email, phone, password }
        R->>R: Validar esquema (EmailStr, nombre, teléfono uruguayo,<br/>password_segura: largo, letras y números, común, correo)

        alt Datos inválidos
            R-->>A: 422 { detail: [errores por campo] }
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
        else 422
            A-->>P: error con los mensajes por campo
            P-->>C: Muestra cada error debajo de su campo
        else 409 / error de red
            A-->>P: error
            P-->>C: Muestra el mensaje de error
        end
    end
```
