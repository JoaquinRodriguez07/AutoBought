import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import "./index.css";
import App from "./App.jsx";
import { VehicleProvider } from "./VehicleContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <VehicleProvider>
        <CartProvider>
          <Toaster position="top-right" />
          <App />
        </CartProvider>
      </VehicleProvider>
    </BrowserRouter>
  </StrictMode>,
);
