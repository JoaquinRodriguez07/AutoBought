// Configuración común de los tests de Jest.

import '@testing-library/jest-dom'

import { TextDecoder, TextEncoder } from 'util'

global.TextDecoder = TextDecoder
global.TextEncoder = TextEncoder

// Cada test arranca sin vehículo activo guardado de un test anterior
// (VehicleContext lo guarda en sessionStorage).
afterEach(() => {
  sessionStorage.removeItem('autobought-vehiculo')
})
