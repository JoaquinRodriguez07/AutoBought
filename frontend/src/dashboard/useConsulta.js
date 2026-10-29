import { useCallback, useEffect, useState } from "react";

// Pide datos con `pedir` y los vuelve a pedir cuando cambia `clave` (por
// ejemplo, los filtros). Si llega una respuesta vieja después de una más
// nueva, se descarta. `recargar` vuelve a pedir con la misma clave.
export function useConsulta(pedir, clave) {
  const [estado, setEstado] = useState({ datos: null, cargando: true, error: null });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado((anterior) => ({ ...anterior, cargando: true, error: null }));

    pedir()
      .then((datos) => vigente && setEstado({ datos, cargando: false, error: null }))
      .catch((error) => vigente && setEstado({ datos: null, cargando: false, error: error.message }));

    return () => {
      vigente = false;
    };
    // `pedir` se arma en cada render: lo que cambia el pedido es `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  return { ...estado, recargar };
}
