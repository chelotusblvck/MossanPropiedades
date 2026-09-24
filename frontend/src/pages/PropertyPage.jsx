import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, BedDouble, Bath, Ruler, Car, MapPin, Maximize, ExternalLink, Mail, Phone, Loader2, CalendarCheck, Receipt, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { formatUF, formatCLP, formatNumero, TIPO_LABEL } from '../lib/format';
import { infoModalidad } from '../lib/modalidades';
import { TELEFONO, EMAIL } from '../lib/marca';
import { Navbar, Footer } from '../components/Layout';
import BookingWidget from '../components/BookingWidget';
import Galeria from '../components/Galeria';
import DesglosePrecio, { preciosDelDia } from '../components/detalle/DesglosePrecio';
import FichaTecnica from '../components/detalle/FichaTecnica';
import SolicitarVisita from '../components/detalle/SolicitarVisita';
import WhatsAppFlotante from '../components/detalle/WhatsAppFlotante';
import VideoTour from '../components/detalle/VideoTour';

function Caracteristica({ icono: Icono, valor, etiqueta }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <Icono className="size-6 text-brand-600" />
      <div>
        <p className="text-lg font-bold leading-none text-slate-800">{valor}</p>
        <p className="mt-1 text-xs text-slate-500">{etiqueta}</p>
      </div>
    </div>
  );
}

function Encabezado({ p, precios }) {
  const modalidad = infoModalidad(p.modalidad);
  const enUF = p.moneda_original === 'UF';
  return (
    <>
      <Link to="/propiedades" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700">
        <ArrowLeft className="size-4" /> Volver a resultados
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${modalidad.badge}`}>{modalidad.label}</span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">{TIPO_LABEL[p.tipo]}</span>
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-950 sm:text-4xl">{p.titulo}</h1>
          <p className="mt-2 flex items-center gap-1 text-slate-500">
            <MapPin className="size-4 shrink-0" /> {[p.direccion, p.comuna, p.region].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-3xl font-extrabold text-brand-900">
            {enUF ? formatUF(precios.uf) : formatCLP(precios.clp)}
            {modalidad.sufijo && <span className="text-base font-medium text-slate-500"> {modalidad.sufijo}</span>}
          </p>
          <p className="text-slate-500">≈ {enUF ? formatCLP(precios.clp) : formatUF(Math.round(precios.uf * 100) / 100)}</p>
        </div>
      </div>
    </>
  );
}

function Destacados({ p }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {p.habitaciones > 0 && <Caracteristica icono={BedDouble} valor={p.habitaciones} etiqueta="Dormitorios" />}
      {p.banos > 0 && <Caracteristica icono={Bath} valor={p.banos} etiqueta="Baños" />}
      {p.superficie_util != null && <Caracteristica icono={Ruler} valor={`${formatNumero(p.superficie_util)} m²`} etiqueta="Superficie útil" />}
      {p.superficie_total != null && <Caracteristica icono={Maximize} valor={`${formatNumero(p.superficie_total)} m²`} etiqueta="Superficie total" />}
      {p.estacionamientos > 0 && <Caracteristica icono={Car} valor={p.estacionamientos} etiqueta="Estacionamientos" />}
    </div>
  );
}

function Descripcion({ p }) {
  return (
    <>
      {p.descripcion && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6">
          <h2 className="text-xl font-bold text-slate-800">Descripción</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{p.descripcion}</p>
        </section>
      )}
      {p.permalink && (
        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
          Ver también en Portalinmobiliario <ExternalLink className="size-4" />
        </a>
      )}
    </>
  );
}

/** Resumen de precio del panel lateral (venta / arriendo mensual). */
function ResumenPrecio({ p, precios }) {
  const modalidad = infoModalidad(p.modalidad);
  const enUF = p.moneda_original === 'UF';
  return (
    <div className="rounded-2xl bg-brand-900 p-5 text-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-200">{p.modalidad === 'venta' ? 'Precio de venta' : 'Arriendo mensual'}</p>
      <p className="mt-1 text-3xl font-extrabold">
        {enUF ? formatUF(precios.uf) : formatCLP(precios.clp)}
        {modalidad.sufijo && <span className="text-base font-medium text-brand-200"> {modalidad.sufijo}</span>}
      </p>
      <p className="text-brand-100">≈ {enUF ? formatCLP(precios.clp) : formatUF(Math.round(precios.uf * 100) / 100)} al valor UF de hoy</p>
      {p.gastos_comunes_clp > 0 && (
        <p className="mt-3 flex items-center gap-2 border-t border-white/10 pt-3 text-sm text-brand-100">
          <Receipt className="size-4" /> Gastos comunes aprox. {formatCLP(p.gastos_comunes_clp)}/mes
        </p>
      )}
      <a href="#desglose" className="mt-3 inline-block text-sm font-semibold text-acento-300 hover:underline">Ver desglose completo ↓</a>
    </div>
  );
}

function DetalleVentaArriendo({ p, uf }) {
  const precios = preciosDelDia(p, uf);
  const precioTexto = p.moneda_original === 'UF' ? formatUF(precios.uf) : `${formatCLP(precios.clp)}${infoModalidad(p.modalidad).sufijo}`;
  return (
    <>
      <Encabezado p={p} precios={precios} />
      <div className="mt-6">
        <Galeria imagenes={p.imagenes ?? []} titulo={p.titulo} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Destacados p={p} />
          {/* En móvil el formulario queda arriba, cerca de la galería */}
          <a href="#solicitar-visita" className="flex items-center justify-center gap-2 rounded-lg bg-acento-500 py-3 font-bold text-acento-contraste lg:hidden">
            <CalendarCheck className="size-4" /> Solicitar una visita
          </a>
          <FichaTecnica propiedad={p} />
          <div id="desglose" className="scroll-mt-24">
            <DesglosePrecio propiedad={p} uf={uf} />
          </div>
          <Descripcion p={p} />
          {p.video_url && <VideoTour url={p.video_url} titulo={p.titulo} />}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <ResumenPrecio p={p} precios={precios} />
          <SolicitarVisita propiedad={p} />
          <div className="space-y-1.5 px-1 text-sm text-slate-600">
            <p className="flex items-center gap-2"><Phone className="size-4 text-slate-400" /> {TELEFONO}</p>
            <p className="flex items-center gap-2"><Mail className="size-4 text-slate-400" /> {EMAIL}</p>
          </div>
        </aside>
      </div>

      <WhatsAppFlotante propiedad={p} precio={precioTexto} />
    </>
  );
}

function DetalleArriendoDiario({ p, uf }) {
  const precios = preciosDelDia(p, uf);
  return (
    <>
      <Encabezado p={p} precios={precios} />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-6">
          <Galeria imagenes={p.imagenes ?? []} titulo={p.titulo} />
          <Destacados p={p} />
          {p.condiciones?.hora_checkin && (
            <p className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200">
              <span className="flex items-center gap-2"><Clock className="size-4 text-brand-600" /> Check-in desde las <b>{p.condiciones.hora_checkin}</b></span>
              <span className="flex items-center gap-2"><Clock className="size-4 text-brand-600" /> Check-out hasta las <b>{p.condiciones.hora_checkout}</b></span>
            </p>
          )}
          <Descripcion p={p} />
          {p.video_url && <VideoTour url={p.video_url} titulo={p.titulo} />}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <BookingWidget propiedad={p} />
        </aside>
      </div>
    </>
  );
}

export default function PropertyPage() {
  const { id } = useParams();
  const [propiedad, setPropiedad] = useState(null);
  const [uf, setUf] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPropiedad(null);
    setError(null);
    api.propiedad(id).then(setPropiedad).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    api.uf().then(setUf).catch(() => {});
  }, []);

  useEffect(() => {
    if (propiedad) document.title = `${propiedad.titulo} | ${propiedad.comuna}`;
  }, [propiedad]);

  let contenido;
  if (error) {
    contenido = (
      <div className="py-24 text-center">
        <p className="text-xl font-semibold text-slate-700">{error === 'Propiedad no encontrada' ? 'Esta propiedad ya no está disponible' : error}</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Ver otras propiedades</Link>
      </div>
    );
  } else if (!propiedad) {
    contenido = <div className="grid place-items-center py-32"><Loader2 className="size-8 animate-spin text-brand-600" /></div>;
  } else if (propiedad.modalidad === 'arriendo_diario') {
    contenido = <DetalleArriendoDiario p={propiedad} uf={uf} />;
  } else {
    contenido = <DetalleVentaArriendo p={propiedad} uf={uf} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{contenido}</main>
      <Footer />
    </div>
  );
}
