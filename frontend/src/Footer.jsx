/**
 * Footer
 * ==========================================
 * Pie común de todo el sitio (App.jsx lo pone debajo de cada página,
 * menos en las de iniciar sesión y registro): la marca y los accesos más
 * usados, en un solo bloque.
 *
 * Recibe los mismos on* de navegación que la Navbar (propsNavbar).
 */

import { BoxIcon, TruckIcon, EnvelopeIcon } from "./Icons";

const YEAR = new Date().getFullYear();

// Las marcas más buscadas: llevan al catálogo filtrado por esa marca (el
// nombre es el mismo que en el backend). Cuatro, como los accesos de
// "Mi cuenta", para que las columnas queden parejas.
// El mail de contacto se puede cambiar con VITE_EMAIL_CONTACTO sin tocar el código.
const CONTACT_EMAIL =
  import.meta.env.VITE_EMAIL_CONTACTO || "autobought.notificaciones@gmail.com";

const POPULAR_BRANDS = ["Volkswagen", "Chevrolet", "Fiat", "Renault"];

function Column({ title, children }) {
  return (
    <div>
      <p className="text-white text-sm font-black">{title}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-gray-400">{children}</ul>
    </div>
  );
}

function FooterLink({ children, onClick }) {
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
  sessionUser,
  onCatalogo,
  onBrands,
  onLogin,
  onAccount,
  onOrders,
  onFavorites,
  onCart,
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
            © {YEAR} AutoBought · Hecho en Uruguay
          </p>
        </div>

        <Column title="Comprar">
          <FooterLink onClick={() => onCatalogo?.()}>Catálogo de repuestos</FooterLink>
          <FooterLink onClick={onBrands}>Todas las marcas</FooterLink>
        </Column>

        <Column title="Marcas populares">
          {POPULAR_BRANDS.map((marca) => (
            <FooterLink key={marca} onClick={() => onCatalogo?.(null, null, { marca })}>
              {marca}
            </FooterLink>
          ))}
        </Column>

        <Column title="Mi cuenta">
          {/* Sin sesión, la cuenta y las compras llevan a iniciar sesión. */}
          <FooterLink onClick={sessionUser ? onAccount : onLogin}>Mi cuenta</FooterLink>
          <FooterLink onClick={sessionUser ? onOrders : onLogin}>Mis compras</FooterLink>
          <FooterLink onClick={onFavorites}>Mis favoritos</FooterLink>
          <FooterLink onClick={onCart}>Mi carrito</FooterLink>
        </Column>

        {/* El mail es un link; lo demás son datos (con ícono, para que
            no parezcan links). */}
        <Column title="Ayuda">
          <li>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex items-center gap-2 hover:text-orange-400 transition"
            >
              <EnvelopeIcon className="w-4 h-4 shrink-0 text-orange-500" />
              Escribinos por mail
            </a>
          </li>
          <li className="flex items-center gap-2 text-gray-500">
            <TruckIcon className="w-4 h-4 shrink-0" />
            Envíos a todo el país
          </li>
          <li className="flex items-center gap-2 text-gray-500">
            <BoxIcon className="w-4 h-4 shrink-0" />
            Despachamos de lunes a viernes
          </li>
        </Column>

      </div>
    </footer>
  );
}
