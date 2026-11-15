// Pantalla de los repuestos favoritos.

import { useGenericImage } from "./mapPart";
import Navbar from "./Navbar";
import AddToCartButton from "./AddToCartButton";
import { CartIcon, HeartIcon } from "./Icons";
import PageHeader from "./PageHeader";

export default function Favorites({
  onHome, onCatalogo, onLogin, onBrands, onCart, onFavorites,
  favoritesQuantity, favorites, onToggleFavorite,
  onDetail,
  sessionUser, onProfile, onAddresses, onHistory, onCloseSession, onDeleteAccount,
}) {
  const price = (v) => `$${v.toLocaleString("es-UY")}`;

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-gray-900 font-sans">
      <Navbar currentPage="favorites" onHome={onHome} onCatalogo={onCatalogo} onLogin={onLogin}
        onBrands={onBrands} onCart={onCart} onFavorites={onFavorites}
        sessionUser={sessionUser} onProfile={onProfile} onAddresses={onAddresses}
        onHistory={onHistory} onCloseSession={onCloseSession} onDeleteAccount={onDeleteAccount}
        favoritesQuantity={favoritesQuantity} />

      <main>
        <PageHeader
          migas={[{ texto: "Inicio", goTo: onHome }, "Favoritos"]}
          title="Mis favoritos"
          description="Los repuestos que guardaste para tener a mano."
        />

        <div className="max-w-[1100px] mx-auto px-5 md:px-10 pb-14 box-content">

          {favorites.length === 0 ? (
            <div className="mt-8 bg-white border border-gray-200 rounded-xl px-6 py-16 md:p-16 text-center">
              <span className="mx-auto mb-4 w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center">
                <HeartIcon className="w-8 h-8" />
              </span>
              <h2 className="text-xl font-black">Todavía no tenés favoritos</h2>
              <p className="text-sm text-gray-400 mt-2">Tocá el corazón de un producto para guardarlo.</p>
              <button onClick={() => onCatalogo()}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white px-7 py-3 rounded-md text-sm font-black">
                Explorar repuestos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
              {favorites.map((product) => (
                <div key={product.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs hover:shadow-lg transition">
                  <div className="relative h-[190px] bg-white">
                    <img onError={useGenericImage} src={product.image} alt={product.displayName} className="w-full h-full object-contain p-3" />
                    <button onClick={() => onToggleFavorite(product)}
                      aria-label="Quitar de favoritos"
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md text-orange-500 flex items-center justify-center transition hover:scale-105">
                      <HeartIcon full className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-4">
                    <p className="text-xs uppercase tracking-wide text-orange-500 font-black">{product.fabricante}</p>
                    <button onClick={() => onDetail(product)} className="text-left text-sm font-bold mt-1 hover:text-orange-500">
                      {product.displayName}
                    </button>
                    <p className="text-lg font-black mt-3">{price(product.price)}</p>
                    <AddToCartButton product={product} textWithoutStock="Sin stock"
                      className="w-full mt-4 flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold">
                      <CartIcon />
                      Agregar al carrito
                    </AddToCartButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
