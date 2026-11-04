import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { VehicleProvider } from './context/VehicleContext.jsx'
import { PitProvider } from './context/PitContext.jsx'
import { PedidosProvider } from './context/PedidosContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <VehicleProvider>
          <PitProvider>
            <PedidosProvider>
              <Toaster position="top-right" />
              <App />
            </PedidosProvider>
          </PitProvider>
        </VehicleProvider>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
)
