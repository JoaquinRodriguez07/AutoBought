# Diagrama de componentes

Vista interna de Frontend y Backend.

```mermaid
---
config:
  theme: mc
  layout: dagre
---
flowchart TB
    Cliente@{ img: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0MCcgaGVpZ2h0PSc2NCcgdmlld0JveD0nMCAwIDQwIDY0Jz48ZyBmaWxsPSdub25lJyBzdHJva2U9JyM1YTMyMDAnIHN0cm9rZS13aWR0aD0nMi41JyBzdHJva2UtbGluZWNhcD0ncm91bmQnPjxjaXJjbGUgY3g9JzIwJyBjeT0nMTAnIHI9JzgnIGZpbGw9JyNmZmY0ZTAnLz48bGluZSB4MT0nMjAnIHkxPScxOCcgeDI9JzIwJyB5Mj0nNDInLz48bGluZSB4MT0nNCcgeTE9JzI3JyB4Mj0nMzYnIHkyPScyNycvPjxsaW5lIHgxPScyMCcgeTE9JzQyJyB4Mj0nNicgeTI9JzYyJy8+PGxpbmUgeDE9JzIwJyB5MT0nNDInIHgyPSczNCcgeTI9JzYyJy8+PC9nPjwvc3ZnPg==", label: "Cliente", pos: "b", w: 40, h: 64, constraint: "on" }
    Empleado@{ img: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0MCcgaGVpZ2h0PSc2NCcgdmlld0JveD0nMCAwIDQwIDY0Jz48ZyBmaWxsPSdub25lJyBzdHJva2U9JyM1YTMyMDAnIHN0cm9rZS13aWR0aD0nMi41JyBzdHJva2UtbGluZWNhcD0ncm91bmQnPjxjaXJjbGUgY3g9JzIwJyBjeT0nMTAnIHI9JzgnIGZpbGw9JyNmZmY0ZTAnLz48bGluZSB4MT0nMjAnIHkxPScxOCcgeDI9JzIwJyB5Mj0nNDInLz48bGluZSB4MT0nNCcgeTE9JzI3JyB4Mj0nMzYnIHkyPScyNycvPjxsaW5lIHgxPScyMCcgeTE9JzQyJyB4Mj0nNicgeTI9JzYyJy8+PGxpbmUgeDE9JzIwJyB5MT0nNDInIHgyPSczNCcgeTI9JzYyJy8+PC9nPjwvc3ZnPg==", label: "Empleado", pos: "b", w: 40, h: 64, constraint: "on" }

    subgraph Vercel["Vercel"]
        subgraph FE["Frontend — React"]
            Pantallas["«component»<br/><b>Pantallas Cliente</b><br/>catálogo · carrito · cuenta"]:::component
            PanelEmp["«component»<br/><b>Panel Empleado</b><br/>dashboard · gestión"]:::planned
            Estado["«component»<br/><b>Estado y Sesión</b><br/>CartContext · auth.js"]:::component
            ApiCli["«component»<br/><b>Cliente API</b><br/>api.js"]:::component
        end

        subgraph BE["Backend — FastAPI"]
            API["«component»<br/><b>API REST /api/v1</b><br/>auth · catálogo · carrito"]:::component
            Nuevos["«component»<br/><b>Pedidos · Pagos · Gestión</b>"]:::planned
            Seg["«component»<br/><b>Seguridad</b><br/>JWT · bcrypt"]:::component
            Logica["«component»<br/><b>Lógica de negocio</b><br/>CRUD"]:::component
            ORM["«component»<br/><b>Acceso a datos</b><br/>SQLAlchemy"]:::component
        end
    end

    subgraph ServidorOracle["Servidor Oracle"]
        DB[("Base de Datos<br/>(PostgreSQL)")]:::database
    end

    Pasarela["«component»<br/><b>Pasarela de Pagos</b>"]:::external

    Cliente --> Pantallas
    Empleado -.-> PanelEmp

    Pantallas --> Estado
    Pantallas --> ApiCli
    Estado --> ApiCli
    PanelEmp -.-> ApiCli

    ApiCli ==>|"REST / JSON · HTTPS<br/>Bearer JWT"| API
    ApiCli -.-> Nuevos

    API --> Seg
    API --> Logica
    Nuevos -.-> Logica
    Logica --> ORM

    ORM ==>|"SQL"| DB
    Nuevos -.->|"API de pagos"| Pasarela

    classDef actor fill:#fff4e0,stroke:#d9822b,stroke-width:2px,color:#5a3200
    classDef component fill:#e3f0ff,stroke:#2f6fbf,stroke-width:2px,color:#0b2a52
    classDef planned fill:#ffffff,stroke:#2f6fbf,stroke-width:2px,stroke-dasharray:6 4,color:#0b2a52
    classDef external fill:#f1f1f1,stroke:#7a7a7a,stroke-width:2px,stroke-dasharray:5 3,color:#333
    classDef database fill:#e6f6ea,stroke:#2e8b57,stroke-width:2px,color:#0f3d24

    style Cliente fill:none,stroke:none
    style Empleado fill:none,stroke:none
    style Vercel fill:#fafafa,stroke:#000,stroke-width:1px
    style FE fill:#f7fbff,stroke:#2f6fbf,stroke-width:1px
    style BE fill:#f7fbff,stroke:#2f6fbf,stroke-width:1px
    style ServidorOracle fill:#fafafa,stroke:#c74634,stroke-width:1px
```

**Leyenda:** borde sólido = implementado · borde punteado azul = planificado ·
gris punteado = sistema externo.
