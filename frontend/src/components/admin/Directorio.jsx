import { useState } from 'react';
import Segmentado from './Segmentado';
import Clientes from './Clientes';
import PropietariosTabla from './PropietariosTabla';

/** Pestaña "Clientes" del panel: clientes (CRM) y propietarios. */
export default function Directorio({ onError }) {
  const [vista, setVista] = useState('clientes');
  return (
    <div className="space-y-4">
      <Segmentado etiqueta="Directorio" valor={vista} onCambiar={setVista} opciones={[['clientes', 'Clientes'], ['propietarios', 'Propietarios']]} />
      {vista === 'clientes' ? <Clientes onError={onError} /> : <PropietariosTabla onError={onError} />}
    </div>
  );
}
