export const estiloCampo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export function Campo({ etiqueta, ayuda, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
      {children}
      {error ? <span className="mt-0.5 block text-[11px] font-medium text-rose-600">{error}</span>
        : ayuda && <span className="mt-0.5 block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  );
}

/** Campo numérico que guarda el texto tal cual (vacío = sin dato). */
export function Numero({ valor, onCambio, ...props }) {
  return <input type="number" inputMode="decimal" min={0} value={valor ?? ''} onChange={(e) => onCambio(e.target.value)} className={estiloCampo} {...props} />;
}

export function Titulo({ paso, titulo, descripcion }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-600">Paso {paso} de 5</p>
      <h3 className="text-xl font-extrabold text-slate-800">{titulo}</h3>
      {descripcion && <p className="mt-0.5 text-sm text-slate-500">{descripcion}</p>}
    </div>
  );
}
