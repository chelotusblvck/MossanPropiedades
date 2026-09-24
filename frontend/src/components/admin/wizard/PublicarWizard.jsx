import { useEffect, useRef, useState } from 'react';
import { X, Loader2, ArrowLeft, ArrowRight, Rocket, Check, UserRound, FileText, Ruler, Images, ClipboardCheck, AlertCircle } from 'lucide-react';
import { adminApi } from '../../../lib/api';
import { prepararFoto } from '../../../lib/imagenes';
import PasoPropietario, { PROPIETARIO_VACIO, erroresPropietario } from './PasoPropietario';
import PasoFicha, { erroresFicha } from './PasoFicha';
import PasoTecnica, { erroresTecnica } from './PasoTecnica';
import PasoMedios, { erroresMedios } from './PasoMedios';
import PasoResumen from './PasoResumen';
import ExitoPublicacion from './ExitoPublicacion';

const PASOS = [
  ['Propietario', UserRound],
  ['Operación', FileText],
  ['Ficha técnica', Ruler],
  ['Fotos y video', Images],
  ['Publicar', ClipboardCheck],
];

const FICHA_VACIA = {
  modalidad: '', titulo: '', tipo: '', direccion: '', comuna: '', region: '', descripcion: '',
  habitaciones: '', banos: '', estacionamientos: '', bodegas: '', superficie_util: '', superficie_total: '', gastos_comunes_clp: '',
  orientacion: '', amoblado: '', mascotas: '',
  moneda_original: 'UF', precio: '', garantia_meses: '', comision_pct: '', comision_diario_pct: '', aseo_clp: '',
  hora_checkin: '', hora_checkout: '', video_url: '',
};

const siNo = (v) => (v === '' ? null : v === 'si');
const hayErrores = (e) => Object.keys(e).length > 0;

/** Wizard de 5 pasos para publicar una propiedad, empezando por su propietario. */
export default function PublicarWizard({ onClose, onPublicada }) {
  const [paso, setPaso] = useState(0);
  const [condiciones, setCondiciones] = useState(null);
  const [propietario, setPropietario] = useState({ modo: 'buscar', existente: null, datos: PROPIETARIO_VACIO, portal: true, editando: false });
  const [ficha, setFicha] = useState(FICHA_VACIA);
  const [fotos, setFotos] = useState([]);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [fase, setFase] = useState(null); // null | { texto, progreso }
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const borradorId = useRef(null); // si la publicación falla a medias, el reintento usa el mismo borrador
  const cuerpo = useRef(null);

  useEffect(() => {
    adminApi.wizardCondiciones().then((c) => {
      setCondiciones(c);
      setFicha((f) => ({ ...f, hora_checkin: f.hora_checkin || c.hora_checkin, hora_checkout: f.hora_checkout || c.hora_checkout }));
    }).catch((err) => setError(err.message));
  }, []);

  // Las vistas previas usan URLs locales del navegador: se liberan al cerrar
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  const cerrar = () => {
    if (fase) return;
    if (!exito && (propietario.modo !== 'buscar' || ficha.titulo || fotos.length) && !window.confirm('¿Cerrar el asistente? Se perderán los datos ingresados.')) return;
    onClose();
  };

  useEffect(() => {
    const alPresionar = (e) => e.key === 'Escape' && cerrar();
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  });

  const cambiarFicha = (nueva) => {
    // El arriendo diario se publica en pesos; venta y arriendo mensual parten en UF
    if (nueva.modalidad !== ficha.modalidad) nueva = { ...nueva, moneda_original: nueva.modalidad === 'arriendo_diario' ? 'CLP' : 'UF' };
    setFicha(nueva);
  };

  const errores = [
    erroresPropietario(propietario),
    erroresFicha(ficha),
    erroresTecnica(ficha),
    erroresMedios({ fotos, video_url: ficha.video_url }),
    {},
  ];

  const irA = (n) => {
    // Sólo se avanza si los pasos anteriores están completos
    for (let i = 0; i < n; i++) {
      if (hayErrores(errores[i])) {
        setPaso(i);
        setMostrarErrores(true);
        return;
      }
    }
    setMostrarErrores(false);
    setPaso(n);
    cuerpo.current?.scrollTo({ top: 0 });
  };

  const publicar = async () => {
    setError(null);
    const d = propietario.datos;
    try {
      setFase({ texto: 'Guardando propietario y ficha…', progreso: 5 });
      const borrador = await adminApi.guardarBorrador({
        propiedad_id: borradorId.current ?? undefined,
        propietario: {
          nombre: d.nombre, rut: d.rut, email: d.email, telefono: d.celular ? `+56 9 ${d.celular}` : '',
          banco: d.banco, tipo_cuenta: d.tipo_cuenta, numero_cuenta: d.numero_cuenta, titular_cuenta: d.titular_cuenta, rut_titular: d.rut_titular,
        },
        propiedad: { ...ficha, amoblado: siNo(ficha.amoblado), mascotas: siNo(ficha.mascotas) },
      });
      borradorId.current = borrador.id;

      // Fotos una a una (las ya subidas en un intento anterior no se repiten)
      const lista = [...fotos];
      for (let i = 0; i < lista.length; i++) {
        if (lista[i].url) continue;
        setFase({ texto: `Subiendo foto ${i + 1} de ${lista.length}…`, progreso: 10 + Math.round((i / lista.length) * 80) });
        const archivo = await prepararFoto(lista[i].archivo);
        const { url } = await adminApi.subirFotoPropiedad(borrador.id, archivo);
        lista[i] = { ...lista[i], url };
        setFotos([...lista]);
      }

      setFase({ texto: 'Publicando…', progreso: 95 });
      const r = await adminApi.publicarPropiedad(borrador.id, {
        imagenes: lista.map((f) => f.url),
        portal: propietario.portal && !propietario.existente?.portal_habilitado,
      });
      setExito(r);
      onPublicada?.();
    } catch (err) {
      setError(`${err.message}${borradorId.current ? ' · Lo avanzado quedó guardado: puedes corregir y reintentar.' : ''}`);
      // Errores de datos del propietario o la ficha: se vuelve al paso correspondiente
      if (/propietario|RUT|banco|cuenta|celular|correo/i.test(err.message)) setPaso(0);
    } finally {
      setFase(null);
    }
  };

  const reiniciar = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.preview));
    borradorId.current = null;
    setPropietario({ modo: 'buscar', existente: null, datos: PROPIETARIO_VACIO, portal: true, editando: false });
    setFicha({ ...FICHA_VACIA, hora_checkin: condiciones?.hora_checkin ?? '', hora_checkout: condiciones?.hora_checkout ?? '' });
    setFotos([]);
    setExito(null);
    setPaso(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/60 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-wizard" className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:max-h-[94vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 id="titulo-wizard" className="flex items-center gap-2 font-bold text-slate-800"><Rocket className="size-5 text-brand-600" /> Publicar propiedad</h2>
          <button type="button" onClick={cerrar} disabled={Boolean(fase)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40" aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        {!exito && (
          <ol className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2.5">
            {PASOS.map(([nombre, Icono], i) => {
              const hecho = i < paso && !hayErrores(errores[i]);
              return (
                <li key={nombre} className="flex-1">
                  <button
                    type="button"
                    onClick={() => (i <= paso ? setPaso(i) : irA(i))}
                    disabled={Boolean(fase)}
                    aria-current={i === paso ? 'step' : undefined}
                    className={`flex w-full min-w-max items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold sm:text-sm ${
                      i === paso ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : hecho ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    <span className={`grid size-5 place-items-center rounded-full text-[11px] ${i === paso ? 'bg-brand-700 text-white' : hecho ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {hecho ? <Check className="size-3" /> : i + 1}
                    </span>
                    <Icono className="hidden size-4 sm:block" /> <span className="hidden md:inline">{nombre}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div ref={cuerpo} className="flex-1 overflow-y-auto p-5 sm:p-6">
          {!condiciones ? (
            error ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : <div className="grid place-items-center py-20"><Loader2 className="size-8 animate-spin text-brand-600" /></div>
          ) : exito ? (
            <ExitoPublicacion propiedad={exito.propiedad} bienvenida={exito.bienvenida} onOtra={reiniciar} onCerrar={onClose} />
          ) : (
            <>
              {paso === 0 && <PasoPropietario valor={propietario} onChange={setPropietario} tiposCuenta={condiciones.tipos_cuenta} mostrarErrores={mostrarErrores} />}
              {paso === 1 && <PasoFicha valor={ficha} onChange={cambiarFicha} mostrarErrores={mostrarErrores} />}
              {paso === 2 && <PasoTecnica valor={ficha} onChange={setFicha} condiciones={condiciones} mostrarErrores={mostrarErrores} />}
              {paso === 3 && <PasoMedios fotos={fotos} onFotos={setFotos} video={ficha.video_url} onVideo={(v) => setFicha({ ...ficha, video_url: v })} mostrarErrores={mostrarErrores} />}
              {paso === 4 && <PasoResumen propietario={propietario} ficha={ficha} fotos={fotos} condiciones={condiciones} />}
            </>
          )}
        </div>

        {condiciones && !exito && (
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
            {error && <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}</p>}
            {fase && (
              <div className="mb-3" role="status">
                <p className="mb-1 text-sm text-slate-600">{fase.texto}</p>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-600 transition-all" style={{ width: `${fase.progreso}%` }} /></div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setPaso(paso - 1)} disabled={paso === 0 || Boolean(fase)} className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 disabled:invisible">
                <ArrowLeft className="size-4" /> Atrás
              </button>
              {paso < 4 ? (
                <button type="button" onClick={() => irA(paso + 1)} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800">
                  Continuar <ArrowRight className="size-4" />
                </button>
              ) : (
                <button type="button" onClick={publicar} disabled={Boolean(fase)} className="flex items-center gap-2 rounded-lg bg-acento-500 px-6 py-2.5 font-bold text-acento-contraste hover:bg-acento-400 disabled:opacity-60">
                  {fase ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} {borradorId.current && error ? 'Reintentar publicación' : 'Publicar propiedad'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
