import { useCallback, useEffect, useState } from "react";

// Pide datos con `pedir` y los vuelve a pedir cuando cambia `clave` (por
// ejemplo, los filtros). Si llega una respuesta vieja después de una más
// nueva, se descarta. `recargar` vuelve a pedir con la misma clave.
export function useQuery(request, key) {
  const [estado, setStatus] = useState({ info: null, loading: true, error: null });
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    setStatus((previous) => ({ ...previous, loading: true, error: null }));

    request()
      .then((info) => vigente && setStatus({ info, loading: false, error: null }))
      .catch((error) => vigente && setStatus({ info: null, loading: false, error: error.message }));

    return () => {
      vigente = false;
    };
    // `pedir` se arma en cada render: lo que cambia el pedido es `clave`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, vuelta]);

  const reload = useCallback(() => setVuelta((v) => v + 1), []);

  return { ...estado, reload };
}
