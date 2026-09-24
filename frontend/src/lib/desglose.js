// Desglose comercial de una propiedad (mismas reglas que el servidor y la ficha pública)

const n = (v) => Number(v) || 0;

/**
 * Arriendo diario, para una estadía de `noches`: el huésped paga las noches; al propietario se le
 * descuentan aseo, comisión e IVA de la comisión (igual que en las liquidaciones).
 */
export function desgloseDiario({ precio, noches, aseo, comisionPct, ivaPct }) {
  const bruto = n(precio) * n(noches);
  const aseoEf = Math.min(n(aseo), bruto);
  const comision = Math.min(Math.round((bruto * n(comisionPct)) / 100), Math.floor((bruto - aseoEf) / (1 + n(ivaPct) / 100)));
  const iva = Math.round((comision * n(ivaPct)) / 100);
  return { bruto, aseo: aseoEf, comision, iva, neto: bruto - aseoEf - comision - iva };
}

/**
 * Arriendo mensual: la comisión (% de un mes + IVA) la paga el arrendatario al firmar, junto al primer
 * mes y la garantía. El propietario recibe el arriendo completo cada mes.
 */
export function desgloseArriendo({ mensual, garantiaMeses, comisionPct, ivaPct }) {
  const comision = (n(mensual) * n(comisionPct)) / 100;
  const iva = (comision * n(ivaPct)) / 100;
  const garantia = n(mensual) * n(garantiaMeses);
  return { mensual: n(mensual), garantia, comision, iva, inicial: n(mensual) + garantia + comision + iva };
}

/** Venta: la comisión (% del precio + IVA) la paga el comprador; el propietario recibe el precio. */
export function desgloseVenta({ precio, comisionPct, ivaPct }) {
  const comision = (n(precio) * n(comisionPct)) / 100;
  const iva = (comision * n(ivaPct)) / 100;
  return { precio: n(precio), comision, iva, total: n(precio) + comision + iva };
}
