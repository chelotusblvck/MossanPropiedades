import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { MoreHorizontal } from 'lucide-react';

const ANCHO = 224; // w-56

/**
 * Menú contextual "⋯" para las acciones de una fila. Se dibuja en un portal con posición fija para que
 * no lo recorten los contenedores con overflow (tablas con scroll horizontal).
 *
 * items: [{ label, icon, onClick | to | href, peligro, deshabilitado, motivo, separador }]
 * `to` abre una ruta interna en otra pestaña; `href` un enlace externo. Los items falsy se ignoran.
 */
export default function MenuAcciones({ items, etiqueta = 'Acciones', disabled = false }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const boton = useRef(null);
  const menu = useRef(null);
  const visibles = items.filter(Boolean);

  // Se ubica bajo el botón, alineado a la derecha; si no cabe abajo, se abre hacia arriba
  useLayoutEffect(() => {
    if (!abierto || !boton.current) return;
    const r = boton.current.getBoundingClientRect();
    const alto = menu.current?.offsetHeight ?? 0;
    const arriba = r.bottom + 4 + alto > window.innerHeight - 8 && r.top - 4 - alto > 8;
    setPos({
      top: arriba ? r.top - 4 - alto : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)),
    });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const fuera = (e) => {
      if (!menu.current?.contains(e.target) && !boton.current?.contains(e.target)) cerrar();
    };
    const tecla = (e) => {
      if (e.key === 'Escape') {
        cerrar();
        boton.current?.focus();
      }
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    menu.current?.querySelector('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [abierto]);

  // Flechas arriba/abajo entre las opciones
  const navegar = (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const opciones = [...menu.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')];
    const i = opciones.indexOf(document.activeElement);
    const siguiente = e.key === 'ArrowDown' ? (i + 1) % opciones.length : (i - 1 + opciones.length) % opciones.length;
    opciones[siguiente]?.focus();
  };

  const clase = (it) =>
    `flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition ${
      it.deshabilitado
        ? 'cursor-not-allowed text-slate-300'
        : it.peligro
          ? 'text-rose-600 hover:bg-rose-50 focus:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50'
    }`;

  const elegir = (it) => {
    if (it.deshabilitado) return;
    setAbierto(false);
    it.onClick?.();
  };

  return (
    <>
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={etiqueta}
        title={etiqueta}
        className={`rounded-lg p-1.5 text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-brand-700 disabled:opacity-50 ${abierto ? 'bg-slate-100 text-brand-700' : ''}`}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {abierto &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={etiqueta}
            onKeyDown={navegar}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: ANCHO }}
            className="fixed z-[60] overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200"
          >
            {visibles.map((it, i) => {
              const Icono = it.icon;
              const contenido = (
                <>
                  {Icono && <Icono className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                </>
              );
              const comunes = { role: 'menuitem', tabIndex: -1, title: it.deshabilitado ? it.motivo : undefined, className: clase(it) };
              return (
                <div key={i} className={it.separador ? 'mt-1 border-t border-slate-100 pt-1' : ''}>
                  {it.to && !it.deshabilitado ? (
                    <Link to={it.to} target="_blank" onClick={() => setAbierto(false)} {...comunes}>{contenido}</Link>
                  ) : it.href && !it.deshabilitado ? (
                    <a href={it.href} target="_blank" rel="noreferrer" onClick={() => setAbierto(false)} {...comunes}>{contenido}</a>
                  ) : (
                    <button type="button" onClick={() => elegir(it)} aria-disabled={it.deshabilitado || undefined} {...comunes}>{contenido}</button>
                  )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
