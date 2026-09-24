/** Selector de opciones excluyentes en forma de botones. opciones: [[valor, etiqueta], ...] */
export default function Segmentado({ valor, opciones, onCambiar, etiqueta }) {
  return (
    <div role="group" aria-label={etiqueta} className="inline-flex flex-wrap rounded-lg bg-slate-100 p-0.5">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onCambiar(k)}
          aria-pressed={valor === k}
          className={`rounded-md px-3 py-1 text-sm font-semibold ${valor === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
