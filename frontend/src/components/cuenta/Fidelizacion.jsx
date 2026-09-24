import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Award, Check, Copy, Crown, Gift, Medal, Sparkles, Ticket, CalendarClock } from 'lucide-react';
import { formatCLP } from '../../lib/format';
import { guardarCupon, URL_ARRIENDO_DIARIO } from '../../lib/cupon';

// Estilo de cada nivel. "inicial" = aún sin estadías completadas
const ESTILO = {
  inicial: { fondo: 'from-brand-800 to-brand-950', insignia: 'bg-white/15 text-white ring-white/30', icono: Sparkles, barra: 'bg-acento-400' },
  plata: { fondo: 'from-slate-600 to-slate-900', insignia: 'bg-gradient-to-br from-slate-100 to-slate-300 text-slate-800 ring-white/60', icono: Medal, barra: 'bg-slate-200' },
  oro: { fondo: 'from-amber-600 to-amber-900', insignia: 'bg-gradient-to-br from-amber-200 to-amber-400 text-amber-950 ring-amber-100', icono: Award, barra: 'bg-amber-300' },
  platinum: { fondo: 'from-indigo-800 to-slate-950', insignia: 'bg-gradient-to-br from-indigo-100 to-slate-300 text-indigo-950 ring-white/60', icono: Crown, barra: 'bg-indigo-200' },
};

const estadias = (n) => `${n} ${n === 1 ? 'estadía' : 'estadías'}`;

/** Línea de hitos 0 → Plata → Oro → Platinum con el avance del cliente. */
function Hitos({ niveles, completadas, colorBarra }) {
  const max = niveles[niveles.length - 1].desde;
  const pct = Math.min(completadas / max, 1) * 100;
  return (
    // px: espacio para que las etiquetas de los extremos no se salgan de la caja
    <div className="px-6 pb-8 pt-3">
      <div
        className="relative h-2.5 rounded-full bg-white/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(completadas, max)}
        aria-label={`${estadias(completadas)} completadas de ${max} para el nivel máximo`}
      >
        <div className={`h-full rounded-full ${colorBarra} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
        {niveles.map((n) => {
          const logrado = completadas >= n.desde;
          return (
            <div key={n.id} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${(n.desde / max) * 100}%` }}>
              <span className={`grid size-5 place-items-center rounded-full ring-2 ${logrado ? 'bg-white text-slate-900 ring-white' : 'bg-slate-900/60 text-white/60 ring-white/30'}`}>
                {logrado ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className={`absolute left-1/2 top-6 -translate-x-1/2 whitespace-nowrap text-center text-[11px] leading-tight ${logrado ? 'font-bold text-white' : 'text-white/60'}`}>
                {n.nombre}
                <span className="block font-normal">{n.desde}+ · {n.descuento_pct}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Copia al portapapeles. Fallback para http sin HTTPS (p. ej. el sitio abierto por IP en la red local). */
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: texto, readOnly: true });
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * Cupón del nivel. El botón "Usar en mi próxima reserva" se muestra siempre que haya nivel (también en
 * "ver como usuario" y vista previa); sólo se deshabilita si el cupón no se puede usar hoy: ya está
 * aplicado en una reserva activa, o falta el RUT para generarlo.
 */
function Cupon({ cupon }) {
  const navegar = useNavigate();
  const [copiado, setCopiado] = useState(false);
  const usable = Boolean(cupon.codigo) && cupon.disponible;
  const motivo = cupon.requiere_rut
    ? 'El cupón es personal y se genera con el RUT: aparecerá cuando el cliente tenga su RUT registrado.'
    : !cupon.disponible
      ? `Está aplicado en tu reserva #${cupon.usado_en_reserva}. Al completar esa estadía recibirás uno nuevo.`
      : null;

  const copiar = async () => {
    if (await copiarTexto(cupon.codigo)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  // Copia, lo deja listo para el formulario de reserva (sessionStorage + state) y va a los arriendos diarios
  const usar = async () => {
    guardarCupon(cupon.codigo);
    await copiarTexto(cupon.codigo); // si el navegador no lo permite, igual queda precargado
    navegar(URL_ARRIENDO_DIARIO, { state: { cupon: cupon.codigo } });
  };

  return (
    <div className="rounded-xl bg-white p-4 text-slate-800 shadow-lg">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Ticket className="size-4" /> {usable ? 'Tu cupón para la próxima estadía' : cupon.requiere_rut ? `Cupón ${cupon.descuento_pct}% OFF` : 'Cupón en uso'}
      </p>
      {cupon.codigo && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className={`flex-1 select-all rounded-lg border-2 border-dashed px-3 py-2 text-center font-mono text-xl font-extrabold tracking-widest ${usable ? 'border-slate-300 bg-slate-50 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-400 line-through'}`}>
            {cupon.codigo}
          </code>
          {usable && (
            <button
              type="button"
              onClick={copiar}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              aria-label="Copiar código del cupón"
            >
              {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {motivo ?? `${cupon.descuento_pct}% de descuento en el alojamiento. Un solo uso, válido sólo con tu RUT.`}
      </p>
      <button
        type="button"
        onClick={usar}
        disabled={!usable}
        title={motivo ?? 'Copia el código y abre los arriendos por noche con el cupón ya ingresado'}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-acento-500 py-2.5 text-sm font-bold text-acento-contraste transition hover:bg-acento-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        <Gift className="size-4" /> Usar en mi próxima reserva
      </button>
    </div>
  );
}

/** Tarjeta superior de "Mi cuenta": nivel, beneficios, progreso al siguiente nivel y cupón vigente. */
// Sin prop de sólo lectura: navegar al catálogo con el cupón no modifica nada, así que en "ver como
// usuario" y en la vista previa el botón funciona igual que para el cliente
export default function Fidelizacion({ datos: f }) {
  const estilo = ESTILO[f.nivel?.id ?? 'inicial'];
  const Icono = estilo.icono;
  const s = f.siguiente;

  return (
    <section aria-labelledby="titulo-fidelizacion" className={`overflow-hidden rounded-2xl bg-gradient-to-br ${estilo.fondo} p-5 text-white shadow-lg sm:p-6`}>
      <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,20rem)]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl shadow-md ring-2 ${estilo.insignia}`}>
              <Icono className="size-7" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Club de huéspedes</p>
              <h2 id="titulo-fidelizacion" className="text-2xl font-extrabold">
                {f.nivel ? `Nivel ${f.nivel.nombre}` : '¡Tu primera estadía te espera!'}
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm text-white/85">
            {f.nivel ? (
              <>
                {estadias(f.estadias_completadas)} completadas
                {f.total_gastado_clp > 0 && <> · {formatCLP(f.total_gastado_clp)} en estadías</>}
              </>
            ) : (
              <>Completa tu primera estadía y pasa a <b>Plata</b>: {f.niveles[0].descuento_pct}% OFF en la siguiente. Mientras más vuelves, mejores beneficios.</>
            )}
          </p>

          {f.nivel && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {f.nivel.beneficios.map((b) => (
                <li key={b} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
                  <Check className="size-3.5" /> {b}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 rounded-xl bg-black/15 p-4">
            <p className="text-sm font-semibold">
              {s ? (
                <>Te {s.faltan === 1 ? 'falta' : 'faltan'} <span className="text-lg font-extrabold">{estadias(s.faltan)}</span> para <b>{s.nombre}</b>: {s.beneficios.join(' + ')}</>
              ) : (
                <>Alcanzaste el nivel máximo. ¡Gracias por elegirnos una y otra vez!</>
              )}
            </p>
            <Hitos niveles={f.niveles} completadas={f.estadias_completadas} colorBarra={estilo.barra} />
            {f.estadias_en_camino > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-white/80">
                <CalendarClock className="size-3.5" /> Tienes {estadias(f.estadias_en_camino)} pagada{f.estadias_en_camino === 1 ? '' : 's'} en camino: {f.estadias_en_camino === 1 ? 'sumará' : 'sumarán'} al terminar.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3">
          {f.cupon ? (
            <Cupon cupon={f.cupon} />
          ) : (
            <div className="rounded-xl bg-white/10 p-4 text-sm ring-1 ring-white/20">
              <p className="flex items-center gap-2 font-semibold"><Gift className="size-4" /> Tu primer cupón</p>
              <p className="mt-1 text-white/80">Aparecerá aquí apenas completes tu primera estadía pagada.</p>
              <Link to={URL_ARRIENDO_DIARIO} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-acento-500 py-2.5 text-sm font-bold text-acento-contraste hover:bg-acento-400">
                Explorar arriendos por noche
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
