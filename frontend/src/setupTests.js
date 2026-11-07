// Configuración común de los tests de Jest.

import '@testing-library/jest-dom'

import { TextDecoder, TextEncoder } from 'util'

global.TextDecoder = TextDecoder
global.TextEncoder = TextEncoder