// Punto de entrada: monta la aplicación en el navegador.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { VehicleProvider } from './context/VehicleContext.jsx'
import { PitProvider } from './context/PitContext.jsx'
import { OrdersProvider } from './context/OrdersContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <VehicleProvider>
          <PitProvider>
            <OrdersProvider>
              <Toaster position="top-right" />
              <App />
            </OrdersProvider>
          </PitProvider>
        </VehicleProvider>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
)
