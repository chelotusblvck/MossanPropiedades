import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../lib/api';
import { Building2, Menu, X, Phone, Mail, UserRound } from 'lucide-react';
import { MARCA, TELEFONO, EMAIL, LOGO, LOGO_CLARO } from '../lib/marca';

const ENLACES = [
  { href: '/propiedades', label: 'Propiedades' },
  { href: '/#servicios', label: 'Servicios' },
  { href: '#contacto', label: 'Contacto' },
];

export function Navbar() {
  const [abierto, setAbierto] = useState(false);
  const [uf, setUf] = useState(null);
  useEffect(() => {
    api.uf().then((u) => setUf(u.valor)).catch(() => {});
  }, []);
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2 text-lg font-extrabold tracking-tight text-brand-900">
          {LOGO ? (
            <img src={LOGO} alt="" className="size-9 shrink-0 rounded-xl object-contain" />
          ) : (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
              <Building2 className="size-5" />
            </span>
          )}
          <span className="truncate">{MARCA}</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {ENLACES.map((e) => (
            <a key={e.href} href={e.href} className="text-sm font-medium text-slate-600 transition hover:text-brand-700">
              {e.label}
            </a>
          ))}
          {uf && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
              UF hoy: {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 2 }).format(uf)}
            </span>
          )}
          <Link to="/mi-cuenta" className="flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition hover:text-brand-900">
            <UserRound className="size-4" /> Mi cuenta
          </Link>
          <a href="#contacto" className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800">
            Publica tu propiedad
          </a>
        </div>

        <div className="flex items-center gap-3 md:hidden">
          <Link to="/mi-cuenta" aria-label="Mi cuenta" className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
            <UserRound className="size-4" /> <span className="hidden sm:inline">Mi cuenta</span>
          </Link>
          <button onClick={() => setAbierto(!abierto)} aria-label="Abrir menú" aria-expanded={abierto}>
            {abierto ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </nav>

      {abierto && (
        <div className="space-y-1 border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          {ENLACES.map((e) => (
            <a key={e.href} href={e.href} onClick={() => setAbierto(false)} className="block rounded-lg px-3 py-2 font-medium text-slate-700 hover:bg-slate-50">
              {e.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer id="contacto" className="bg-brand-950 text-brand-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold text-white">
            {LOGO_CLARO
              ? <img src={LOGO_CLARO} alt="" className="h-8 max-w-32 object-contain" />
              : LOGO ? <img src={LOGO} alt="" className="size-8 rounded-lg bg-white object-contain p-0.5" /> : <Building2 className="size-5" />} {MARCA}
          </p>
          <p className="mt-3 max-w-xs text-sm text-brand-200/80">
            Corretaje de propiedades en venta y arriendo en todo Chile. Te acompañamos desde la búsqueda hasta la firma en notaría.
          </p>
        </div>
        <div>
          <p className="font-semibold text-white">Contacto</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2"><Phone className="size-4" /> {TELEFONO}</li>
            <li className="flex items-center gap-2"><Mail className="size-4" /> {EMAIL}</li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-white">Explora</p>
          <ul className="mt-3 space-y-2 text-sm">
            {ENLACES.map((e) => (
              <li key={e.href}><a href={e.href} className="hover:text-white">{e.label}</a></li>
            ))}
            <li><Link to="/mi-cuenta" className="hover:text-white">Mi cuenta</Link></li>
            <li><Link to="/propietarios/login" className="hover:text-white">Portal de Propietarios</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-brand-200/60">
        © {new Date().getFullYear()} {MARCA}. Todos los derechos reservados.
      </div>
    </footer>
  );
}
