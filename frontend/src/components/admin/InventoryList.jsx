import { useState } from 'react';
import { ChevronDown, Eye, EyeOff, ExternalLink, Megaphone, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { formatUF, formatCLP } from '../../lib/format';
import { fechaLarga } from '../../lib/fechas';
import { MODALIDADES, ORDEN_MODALIDADES, infoModalidad } from '../../lib/modalidades';
import MenuAcciones from './MenuAcciones';

const ETIQUETA_NO_DISPONIBLE = { venta: 'Vendida', arriendo_anual: 'Arrendada', arriendo_marzo_diciembre: 'Arrendada' };

/**
 * variante:
 *  - "activas":   publicadas; modalidad y disponibilidad editables en la fila, el resto en el menú ⋯
 *  - "inactivas": ocultas del sitio (borradores o desactivadas): activar, editar o eliminar
 *  - "papelera":  eliminadas (borrado lógico): sólo restaurar
 */
function Fila({ p, variante, onCambiar, onMarketing, onEditar, onEstado, onEliminar, guardando }) {
  const modalidad = infoModalidad(p.modalidad);
  const precio = p.moneda_original === 'UF' ? formatUF(p.precio_uf) : formatCLP(p.precio_clp);
  const atenuada = variante !== 'activas' || !p.disponible;

  const acciones =
    variante === 'papelera'
      ? [{ label: 'Restaurar', icon: RotateCcw, onClick: () => onEstado(p, 'restaurar') }]
      : [
          variante === 'inactivas' && { label: 'Activar (publicar)', icon: Eye, onClick: () => onEstado(p, 'activar') },
          onEditar && { label: 'Editar ficha técnica', icon: Pencil, onClick: () => onEditar(p) },
          variante === 'activas' && {
            label: 'Ficha de marketing',
            icon: Megaphone,
            onClick: () => onMarketing(p),
            deshabilitado: !p.disponible,
            motivo: 'Sólo para propiedades libres',
          },
          variante === 'activas' && p.disponible && { label: 'Ver en el sitio', icon: ExternalLink, to: `/propiedad/${p.id}` },
          variante === 'activas' && { label: 'Desactivar (ocultar)', icon: EyeOff, onClick: () => onEstado(p, 'desactivar'), separador: true },
          { label: 'Eliminar…', icon: Trash2, peligro: true, onClick: () => onEliminar(p), separador: variante === 'inactivas' },
        ];

  return (
    <li className={`flex items-center gap-x-4 gap-y-3 p-4 max-sm:flex-wrap ${atenuada ? 'bg-slate-50' : ''}`}>
      <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-3">
        {p.imagenes?.[0] ? (
          <img src={p.imagenes[0]} alt="" loading="lazy" className={`size-14 shrink-0 rounded-lg object-cover ${atenuada ? 'grayscale' : ''}`} />
        ) : (
          <div className="size-14 shrink-0 rounded-lg bg-slate-200" />
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800" title={p.titulo}>{p.titulo}</p>
          <p className="truncate text-sm text-slate-500">
            {p.comuna} · <span className="whitespace-nowrap font-medium text-slate-700">{precio}{modalidad.sufijo && ` ${modalidad.sufijo}`}</span>
            {p.origen === 'portalinmobiliario' && <span className="ml-2 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-bold text-yellow-800">PORTAL</span>}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 max-sm:ml-auto">
        {variante === 'activas' ? (
          <>
            <select
              value={p.modalidad}
              disabled={guardando}
              onChange={(e) => onCambiar(p, { modalidad: e.target.value })}
              className="w-40 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
              aria-label="Modalidad"
            >
              {ORDEN_MODALIDADES.map((m) => <option key={m} value={m}>{MODALIDADES[m].label}</option>)}
            </select>
            <button
              disabled={guardando}
              onClick={() => onCambiar(p, { disponible: !p.disponible })}
              className={`w-28 rounded-full px-3 py-1.5 text-xs font-bold uppercase transition ${
                p.disponible ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
              }`}
              title="Cambiar disponibilidad"
            >
              {p.disponible ? 'Libre' : ETIQUETA_NO_DISPONIBLE[p.modalidad] ?? 'No disponible'}
            </button>
          </>
        ) : variante === 'inactivas' ? (
          <span className="whitespace-nowrap rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
            {modalidad.label} · Oculta
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs text-slate-500">Eliminada el {fechaLarga(p.eliminada_en.slice(0, 10))}</span>
        )}
        <MenuAcciones items={acciones} disabled={guardando} etiqueta={`Acciones: ${p.titulo}`} />
      </div>
    </li>
  );
}

export default function InventoryList({
  titulo, descripcion, propiedades, variante = 'activas', plegable = false,
  onCambiar, onMarketing, onEditar, onEstado, onEliminar, guardandoId,
}) {
  const [abierta, setAbierta] = useState(!plegable);
  const libres = propiedades.filter((p) => p.disponible).length;
  const Encabezado = plegable ? 'button' : 'div';

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <Encabezado
        {...(plegable && { type: 'button', onClick: () => setAbierta((a) => !a), 'aria-expanded': abierta })}
        className={`flex w-full items-center justify-between gap-3 p-4 text-left ${abierta ? 'border-b border-slate-200' : ''}`}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-bold text-slate-800">
            {plegable && <ChevronDown className={`size-4 text-slate-400 transition ${abierta ? '' : '-rotate-90'}`} />}
            {titulo}
          </h2>
          {descripcion && <p className="mt-0.5 text-xs text-slate-500">{descripcion}</p>}
        </div>
        <span className="shrink-0 text-sm text-slate-500">
          {variante === 'activas' ? (
            <><strong className="text-emerald-600">{libres}</strong> libres de {propiedades.length}</>
          ) : (
            <strong className="text-slate-700">{propiedades.length}</strong>
          )}
        </span>
      </Encabezado>
      {abierta &&
        (propiedades.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">
            {variante === 'papelera' ? 'La papelera está vacía.' : 'Sin propiedades en esta categoría.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {propiedades.map((p) => (
              <Fila
                key={p.id}
                p={p}
                variante={variante}
                onCambiar={onCambiar}
                onMarketing={onMarketing}
                onEditar={onEditar}
                onEstado={onEstado}
                onEliminar={onEliminar}
                guardando={guardandoId === p.id}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}
