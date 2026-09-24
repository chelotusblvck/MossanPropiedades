import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Loader2, MessageCircle, Mail, ExternalLink } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { fechaLarga, desdeUTC } from '../../lib/fechas';
import { infoModalidad } from '../../lib/modalidades';
import { formatRut } from '../../lib/clientes';

const ESTADOS = {
  nueva: { label: 'Nueva', clase: 'bg-rose-100 text-rose-800 ring-rose-200' },
  contactada: { label: 'Contactada', clase: 'bg-amber-100 text-amber-800 ring-amber-200' },
  agendada: { label: 'Agendada', clase: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  descartada: { label: 'Descartada', clase: 'bg-slate-100 text-slate-500 ring-slate-200' },
};
const FRANJA = { manana: 'mañana', tarde: 'tarde', indiferente: 'cualquier horario' };
const fmtRecibida = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Fila({ v, onGuardar }) {
  const [notas, setNotas] = useState(v.notas_internas ?? '');
  useEffect(() => {
    setNotas(v.notas_internas ?? '');
  }, [v.notas_internas]);
  const saludo = `Hola ${v.nombre.split(' ')[0]}, te escribo por tu solicitud para visitar "${v.propiedad_titulo}".`;
  const reprogramacion = v.reprogramacion ? JSON.parse(v.reprogramacion) : null;

  return (
    <tr className={`align-top ${v.estado === 'descartada' ? 'opacity-60' : ''}`}>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmtRecibida.format(desdeUTC(v.creado_en))}</td>
      <td className="max-w-60 px-4 py-3">
        <Link to={`/propiedad/${v.propiedad_id}`} target="_blank" className="flex items-center gap-1 font-medium text-slate-800 hover:text-brand-700">
          <span className="truncate" title={v.propiedad_titulo}>{v.propiedad_titulo}</span> <ExternalLink className="size-3 shrink-0" />
        </Link>
        <p className="text-xs text-slate-500">{v.propiedad_comuna} · {infoModalidad(v.propiedad_modalidad).label}</p>
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{v.nombre}</p>
        {v.cliente_rut && <p className="text-xs text-slate-500">RUT {formatRut(v.cliente_rut)}</p>}
        <div className="flex flex-wrap gap-x-3 text-xs">
          <a href={`https://wa.me/${v.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(saludo)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline">
            <MessageCircle className="size-3" /> {v.telefono}
          </a>
          <a href={`mailto:${v.email}`} className="flex items-center gap-1 text-slate-500 hover:underline"><Mail className="size-3" /> {v.email}</a>
        </div>
        {v.mensaje && <p className="mt-1 max-w-xs text-xs italic text-slate-500">“{v.mensaje}”</p>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
        {v.fecha_preferida ? fechaLarga(v.fecha_preferida) : <span className="text-slate-400">Sin fecha</span>}
        <p className="text-xs text-slate-500">{FRANJA[v.franja] ?? ''}</p>
        {reprogramacion && v.estado !== 'descartada' && (
          <div className="mt-1.5 max-w-52 whitespace-normal rounded-md bg-violet-50 px-2 py-1 text-xs text-violet-800 ring-1 ring-violet-200">
            🔁 Pide reprogramar: <b>{reprogramacion.fecha_preferida ? fechaLarga(reprogramacion.fecha_preferida) : 'sin fecha'}</b>, {FRANJA[reprogramacion.franja]}
            {reprogramacion.mensaje && <span className="block italic">“{reprogramacion.mensaje}”</span>}
          </div>
        )}
        {v.cancelada_por_cliente_en && (
          <p className="mt-1.5 text-xs font-semibold text-rose-600">❌ Cancelada por el cliente</p>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          value={v.estado}
          onChange={(e) => onGuardar(v, { estado: e.target.value })}
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ${ESTADOS[v.estado].clase}`}
          aria-label="Estado de la solicitud"
        >
          {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.label}</option>)}
        </select>
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={() => notas !== (v.notas_internas ?? '') && onGuardar(v, { notas_internas: notas })}
          placeholder="Notas internas"
          maxLength={1000}
          className="mt-2 block w-44 rounded-md border border-slate-200 px-2 py-1 text-xs"
        />
      </td>
    </tr>
  );
}

export default function VisitasTable({ onError, onCambio }) {
  const [estado, setEstado] = useState('');
  const [visitas, setVisitas] = useState(null);

  const cargar = useCallback(() => {
    adminApi.visitas({ estado }).then(setVisitas).catch(onError);
  }, [estado, onError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (v, cambios) => {
    try {
      await adminApi.actualizarVisita(v.id, cambios);
      cargar();
      onCambio?.();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-bold text-slate-800">Solicitudes de visita</h2>
          <p className="text-xs text-slate-500">Enviadas desde las fichas de venta y arriendo mensual.</p>
        </div>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.label}s</option>)}
        </select>
      </div>
      {!visitas ? (
        <div className="grid place-items-center p-10"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
      ) : visitas.length === 0 ? (
        <p className="p-8 text-center text-slate-500">No hay solicitudes con este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Recibida</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Interesado</th>
                <th className="px-4 py-3">Preferencia</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visitas.map((v) => <Fila key={v.id} v={v} onGuardar={guardar} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
