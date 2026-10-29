/**
 * Footer
 * ==========================================
 * Pie común de todo el sitio (App.jsx lo pone debajo de cada página,
 * menos en las de iniciar sesión y registro): la marca y los accesos más
 * usados, en un solo bloque.
 *
 * Recibe los mismos on* de navegación que la Navbar (propsNavbar).
 */

const ANIO = new Date().getFullYear();

// Las marcas más buscadas: llevan al catálogo filtrado por esa marca (el
// nombre es el mismo que en el backend). Cuatro, como los accesos de
// "Mi cuenta", para que las columnas queden parejas.
const MARCAS_POPULARES = ["Volkswagen", "Chevrolet", "Fiat", "Renault"];

function Columna({ titulo, children }) {
  return (
    <div>
      <p className="text-white text-sm font-black">{titulo}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-gray-400">{children}</ul>
    </div>
  );
}

function Enlace({ children, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="hover:text-orange-400 transition"
      >
        {children}
      </button>
    </li>
  );
}

export default function Footer({
  usuario,
  onCatalogo,
  onMarcas,
  onLogin,
  onHistorial,
  onFavoritos,
  onCarrito,
}) {
  return (
    <footer className="bg-[#151719] text-white">
      <div className="max-w-[1100px] mx-auto px-6 md:px-10 py-12 grid grid-cols-2 md:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr] gap-8">

        <div className="col-span-2 md:col-span-1">
          <p className="text-lg font-black italic">
            Auto<span className="text-orange-500">Bought</span>
          </p>
          <p className="text-sm text-gray-400 mt-1 max-w-[260px]">
            Repuestos para tu auto, de las mejores marcas, con envío a todo Uruguay.
          </p>
          <p className="text-xs text-gray-500 mt-4">
            © {ANIO} AutoBought · Hecho en Uruguay
          </p>
        </div>

        <Columna titulo="Comprar">
          <Enlace onClick={() => onCatalogo?.()}>Catálogo de repuestos</Enlace>
          <Enlace onClick={onMarcas}>Todas las marcas</Enlace>
        </Columna>

        <Columna titulo="Marcas populares">
          {MARCAS_POPULARES.map((marca) => (
            <Enlace key={marca} onClick={() => onCatalogo?.(null, null, { marca })}>
              {marca}
            </Enlace>
          ))}
        </Columna>

        <Columna titulo="Mi cuenta">
          <Enlace onClick={onLogin}>Mi perfil</Enlace>
          {/* Sin sesión, "Mis pedidos" lleva a iniciar sesión. */}
          <Enlace onClick={usuario ? onHistorial : onLogin}>Mis pedidos</Enlace>
          <Enlace onClick={onFavoritos}>Mis favoritos</Enlace>
          <Enlace onClick={onCarrito}>Mi carrito</Enlace>
        </Columna>

        <Columna titulo="Ayuda">
          <li>
            <a
              href="mailto:autobought.notificaciones@gmail.com"
              className="hover:text-orange-400 transition"
            >
              Escribinos por mail
            </a>
          </li>
          <li>Envíos a todo el país</li>
          <li>Despachamos de lunes a viernes</li>
        </Columna>

      </div>
    </footer>
  );
}
