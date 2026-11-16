import Navbar from "./Navbar";
import TermsContent from "./TermsContent";

/**
 * Términos y condiciones (/terminos): la página a la que lleva el pie.
 * El texto está en TermsContent (el registro lo muestra en una ventana).
 *
 * Recibe las mismas props que la Navbar (propsNavbar de App.jsx).
 */
export default function TermsPage(propsNavbar) {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <Navbar {...propsNavbar} />

      <main className="pt-[105px] max-w-[800px] mx-auto px-5 pb-14">
        <h1 className="mt-8 mb-4 text-2xl font-black">Términos y condiciones</h1>
        <TermsContent />
      </main>
    </div>
  );
}
