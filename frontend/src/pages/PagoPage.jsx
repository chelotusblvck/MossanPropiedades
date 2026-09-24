import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  CreditCard, Landmark, Loader2, CheckCircle2, XCircle, Clock, Copy, Check, ShieldCheck, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatCLP } from '../lib/format';
import { fechaLarga, fechaHora, tiempoRestante } from '../lib/fechas';
import { Navbar, Footer } from '../components/Layout';

const RESULTADOS = {
  aprobado: { icono: CheckCircle2, color: 'bg-emerald-50 text-emerald-800 ring-emerald-200', titulo: '¡Pago aprobado!', texto: 'Tu reserva está confirmada. Te enviamos la confirmación por correo.' },
  rechazado: { icono: XCircle, color: 'bg-rose-50 text-rose-800 ring-rose-200', titulo: 'El pago fue rechazado', texto: 'No se realizó ningún cargo. Puedes intentarlo nuevamente o usar otro medio de pago.' },
  anulado: { icono: XCircle, color: 'bg-slate-50 text-slate-700 ring-slate-200', titulo: 'Pago no completado', texto: 'Cancelaste el pago o se agotó el tiempo. No se realizó ningún cargo.' },
  pendiente: { icono: Clock, color: 'bg-amber-50 text-amber-800 ring-amber-200', titulo: 'Pago en proceso', texto: 'Mercado Pago está procesando tu pago. Te avisaremos por correo cuando se acredite.' },
  no_disponible: { icono: AlertTriangle, color: 'bg-amber-50 text-amber-800 ring-amber-200', titulo: 'La reserva ya no está disponible para pago', texto: 'No se realizó ningún cargo. Contáctanos si tienes dudas.' },
  revision: { icono: AlertTriangle, color: 'bg-amber-50 text-amber-800 ring-amber-200', titulo: 'Estamos revisando tu pago', texto: 'Recibimos tu pago y lo estamos verificando. Te contactaremos a la brevedad.' },
};

/** Webpay exige llegar a su formulario con un POST que incluya token_ws. */
function irAWebpay({ url, token }) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'token_ws';
  input.value = token;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
}

function Copiable({ etiqueta, valor, mostrar = valor }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sin portapapeles: el dato igual está visible */
    }
  };
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{etiqueta}</p>
        <p className="truncate font-semibold text-slate-800">{mostrar}</p>
      </div>
      <button type="button" onClick={copiar} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-700" aria-label={`Copiar ${etiqueta}`}>
        {copiado ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

function Transferencia({ codigo, datos, monto, informada, onInformada }) {
  const [abierta, setAbierta] = useState(false);
  const [form, setForm] = useState({ titular: '', banco: '', comentario: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.informarTransferencia(codigo, form);
      onInformada();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const campo = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500';
  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <button type="button" onClick={() => setAbierta(!abierta)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={abierta}>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700"><Landmark className="size-5" /></span>
        <span className="flex-1">
          <span className="block font-semibold text-slate-800">Transferencia bancaria</span>
          <span className="block text-sm text-slate-500">{informada ? 'Transferencia informada · en verificación' : 'Transfiere y avísanos; confirmamos al recibir el abono'}</span>
        </span>
        <ChevronDown className={`size-5 text-slate-400 transition ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta && (
        <div className="border-t border-slate-200 p-4">
          <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
            <Copiable etiqueta="Monto" valor={String(monto)} mostrar={formatCLP(monto)} />
            {datos.banco && <Copiable etiqueta="Banco" valor={datos.banco} />}
            {datos.tipo_cuenta && <Copiable etiqueta="Tipo de cuenta" valor={datos.tipo_cuenta} />}
            <Copiable etiqueta="Número de cuenta" valor={datos.numero_cuenta} />
            {datos.titular && <Copiable etiqueta="Titular" valor={datos.titular} />}
            {datos.rut && <Copiable etiqueta="RUT" valor={datos.rut} />}
            {datos.email && <Copiable etiqueta="Correo" valor={datos.email} />}
          </div>
          {informada ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Ya nos avisaste de tu transferencia. Confirmaremos la reserva apenas veamos el abono.
            </p>
          ) : (
            <form onSubmit={enviar} className="mt-4 grid gap-2">
              <p className="text-sm font-medium text-slate-700">Una vez transferido, avísanos:</p>
              <input required value={form.titular} onChange={(e) => setForm({ ...form, titular: e.target.value })} placeholder="Nombre del titular de la cuenta de origen" maxLength={120} className={campo} />
              <input value={form.banco} onChange={(e) => setForm({ ...form, banco: e.target.value })} placeholder="Banco de origen (opcional)" maxLength={60} className={campo} />
              <input value={form.comentario} onChange={(e) => setForm({ ...form, comentario: e.target.value })} placeholder="Comentario (opcional)" maxLength={500} className={campo} />
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button disabled={enviando} className="flex items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50">
                {enviando && <Loader2 className="size-4 animate-spin" />} Ya transferí
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export default function PagoPage() {
  const { codigo } = useParams();
  const [params] = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [iniciando, setIniciando] = useState(null); // 'webpay' | 'mercadopago'
  const [errorPago, setErrorPago] = useState(null);
  const resultado = RESULTADOS[params.get('resultado')];

  const cargar = () => api.pago(codigo).then(setDatos).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = 'Pagar reserva';
    // Al volver con "Atrás" desde Webpay/Mercado Pago la página se restaura desde caché: reactivar botones
    const alMostrar = (e) => {
      if (e.persisted) {
        setIniciando(null);
        cargar();
      }
    };
    window.addEventListener('pageshow', alMostrar);
    return () => window.removeEventListener('pageshow', alMostrar);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pagar = async (metodo) => {
    setIniciando(metodo);
    setErrorPago(null);
    try {
      if (metodo === 'webpay') irAWebpay(await api.pagarWebpay(codigo));
      else window.location.href = (await api.pagarMercadoPago(codigo)).url;
    } catch (err) {
      setErrorPago(err.message);
      setIniciando(null);
    }
  };

  let contenido;
  if (error) {
    contenido = (
      <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-slate-200">
        <XCircle className="mx-auto size-10 text-rose-400" />
        <p className="mt-3 font-semibold text-slate-800">{error}</p>
        <p className="mt-1 text-sm text-slate-500">Revisa el enlace que te enviamos por correo.</p>
      </div>
    );
  } else if (!datos) {
    contenido = <div className="grid place-items-center py-24"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;
  } else {
    const { reserva: r, propiedad: p, metodos } = datos;
    const pagable = r.estado_pago === 'pendiente' && !r.terminada;
    const hayMetodos = metodos.webpay.disponible || metodos.mercadopago.disponible || metodos.transferencia.disponible;
    contenido = (
      <>
        {resultado && !(params.get('resultado') !== 'aprobado' && r.estado_pago === 'pagado') && (
          <div role="status" className={`mb-6 flex gap-3 rounded-2xl p-4 ring-1 ${resultado.color}`}>
            <resultado.icono className="size-6 shrink-0" />
            <div>
              <p className="font-bold">{resultado.titulo}</p>
              <p className="text-sm">{resultado.texto}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
          <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
            {p.imagen && <img src={p.imagen} alt="" className="aspect-[16/9] w-full object-cover" />}
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reserva #{r.id}</p>
              <Link to={`/propiedad/${p.id}`} className="mt-1 block font-bold text-slate-800 hover:text-brand-700">{p.titulo}</Link>
              <p className="text-sm text-slate-500">{p.comuna}</p>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Llegada</dt><dd className="text-right font-medium">{fechaLarga(r.fecha_inicio)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Salida</dt><dd className="text-right font-medium">{fechaLarga(r.fecha_fin)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-slate-500">Noches · huéspedes</dt><dd className="font-medium">{r.noches} · {r.huespedes}</dd></div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3 text-base"><dt className="font-semibold">Total</dt><dd className="font-extrabold text-brand-900">{formatCLP(r.monto_total_clp)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            {r.estado_pago === 'pagado' ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
                <p className="mt-3 text-xl font-bold text-slate-800">Reserva pagada</p>
                <p className="mt-1 text-slate-600">Tu reserva está confirmada. ¡Te esperamos!</p>
              </div>
            ) : r.estado_pago === 'cancelado' ? (
              <div className="py-8 text-center">
                {r.motivo_cancelacion === 'vencida' ? <Clock className="mx-auto size-12 text-slate-400" /> : <XCircle className="mx-auto size-12 text-slate-400" />}
                <p className="mt-3 text-xl font-bold text-slate-800">
                  {r.motivo_cancelacion === 'vencida' ? 'La reserva venció' : 'Reserva cancelada'}
                </p>
                {r.motivo_cancelacion === 'vencida' && (
                  <p className="mx-auto mt-1 max-w-sm text-slate-600">No recibimos el pago dentro del plazo y las fechas se liberaron. Si siguen disponibles, puedes reservarlas de nuevo.</p>
                )}
                <Link to={`/propiedad/${p.id}`} className="mt-3 inline-block font-semibold text-brand-700 hover:underline">
                  {r.motivo_cancelacion === 'vencida' ? 'Volver a reservar' : 'Buscar otras fechas'}
                </Link>
              </div>
            ) : !pagable ? (
              <p className="py-8 text-center text-slate-600">Esta reserva ya no se puede pagar en línea. Contáctanos.</p>
            ) : (
              <>
                <h1 className="text-xl font-extrabold text-slate-800">Elige cómo pagar</h1>
                <p className="mt-1 text-sm text-slate-500">Tus fechas están bloqueadas mientras pagas. La reserva se confirma al recibir el pago.</p>
                {r.vence_en && !r.transferencia_informada && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <Clock className="mt-0.5 size-4 shrink-0" />
                    <span>Paga antes del <b>{fechaHora(r.vence_en)}</b> ({tiempoRestante(r.vence_en)}). Después, la reserva se libera automáticamente.</span>
                  </p>
                )}

                <div className="mt-5 space-y-3">
                  {metodos.webpay.disponible && (
                    <button
                      onClick={() => pagar('webpay')}
                      disabled={Boolean(iniciando)}
                      className="flex w-full items-center gap-3 rounded-xl p-4 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-brand-300 disabled:opacity-60"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600"><CreditCard className="size-5" /></span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2 font-semibold text-slate-800">
                          Webpay
                          {metodos.webpay.pruebas && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">Modo prueba</span>}
                        </span>
                        <span className="block text-sm text-slate-500">Tarjeta de débito, crédito o prepago</span>
                      </span>
                      {iniciando === 'webpay' && <Loader2 className="size-5 animate-spin text-slate-400" />}
                    </button>
                  )}
                  {metodos.mercadopago.disponible && (
                    <button
                      onClick={() => pagar('mercadopago')}
                      disabled={Boolean(iniciando)}
                      className="flex w-full items-center gap-3 rounded-xl p-4 text-left ring-1 ring-slate-200 transition hover:bg-slate-50 hover:ring-brand-300 disabled:opacity-60"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-sm font-black text-sky-600">MP</span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2 font-semibold text-slate-800">
                          Mercado Pago
                          {metodos.mercadopago.pruebas && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">Modo prueba</span>}
                        </span>
                        <span className="block text-sm text-slate-500">Con tu cuenta de Mercado Libre / Mercado Pago o tarjeta</span>
                      </span>
                      {iniciando === 'mercadopago' && <Loader2 className="size-5 animate-spin text-slate-400" />}
                    </button>
                  )}
                  {metodos.transferencia.disponible && (
                    <Transferencia
                      codigo={codigo}
                      datos={metodos.transferencia.datos}
                      monto={r.monto_total_clp}
                      informada={r.transferencia_informada}
                      onInformada={cargar}
                    />
                  )}
                  {!hayMetodos && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">El pago en línea no está disponible. Te contactaremos para coordinarlo.</p>}
                </div>

                {errorPago && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{errorPago}</p>}
                <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-400">
                  <ShieldCheck className="size-4" /> Pagas directamente en Webpay o Mercado Pago. Nunca vemos los datos de tu tarjeta.
                </p>
              </>
            )}
          </section>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{contenido}</main>
      <Footer />
    </div>
  );
}
