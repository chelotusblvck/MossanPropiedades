import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Building2, Palette, Percent, Plug, ShieldCheck, Loader2, ArrowLeft, ArrowRight, Check, KeyRound, Upload, Mail, CreditCard, AlertCircle, CheckCircle2, Eye, EyeOff, Terminal,
} from 'lucide-react';
import { setupApi, haySesion } from '../lib/api';
import { aplicarMarca, MARCA } from '../lib/marca';
import { formatearRut, rutValido } from '../lib/rut';
import { formatCLP } from '../lib/format';
import { BANCOS } from '../lib/chile';
import { Login } from './AdminPage';
import PasoLineaGrafica, { temaDesde, temaParaGuardar, erroresTema } from '../components/setup/PasoLineaGrafica';

const campo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASOS = [
  ['Corredora', Building2, 'Datos de la corredora'],
  ['Línea gráfica', Palette, 'Línea gráfica'],
  ['Finanzas', Percent, 'Parámetros financieros'],
  ['Integraciones', Plug, 'Integraciones y notificaciones'],
  ['Seguridad', ShieldCheck, 'Seguridad'],
];
// Índice de cada paso (el panel enlaza con /admin/setup?paso=N, contando desde 1)
const P = { corredora: 0, tema: 1, finanzas: 2, integraciones: 3, seguridad: 4 };
const ULTIMO = PASOS.length - 1;

function Campo({ etiqueta, ayuda, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-0.5 block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  );
}

function Interruptor({ activo, onCambio, etiqueta, detalle }) {
  return (
    <button type="button" role="switch" aria-checked={activo} onClick={() => onCambio(!activo)} className="flex w-full items-center justify-between gap-4 rounded-xl p-3 text-left ring-1 ring-slate-200 hover:bg-slate-50">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{etiqueta}</span>
        {detalle && <span className="text-xs text-slate-500">{detalle}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${activo ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${activo ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

/** Formulario a partir de los datos actuales del servidor (los secretos vienen vacíos). */
function formularioDesde(d) {
  return {
    corredora: { ...d.corredora, rut: d.corredora.rut ? formatearRut(d.corredora.rut) : '', telefono: d.corredora.telefono ?? '', email: d.corredora.email ?? '', direccion: d.corredora.direccion ?? '', nombre: d.corredora.nombre === 'Mi Inmobiliaria' && !d.completado ? '' : d.corredora.nombre },
    finanzas: { ...d.finanzas },
    correo: { ...d.correo, pass: '', avisos: (d.correo.avisos ?? []).join(', '), port: d.correo.port ?? 587 },
    pagos: {
      ...d.pagos,
      webpay_api_key: '',
      mp_access_token: '',
      transferencia: {
        banco: d.pagos.transferencia.banco ?? '',
        tipo_cuenta: d.pagos.transferencia.tipo_cuenta ?? '',
        numero_cuenta: d.pagos.transferencia.numero_cuenta ?? '',
        titular: d.pagos.transferencia.titular ?? '',
        rut: d.pagos.transferencia.rut && rutValido(d.pagos.transferencia.rut) ? formatearRut(d.pagos.transferencia.rut) : d.pagos.transferencia.rut ?? '',
        email: d.pagos.transferencia.email ?? '',
      },
    },
    seguridad: { password_nueva: '', password_confirmacion: '' },
    tema: temaDesde(d.tema),
  };
}

// Validación rápida en el navegador (el servidor vuelve a validar todo)
function erroresPaso(paso, f, datos) {
  if (paso === P.corredora) {
    const c = f.corredora;
    if (c.nombre.trim().length < 2) return 'Indica el nombre comercial';
    if (c.rut && !rutValido(c.rut)) return 'RUT de la corredora inválido';
    if (c.telefono.replace(/\D/g, '').length < 8) return 'Indica el teléfono / WhatsApp';
    if (!RE_EMAIL.test(c.email.trim())) return 'Correo corporativo inválido';
  }
  if (paso === P.tema) return erroresTema(f.tema);
  if (paso === P.finanzas) {
    for (const [k, n] of [['comision_venta_pct', 'venta'], ['comision_arriendo_pct', 'arriendo mensual'], ['comision_diario_pct', 'arriendo diario']]) {
      const v = Number(f.finanzas[k]);
      if (f.finanzas[k] === '' || !(v >= 0 && v <= 100)) return `Comisión de ${n}: entre 0 y 100 %`;
    }
    if (!(Number(f.finanzas.aseo_base_clp) >= 0)) return 'Aseo base inválido';
  }
  if (paso === P.integraciones) {
    const m = f.correo;
    if (m.host && !(Number(m.port) > 0)) return 'Puerto SMTP inválido';
    const malo = m.avisos.split(',').map((x) => x.trim()).filter(Boolean).find((x) => !RE_EMAIL.test(x));
    if (malo) return `Correo de avisos inválido: ${malo}`;
    if (f.pagos.webpay_ambiente === 'produccion' && (!f.pagos.webpay_codigo_comercio || (!f.pagos.webpay_api_key && !datos.pagos.tiene_webpay_api_key))) return 'Webpay en producción requiere código de comercio y API key';
    if (f.pagos.mercadopago_activo && !f.pagos.mp_access_token && !datos.pagos.mercadopago_activo) return 'Ingresa el Access Token de Mercado Pago';
    if (f.pagos.transferencia_activa) {
      const t = f.pagos.transferencia;
      if (!t.banco) return 'Transferencia: elige el banco';
      if (!t.tipo_cuenta) return 'Transferencia: elige el tipo de cuenta';
      if (!/^[0-9-]{4,20}$/.test(t.numero_cuenta.replace(/\s/g, ''))) return 'Transferencia: n° de cuenta inválido';
      if (t.titular.trim().length < 3) return 'Transferencia: indica el titular';
      if (!rutValido(t.rut)) return 'Transferencia: RUT del titular inválido';
      if (t.email && !RE_EMAIL.test(t.email.trim())) return 'Transferencia: correo inválido';
    }
  }
  if (paso === P.seguridad) {
    const s = f.seguridad;
    const obligatoria = !datos.seguridad.password_propia;
    if (obligatoria || s.password_nueva) {
      if (s.password_nueva.length < 12) return 'La contraseña debe tener al menos 12 caracteres';
      if (s.password_nueva !== s.password_confirmacion) return 'La confirmación no coincide';
    }
  }
  return null;
}

/** Paso al que corresponde un error del servidor. */
function pasoDelError(msg) {
  if (/Línea gráfica/i.test(msg)) return P.tema;
  if (/corredora|Logo|teléfono|Correo corporativo/i.test(msg)) return P.corredora;
  if (/Comisión|Aseo/i.test(msg)) return P.finanzas;
  if (/SMTP|Puerto|avisos|Webpay|Mercado Pago|Transferencia/i.test(msg)) return P.integraciones;
  if (/contraseña/i.test(msg)) return P.seguridad;
  return null;
}

function fuerza(p) {
  let puntos = 0;
  if (p.length >= 12) puntos++;
  if (p.length >= 16) puntos++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) puntos++;
  if (/\d/.test(p)) puntos++;
  if (/[^\w\s]/.test(p)) puntos++;
  return [['Muy débil', 'bg-rose-500'], ['Débil', 'bg-rose-400'], ['Aceptable', 'bg-amber-400'], ['Buena', 'bg-lime-500'], ['Muy buena', 'bg-emerald-500'], ['Excelente', 'bg-emerald-600']][puntos];
}

// --- Pasos ---

function PasoCorredora({ f, set }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const c = f.corredora;
  const subir = async (archivo) => {
    if (!archivo) return;
    if (archivo.size > 2 * 1024 * 1024) return setError('El logo debe pesar menos de 2 MB');
    setSubiendo(true);
    setError(null);
    try {
      const { url } = await setupApi.subirLogo(archivo);
      set('corredora', { ...c, logo: url });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  };
  const cambiar = (k) => (e) => set('corredora', { ...c, [k]: k === 'rut' ? formatearRut(e.target.value) : e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre comercial *" className="sm:col-span-2"><input value={c.nombre} onChange={cambiar('nombre')} maxLength={80} className={campo} placeholder="Ej: Propiedades del Pacífico" /></Campo>
      <Campo etiqueta="RUT de la empresa" ayuda="Aparece en las liquidaciones"><input value={c.rut} onChange={cambiar('rut')} className={campo} placeholder="76.123.456-7" /></Campo>
      <Campo etiqueta="Teléfono / WhatsApp *"><input value={c.telefono} onChange={cambiar('telefono')} maxLength={30} className={campo} placeholder="+56 9 1234 5678" /></Campo>
      <Campo etiqueta="Correo corporativo *"><input type="email" value={c.email} onChange={cambiar('email')} maxLength={160} className={campo} placeholder="contacto@tucorredora.cl" /></Campo>
      <Campo etiqueta="Dirección"><input value={c.direccion} onChange={cambiar('direccion')} maxLength={200} className={campo} placeholder="Calle 123, oficina 45, Comuna" /></Campo>
      <div className="sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold text-slate-600">Logo</span>
        <div className="flex items-center gap-4 rounded-xl p-3 ring-1 ring-slate-200">
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100">
            {c.logo ? <img src={c.logo} alt="Logo" className="size-full object-contain" /> : <Building2 className="size-7 text-slate-400" />}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50">
              {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {c.logo ? 'Cambiar logo' : 'Subir logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {c.logo && <button type="button" onClick={() => set('corredora', { ...c, logo: null })} className="text-sm font-semibold text-slate-500 hover:underline">Quitar</button>}
            <span className="w-full text-[11px] text-slate-400">PNG, JPG o WEBP · máx. 2 MB · idealmente cuadrado y con fondo transparente</span>
          </div>
        </div>
        {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}

function PasoFinanzas({ f, set }) {
  const fi = f.finanzas;
  const cambiar = (k) => (e) => set('finanzas', { ...fi, [k]: e.target.value });
  const pct = (k, etiqueta, ayuda) => (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <span className="relative block">
        <input type="number" min={0} max={100} step="any" value={fi[k]} onChange={cambiar(k)} className={`${campo} pr-8`} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
      </span>
    </Campo>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {pct('comision_venta_pct', 'Comisión venta', 'Sobre el precio de venta')}
        {pct('comision_arriendo_pct', 'Comisión arriendo mensual', 'Porcentaje de un mes de arriendo')}
        {pct('comision_diario_pct', 'Comisión arriendo diario', 'Sobre lo cobrado; se descuenta al propietario')}
      </div>
      <Interruptor
        activo={fi.iva_activo}
        onCambio={(v) => set('finanzas', { ...fi, iva_activo: v })}
        etiqueta="Sumar IVA (19 %) a la comisión"
        detalle={fi.iva_activo ? 'Las comisiones se muestran y liquidan + IVA' : 'Las comisiones se cobran sin IVA'}
      />
      <Campo etiqueta="Costo de aseo base por estadía ($)" ayuda="Se descuenta al propietario en arriendo diario cuando la propiedad no define el suyo">
        <input type="number" min={0} step={1000} value={fi.aseo_base_clp} onChange={cambiar('aseo_base_clp')} className={campo} />
        {Number(fi.aseo_base_clp) > 0 && <span className="mt-0.5 block text-[11px] text-slate-500">{formatCLP(Number(fi.aseo_base_clp))} por estadía</span>}
      </Campo>
      <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Son valores por defecto: cada propiedad puede tener su propia comisión y aseo. Las liquidaciones ya transferidas no cambian.</p>
    </div>
  );
}

function Secreto({ valor, onCambio, guardado, placeholder }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="relative block">
      <input
        type={ver ? 'text' : 'password'}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        autoComplete="new-password"
        placeholder={guardado ? '•••••••• (guardada · déjala vacía para mantenerla)' : placeholder}
        className={`${campo} pr-10`}
      />
      <button type="button" onClick={() => setVer(!ver)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600" aria-label={ver ? 'Ocultar' : 'Mostrar'}>
        {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}

/** Cuenta de la corredora para que los huéspedes paguen por transferencia. */
function DatosTransferencia({ t, onCambio, tipos }) {
  const c = (k, v) => onCambio({ ...t, [k]: v });
  return (
    <div className="grid gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-2">
      <Campo etiqueta="Banco">
        <select value={t.banco} onChange={(e) => c('banco', e.target.value)} className={campo}>
          <option value="">Elige…</option>
          {[...new Set([...BANCOS, t.banco].filter(Boolean))].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Tipo de cuenta">
        <select value={t.tipo_cuenta} onChange={(e) => c('tipo_cuenta', e.target.value)} className={campo}>
          <option value="">Elige…</option>
          {tipos.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="N° de cuenta">
        <input inputMode="numeric" value={t.numero_cuenta} onChange={(e) => c('numero_cuenta', e.target.value.replace(/[^0-9-]/g, ''))} maxLength={20} className={campo} />
      </Campo>
      <Campo etiqueta="Titular">
        <input value={t.titular} onChange={(e) => c('titular', e.target.value)} maxLength={120} className={campo} />
      </Campo>
      <Campo etiqueta="RUT del titular">
        <input value={t.rut} onChange={(e) => c('rut', formatearRut(e.target.value))} placeholder="76.123.456-7" className={campo} />
      </Campo>
      <Campo etiqueta="Correo para comprobantes" ayuda="Opcional: el huésped puede enviar ahí su comprobante">
        <input type="email" value={t.email} onChange={(e) => c('email', e.target.value)} maxLength={160} className={campo} />
      </Campo>
    </div>
  );
}

function PasoIntegraciones({ f, set, datos }) {
  const m = f.correo;
  const p = f.pagos;
  const [prueba, setPrueba] = useState({ para: f.corredora.email, enviando: false, resultado: null });
  const cm = (k) => (e) => set('correo', { ...m, [k]: e.target.value });
  const cp = (k, v) => set('pagos', { ...p, [k]: v });

  const probar = async () => {
    setPrueba({ ...prueba, enviando: true, resultado: null });
    try {
      await setupApi.probarCorreo({ smtp: { ...m, avisos: [] }, para: prueba.para });
      setPrueba({ ...prueba, enviando: false, resultado: { ok: true, texto: `Correo enviado a ${prueba.para}. Revisa la bandeja (y spam).` } });
    } catch (err) {
      setPrueba({ ...prueba, enviando: false, resultado: { ok: false, texto: err.message } });
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Mail className="size-4 text-brand-600" /> Correo (SMTP)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Servidor SMTP" ayuda="Vacío = sin envío (sólo consola)" className="sm:col-span-2"><input value={m.host} onChange={cm('host')} className={campo} placeholder="smtp.gmail.com" /></Campo>
          <Campo etiqueta="Puerto"><input type="number" value={m.port} onChange={cm('port')} className={campo} /></Campo>
          <Campo etiqueta="Usuario"><input value={m.user} onChange={cm('user')} autoComplete="off" className={campo} placeholder="reservas@tucorredora.cl" /></Campo>
          <Campo etiqueta="Contraseña" ayuda="Gmail: usa una «contraseña de aplicación»"><Secreto valor={m.pass} onCambio={(v) => set('correo', { ...m, pass: v })} guardado={datos.correo.tiene_pass} placeholder="Contraseña SMTP" /></Campo>
          <Campo etiqueta="Conexión segura">
            <select value={m.secure ? 'si' : 'no'} onChange={(e) => set('correo', { ...m, secure: e.target.value === 'si', port: e.target.value === 'si' && Number(m.port) === 587 ? 465 : m.port })} className={campo}>
              <option value="no">STARTTLS (587)</option><option value="si">SSL/TLS (465)</option>
            </select>
          </Campo>
          <Campo etiqueta="Remitente" ayuda="Nombre y correo que ven los clientes" className="sm:col-span-2"><input value={m.from} onChange={cm('from')} className={campo} placeholder={`${f.corredora.nombre || 'Tu corredora'} <reservas@tucorredora.cl>`} /></Campo>
          <Campo etiqueta="Avisos a la corredora" ayuda="Nuevas reservas, pagos y visitas (separa con comas)"><input value={m.avisos} onChange={cm('avisos')} className={campo} placeholder="tu@correo.cl" /></Campo>
        </div>
        {m.host && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
            <input type="email" value={prueba.para} onChange={(e) => setPrueba({ ...prueba, para: e.target.value })} placeholder="Enviar prueba a…" className={`${campo} max-w-xs`} />
            <button type="button" onClick={probar} disabled={prueba.enviando || !RE_EMAIL.test(prueba.para ?? '')} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-white disabled:opacity-50">
              {prueba.enviando ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />} Enviar correo de prueba
            </button>
            {prueba.resultado && (
              <p className={`w-full text-sm ${prueba.resultado.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{prueba.resultado.ok ? '✓ ' : '✗ '}{prueba.resultado.texto}</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><CreditCard className="size-4 text-brand-600" /> Pagos de reservas</h3>
        <fieldset className="rounded-xl p-3 ring-1 ring-slate-200">
          <legend className="px-1 text-sm font-semibold text-slate-800">Webpay (Transbank)</legend>
          <div className="flex flex-wrap gap-2">
            {[['', 'Desactivado'], ['integracion', 'Pruebas (no cobra)'], ['produccion', 'Producción']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => cp('webpay_ambiente', v)} aria-pressed={p.webpay_ambiente === v} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${p.webpay_ambiente === v ? 'bg-brand-700 text-white ring-brand-700' : 'text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          {p.webpay_ambiente === 'produccion' && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Código de comercio"><input value={p.webpay_codigo_comercio} onChange={(e) => cp('webpay_codigo_comercio', e.target.value.replace(/\D/g, ''))} className={campo} placeholder="5970…" /></Campo>
              <Campo etiqueta="API key (secreta)"><Secreto valor={p.webpay_api_key} onCambio={(v) => cp('webpay_api_key', v)} guardado={datos.pagos.tiene_webpay_api_key} placeholder="Entregada por Transbank" /></Campo>
            </div>
          )}
        </fieldset>
        <div className="mt-3 space-y-3">
          <Interruptor
            activo={p.mercadopago_activo}
            onCambio={(v) => cp('mercadopago_activo', v)}
            etiqueta="Mercado Pago"
            detalle={datos.pagos.mercadopago_activo ? `Configurado (${datos.pagos.mp_modo === 'pruebas' ? 'modo pruebas' : 'producción'})` : 'Tarjetas, saldo en cuenta y más'}
          />
          {p.mercadopago_activo && (
            <Campo etiqueta="Access Token" ayuda="Panel de desarrolladores de Mercado Pago · APP_USR-… (producción) o TEST-… (pruebas)">
              <Secreto valor={p.mp_access_token} onCambio={(v) => cp('mp_access_token', v.trim())} guardado={datos.pagos.mercadopago_activo} placeholder="APP_USR-…" />
            </Campo>
          )}
          <Interruptor
            activo={p.transferencia_activa}
            onCambio={(v) => set('pagos', {
              ...p,
              transferencia_activa: v,
              // Al activarla se proponen los datos de la corredora
              transferencia: v ? {
                ...p.transferencia,
                titular: p.transferencia.titular || f.corredora.nombre,
                rut: p.transferencia.rut || f.corredora.rut,
                email: p.transferencia.email || f.corredora.email,
              } : p.transferencia,
            })}
            etiqueta="Transferencia bancaria"
            detalle="El huésped ve estos datos en la página de pago, transfiere e informa el pago; tú lo confirmas en el panel"
          />
          {p.transferencia_activa && <DatosTransferencia t={p.transferencia} onCambio={(t) => cp('transferencia', t)} tipos={datos.tipos_cuenta} />}
        </div>
      </section>
    </div>
  );
}

function PasoSeguridad({ f, set, datos }) {
  const s = f.seguridad;
  const obligatoria = !datos.seguridad.password_propia;
  const [nivel, color] = fuerza(s.password_nueva);
  return (
    <div className="space-y-4">
      <div className={`flex gap-3 rounded-xl p-4 text-sm ring-1 ${obligatoria ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-emerald-50 text-emerald-900 ring-emerald-200'}`}>
        <KeyRound className="mt-0.5 size-5 shrink-0" />
        {obligatoria
          ? <p><b>Cambio obligatorio.</b> {datos.seguridad.instalacion_nueva ? 'Define la contraseña del panel de administración.' : 'El panel usa la contraseña inicial de backend/.env. Define una propia: se guardará cifrada (hash) y la del archivo dejará de funcionar.'}</p>
          : <p>Ya definiste una contraseña propia. Déjala vacía para mantenerla o escribe una nueva para cambiarla.</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta={`Contraseña nueva${obligatoria ? ' *' : ''}`}>
          <Secreto valor={s.password_nueva} onCambio={(v) => set('seguridad', { ...s, password_nueva: v })} placeholder="Mínimo 12 caracteres" />
          {s.password_nueva && (
            <span className="mt-1.5 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><span className={`block h-full ${color}`} style={{ width: `${Math.max(10, (['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena', 'Excelente'].indexOf(nivel) + 1) * 16.6)}%` }} /></span>
              <span className="text-[11px] font-semibold text-slate-500">{nivel}</span>
            </span>
          )}
        </Campo>
        <Campo etiqueta="Repite la contraseña">
          <Secreto valor={s.password_confirmacion} onCambio={(v) => set('seguridad', { ...s, password_confirmacion: v })} placeholder="Confirmación" />
          {s.password_confirmacion && s.password_confirmacion !== s.password_nueva && <span className="mt-1 block text-[11px] text-rose-600">No coincide</span>}
        </Campo>
      </div>
      <p className="text-xs text-slate-500">Consejo: una frase de 3 o 4 palabras con números o símbolos es fácil de recordar y difícil de adivinar. Al cambiarla se cierran las demás sesiones abiertas del panel.</p>
    </div>
  );
}

// --- Acceso: código de instalación ---

function CodigoInstalacion({ onListo }) {
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setupApi.guardarCodigo(codigo);
    try {
      onListo(await setupApi.datos());
    } catch (err) {
      setupApi.guardarCodigo(null);
      setError(err.message);
      setCargando(false);
    }
  };
  return (
    <form onSubmit={enviar} className="mx-auto max-w-md rounded-2xl bg-white p-7 shadow-2xl">
      <span className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white"><Terminal className="size-6" /></span>
      <h1 className="mt-4 text-2xl font-extrabold text-brand-950">Configuración inicial</h1>
      <p className="mt-1 text-sm text-slate-600">
        Por seguridad, ingresa el <b>código de instalación</b> que aparece en la consola del servidor (la ventana donde corre el backend), en una línea que dice <code className="rounded bg-slate-100 px-1">[setup]</code>.
      </p>
      <input autoFocus required value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" className={`${campo} mt-5 py-3 text-center font-mono text-lg tracking-widest`} />
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <button disabled={cargando || codigo.length < 12} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800 disabled:opacity-50">
        {cargando ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} Comenzar
      </button>
    </form>
  );
}

// --- Página ---

export default function SetupPage() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const [acceso, setAcceso] = useState('cargando'); // cargando | codigo | login | listo
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null);
  const [paso, setPaso] = useState(() => Math.min(Math.max(Number(params.get('paso') || 1) - 1, 0), ULTIMO));
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [terminado, setTerminado] = useState(false);
  const cuerpo = useRef(null);

  useEffect(() => {
    document.title = `Configuración inicial | ${MARCA}`;
  }, []);

  const cargarDatos = (d) => {
    setDatos(d);
    setForm(formularioDesde(d));
    setAcceso('listo');
  };

  useEffect(() => {
    setupApi.estado()
      .then(async (e) => {
        if (e.instalacion_nueva) {
          try { cargarDatos(await setupApi.datos()); } catch { setAcceso('codigo'); } // quizás ya ingresó el código
        } else if (haySesion()) {
          try { cargarDatos(await setupApi.datos()); } catch { setAcceso('login'); }
        } else setAcceso('login');
      })
      .catch((err) => { setError(err.message); setAcceso('login'); });
  }, []);

  const set = (seccion, valor) => setForm((f) => ({ ...f, [seccion]: valor }));

  const irA = (n) => {
    for (let i = paso; i < n; i++) {
      const e = erroresPaso(i, form, datos);
      if (e) { setPaso(i); setError(e); return; }
    }
    setError(null);
    setPaso(n);
    cuerpo.current?.scrollTo({ top: 0 });
  };

  const finalizar = async () => {
    for (let i = 0; i <= ULTIMO; i++) {
      const e = erroresPaso(i, form, datos);
      if (e) { setPaso(i); setError(e); return; }
    }
    setGuardando(true);
    setError(null);
    try {
      await setupApi.finalizar({
        ...form,
        tema: temaParaGuardar(form.tema),
        correo: { ...form.correo, avisos: form.correo.avisos.split(',').map((x) => x.trim()).filter(Boolean) },
      });
      aplicarMarca({ nombre: form.corredora.nombre, telefono: form.corredora.telefono, email: form.corredora.email, logo: form.corredora.logo, tema: temaParaGuardar(form.tema) });
      setTerminado(true);
    } catch (err) {
      setError(err.message);
      const p = pasoDelError(err.message);
      if (p != null) setPaso(p);
    } finally {
      setGuardando(false);
    }
  };

  const fondo = 'grid min-h-screen place-items-center bg-gradient-to-br from-brand-950 to-brand-800 p-4';

  if (acceso === 'cargando') return <div className={fondo}><Loader2 className="size-8 animate-spin text-white" /></div>;
  if (acceso === 'codigo') return <div className={fondo}><CodigoInstalacion onListo={cargarDatos} /></div>;
  if (acceso === 'login') {
    return <Login onEntrar={() => setupApi.datos().then(cargarDatos).catch((err) => setError(err.message))} />;
  }

  if (terminado) {
    return (
      <div className={fondo}>
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
          <h1 className="mt-3 text-2xl font-extrabold text-slate-800">¡Sitio configurado al 100 %!</h1>
          <p className="mt-2 text-slate-600">Los cambios ya están activos. Revisa la pestaña <b>Estado</b> del panel para ver el diagnóstico completo.</p>
          <button onClick={() => navegar('/admin', { replace: true })} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 py-3 font-semibold text-white hover:bg-brand-800">
            Ir al panel <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const Actual = [PasoCorredora, PasoLineaGrafica, PasoFinanzas, PasoIntegraciones, PasoSeguridad][paso];
  return (
    <div className="flex min-h-screen items-stretch justify-center bg-gradient-to-br from-brand-950 to-brand-800 sm:items-center sm:p-6">
      <div className={`flex w-full ${paso === P.tema ? 'max-w-5xl' : 'max-w-3xl'} flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[94vh] sm:rounded-2xl`}>
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{datos.completado ? 'Reconfigurar el sitio' : 'Configuración inicial'}</p>
          <h1 className="text-2xl font-extrabold text-slate-800">{PASOS[paso][2]}</h1>
          <ol className="mt-4 grid grid-cols-5 gap-2">
            {PASOS.map(([nombre, Icono], i) => (
              <li key={nombre}>
                <button type="button" onClick={() => (i <= paso ? setPaso(i) : irA(i))} aria-current={i === paso ? 'step' : undefined} className="w-full text-left">
                  <span className={`block h-1.5 rounded-full ${i < paso ? 'bg-emerald-500' : i === paso ? 'bg-brand-600' : 'bg-slate-200'}`} />
                  <span className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${i === paso ? 'text-brand-700' : i < paso ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {i < paso ? <Check className="size-3.5" /> : <Icono className="size-3.5" />} <span className="hidden sm:inline">{nombre}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div ref={cuerpo} className="flex-1 overflow-y-auto px-6 py-6">
          <Actual f={form} set={set} datos={datos} />
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          {error && <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
          <div className="flex items-center justify-between gap-3">
            {paso > 0 ? (
              <button type="button" onClick={() => { setError(null); setPaso(paso - 1); }} className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">
                <ArrowLeft className="size-4" /> Atrás
              </button>
            ) : datos.completado ? (
              <button type="button" onClick={() => navegar('/admin')} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200">Cancelar</button>
            ) : <span />}
            {paso < ULTIMO ? (
              <button type="button" onClick={() => irA(paso + 1)} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
                Continuar <ArrowRight className="size-4" />
              </button>
            ) : (
              <button type="button" onClick={finalizar} disabled={guardando} className="flex items-center gap-2 rounded-lg bg-acento-500 px-6 py-2.5 font-bold text-acento-contraste hover:bg-acento-400 disabled:opacity-60">
                {guardando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Finalizar configuración
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
