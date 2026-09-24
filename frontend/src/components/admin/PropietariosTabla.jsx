import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Search, Eye, Send, MessageCircle, Landmark, KeyRound } from 'lucide-react';
import { adminApi } from '../../lib/api';
import { desdeUTC } from '../../lib/fechas';
import { normalizarTexto } from '../../lib/clientes';
import MenuAcciones from './MenuAcciones';

const fmtFecha = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/** Propietarios registrados (cuentas del Portal de Propietarios), con acceso rápido a "ver como usuario". */
export default function PropietariosTabla({ onError }) {
  const navegar = useNavigate();
  const [lista, setLista] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [ocupado, setOcupado] = useState(null); // rut con una acción en curso
  const [aviso, setAviso] = useState(null);

  const cargar = () => adminApi.propietarios().then(setLista).catch(onError);
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(() => {
    const q = normalizarTexto(busqueda.trim());
    const digitos = q.replace(/[^0-9k]/g, '');
    return (lista ?? []).filter((p) => !q
      || normalizarTexto(`${p.nombre} ${p.email ?? ''}`).includes(q)
      || (digitos.length >= 3 && (p.rut.replace('-', '').toLowerCase().includes(digitos) || (p.telefono ?? '').replace(/\D/g, '').includes(digitos))));
  }, [lista, busqueda]);

  const verComo = async (p) => {
    setOcupado(p.rut);
    try {
      await adminApi.verComo('propietario', p.rut);
      navegar('/propietario');
    } catch (err) {
      onError(err);
      setOcupado(null);
    }
  };

  const enviarAcceso = async (p) => {
    const ventana = p.telefono ? window.open('about:blank', '_blank') : null; // antes de la petición: evita el bloqueo de ventanas
    setOcupado(p.rut);
    try {
      const r = await adminApi.bienvenidaPropietario(p.rut);
      if (r.whatsapp_url && ventana) ventana.location.href = r.whatsapp_url;
      else ventana?.close();
      setAviso(`Acceso enviado a ${p.nombre}${r.email ? ' por correo' : ''}${r.whatsapp_url ? ' y WhatsApp' : ''}.`);
      cargar();
    } catch (err) {
      ventana?.close();
      onError(err);
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
        <div>
          <h2 className="font-bold text-slate-800">Propietarios</h2>
          <p className="text-xs text-slate-500">Dueños de las propiedades en administración y su acceso al Portal de Propietarios.</p>
        </div>
        <label className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, RUT, celular o correo" aria-label="Buscar propietarios" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500" />
        </label>
      </div>
      {aviso && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{aviso}</p>}

      {!lista ? (
        <div className="grid place-items-center p-10"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
      ) : filtrados.length === 0 ? (
        <p className="p-10 text-center text-slate-500">{lista.length ? 'No hay propietarios con esa búsqueda.' : 'Aún no hay propietarios. Se registran al publicar una propiedad o al indicar el RUT del dueño en su ficha.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            {/* Anchos fijos por columna (table-fixed): ningún dato largo puede empujar ni tapar a las columnas
                vecinas; lo que no cabe se corta con "…" y se ve completo al pasar el mouse. "Propietario" toma el resto. */}
            <colgroup>
              <col />
              <col className="w-[210px]" />
              <col className="w-[110px]" />
              <col className="w-[250px]" />
              <col className="w-[190px]" />
              <col className="w-[72px]" />
            </colgroup>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Propietario</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3 text-right">Propiedades</th>
                <th className="px-4 py-3">Cuenta bancaria</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3 text-right"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((p) => (
                <tr key={p.rut} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3" title={p.nombre}>
                    {/* Hasta 2 líneas con salto limpio; si aún no cabe, "…" (el nombre completo queda en el title) */}
                    <p className="line-clamp-2 break-words font-semibold leading-snug text-slate-800">{p.nombre}</p>
                    <p className="truncate text-xs text-slate-500">RUT {p.rut_formateado}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600" title={[p.telefono, p.email].filter(Boolean).join(' · ') || undefined}>
                    <p className="truncate">{p.telefono ?? <span className="text-slate-300">Sin celular</span>}</p>
                    <p className="truncate">{p.email ?? <span className="text-slate-300">Sin correo</span>}</p>
                  </td>
                  <td className="truncate px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{p.propiedades}</td>
                  <td className="px-4 py-3 text-xs text-slate-600" title={p.banco && p.numero_cuenta ? `${p.banco} · ${p.tipo_cuenta} · N° ${p.numero_cuenta}` : undefined}>
                    {p.banco && p.numero_cuenta ? (
                      <span className="flex min-w-0 items-start gap-1">
                        <Landmark className="mt-px size-3.5 shrink-0 text-slate-400" />
                        <span className="line-clamp-2 min-w-0 break-words">{p.banco} · {p.tipo_cuenta} · N° {p.numero_cuenta}</span>
                      </span>
                    ) : <span className="font-semibold text-amber-700">Faltan datos bancarios</span>}
                  </td>
                  <td className="px-4 py-3 text-xs" title={p.ultimo_ingreso_en ? `Último ingreso: ${fmtFecha.format(desdeUTC(p.ultimo_ingreso_en))}` : undefined}>
                    {p.portal_habilitado ? (
                      <>
                        <span className="flex items-center gap-1 font-semibold text-emerald-700"><KeyRound className="size-3.5 shrink-0" /> Con acceso</span>
                        {p.ultimo_ingreso_en && <p className="truncate text-slate-500">Último ingreso {fmtFecha.format(desdeUTC(p.ultimo_ingreso_en))}</p>}
                      </>
                    ) : <span className="text-slate-500">Sin acceso</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {ocupado === p.rut ? (
                        <Loader2 className="m-1.5 size-4 animate-spin text-brand-600" />
                      ) : (
                        <MenuAcciones
                          etiqueta={`Acciones: ${p.nombre}`}
                          items={[
                            { label: 'Ver como usuario', icon: Eye, onClick: () => verComo(p) },
                            {
                              label: p.portal_habilitado ? 'Reenviar acceso al portal' : 'Habilitar y enviar acceso',
                              icon: p.telefono ? MessageCircle : Send,
                              onClick: () => enviarAcceso(p),
                              deshabilitado: !p.email && !p.telefono,
                              motivo: 'Registra su correo o celular',
                            },
                          ]}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
