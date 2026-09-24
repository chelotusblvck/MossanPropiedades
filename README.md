# Inmobiliaria Chile — Venta y Arriendo de Propiedades

Sitio web de propiedades (React + Tailwind) con API en Node.js + Express, precios en UF y CLP,
y sincronización automática de publicaciones desde **Portalinmobiliario / Mercado Libre** vía OAuth2.

```
backend/    API Express + SQLite (node:sqlite, sin dependencias nativas)
frontend/   Vite + React 19 + Tailwind CSS v4
```

## Puesta en marcha

Requiere Node.js 22.13 o superior.

```bash
npm run install:all      # instala raíz, backend y frontend
cp backend/.env.example backend/.env   # y completa las variables
npm run seed             # 12 propiedades (las 4 modalidades) y reservas de ejemplo
npm run dev              # API en :4000 y web en http://localhost:5173
```

- Sitio público: `/` (buscador), `/propiedad/:id` (detalle; reserva por calendario si es arriendo diario)
- Panel: `/admin` (contraseña `ADMIN_PASSWORD` de `backend/.env`)

Producción: `npm run build && npm start` (Express sirve `frontend/dist`).

## Modalidades de negocio

| `modalidad` | Precio | En el sitio | Disponibilidad |
|---|---|---|---|
| `venta` | total | pestaña "Comprar" | flag `disponible` (Libre / Vendida) |
| `arriendo_anual` | mensual | "Arriendo anual" | flag `disponible` (Libre / Arrendada) |
| `arriendo_marzo_diciembre` | mensual | "Marzo–Diciembre" | flag `disponible` (Libre / Arrendada) |
| `arriendo_diario` | por noche | "Por noche" + filtro de fechas | calendario de reservas |

Las propiedades con `disponible = false` no se muestran en el sitio público. `operacion` (`venta`/`arriendo`) se deriva
automáticamente de la modalidad. Las bases creadas con la versión anterior se migran solas al iniciar.

Portalinmobiliario no distingue "marzo a diciembre": las publicaciones sincronizadas entran como `arriendo_anual`
(o `arriendo_diario` si son "Arriendo de temporada"). Si la corredora cambia la modalidad desde `/admin`, las
sincronizaciones posteriores la respetan.

## Reservas (arriendo diario)

Tabla `reservas`: `propiedad_id, fecha_inicio (check-in), fecha_fin (check-out), cliente_nombre, cliente_email,
cliente_telefono, huespedes, notas, noches, monto_total_clp, estado_pago (pendiente | pagado | cancelado)`.

- Una solicitud desde el sitio queda **pendiente** y **bloquea las fechas** de inmediato, para evitar dobles reservas.
  La corredora la marca como pagada o la cancela desde `/admin` (al cancelar se liberan las fechas).
- El traslape se verifica dentro de una transacción; si dos personas piden las mismas noches, la segunda recibe `409`.
- El calendario del sitio se actualiza cada 30 s y al volver a la pestaña.
- Límite de 5 solicitudes cada 15 min por IP.

### Ficha de venta y arriendo mensual (`/propiedad/:id`)

Las propiedades en **venta**, **arriendo año corrido** y **marzo–diciembre** tienen su propia ficha:

- **Galería interactiva:** flechas, deslizar en móvil, miniaturas y visor a pantalla completa (teclado ← → Esc).
- **Desglose de precios en UF y CLP** convertido con la UF del día (mindicador.cl):
  - Venta: precio, comisión del corredor y total con comisión.
  - Arriendo: arriendo + gastos comunes = total mensual; pago inicial (primer mes + garantía + comisión);
    en marzo–diciembre, además el total de los 10 meses.
- **Ficha técnica:** dormitorios, baños, superficies, estacionamientos, bodegas, gastos comunes, amoblado, mascotas,
  año de construcción, orientación, comisión y garantía ("No informado" si falta el dato).
- **Solicitar una visita:** se guarda en la pestaña **Visitas** del panel (estados nueva / contactada / agendada /
  descartada, notas internas, WhatsApp directo), se avisa por correo a la corredora y el interesado recibe un acuse.
  Tiene límite de 5 solicitudes cada 15 min por IP y un campo trampa oculto contra bots.
- **Botón flotante de WhatsApp** con un mensaje prearmado (propiedad, precio y enlace).

La comisión por defecto se configura en `backend/.env` (`COMISION_VENTA_PCT=2`, `COMISION_ARRIENDO_PCT=50`,
`COMISION_MAS_IVA=true`). La ficha técnica, la comisión y la garantía de cada propiedad se editan en el panel con el
botón ✏️ de cada fila del inventario. Endpoints: `POST /api/propiedades/:id/visitas`, `GET /api/admin/visitas`,
`PATCH /api/admin/visitas/:id`.

### Pago en línea

Cada reserva tiene un **enlace de pago secreto** (`/pago/<código>`): aparece tras reservar ("Pagar ahora"), en el
correo de acuse y en el panel ("Enviar enlace de pago" por WhatsApp). El monto siempre lo calcula el servidor.

| Método | Cómo se confirma | Configuración (`backend/.env`) |
|---|---|---|
| **Webpay Plus** (débito, crédito, prepago) | Automático: al volver de Transbank se hace el *commit* y la reserva queda pagada | `WEBPAY_AMBIENTE=integracion` (pruebas) o `produccion` + `WEBPAY_CODIGO_COMERCIO` + `WEBPAY_API_KEY` |
| **Mercado Pago** (cuenta Mercado Libre de la corredora) | Automático: retorno del navegador + webhook; siempre se reconsulta el pago a la API | `MP_ACCESS_TOKEN` |
| **Transferencia bancaria** | Manual: el cliente la informa, la corredora recibe un correo y la marca pagada en el panel | `BANCO_*` |

Sólo se muestran los métodos configurados. Al aprobarse un pago en línea: la reserva pasa a *pagada*, el cliente
recibe la confirmación y la corredora el aviso "Pago recibido". Casos cubiertos:

- Si la reserva ya no está pendiente al volver de Webpay, **no se hace commit** (Transbank no cobra).
- Cada pago se procesa una sola vez (recarga de la página de retorno, webhook repetido).
- Pagos duplicados, sobre reservas canceladas o con monto distinto → correo "Revisar pago" a la corredora.
- Sólo se guardan los 4 últimos dígitos de la tarjeta; nunca pasan datos de tarjeta por el servidor.

**Portalinmobiliario no tiene API de cobro de reservas**: los pagos del ecosistema Mercado Libre se hacen con
Mercado Pago, que deposita en la misma cuenta de la corredora. El access token se obtiene en
<https://www.mercadopago.cl/developers/panel> → *Tus integraciones* → *Credenciales de producción*.
El webhook y el regreso automático de Mercado Pago requieren que `SITE_URL` sea una URL pública **https**.

**Probar Webpay** (`WEBPAY_AMBIENTE=integracion`): tarjeta Visa `4051 8856 0044 6623`, vencimiento cualquiera futuro,
CVV `123`; en el banco simulado RUT `11.111.111-1`, clave `123`. Para pasar a producción Transbank exige completar su
proceso de validación con el código de comercio de la corredora.

Endpoints: `GET /api/pagos/:codigo`, `POST /api/pagos/:codigo/{webpay|mercadopago|transferencia}`,
`GET|POST /api/pagos/webpay/retorno`, `GET /api/pagos/mercadopago/retorno`, `POST /api/pagos/mercadopago/webhook`.

### Liberación automática de reservas no pagadas

Cada reserva nueva queda **pendiente con un plazo de pago** (`RESERVA_PLAZO_PAGO_HORAS`, 24 h por defecto; `0` =
nunca vence). El cliente ve el plazo al reservar, en el correo de acuse y en la página de pago. Cada 5 minutos (y al
arrancar el servidor) las reservas vencidas se **cancelan con motivo "vencida"**, sus fechas vuelven a estar
disponibles, el cliente recibe el correo "Tu reserva venció" y la corredora un resumen.

No se liberan aunque el plazo haya pasado:
- reservas con **transferencia informada** (la corredora debe verificarla y decidir);
- reservas con un **pago en proceso** en Mercado Pago;
- reservas con un **pago iniciado hace menos de 30 minutos** (el cliente puede estar en el formulario de Webpay).

Si un pago en línea se aprueba **después** de que la reserva venció y las fechas siguen libres, se acepta y la reserva
queda pagada; si otra persona ya tomó esas fechas, no se cobra (Webpay) o se avisa a la corredora para devolverlo.

En el panel (pestaña Reservas) cada pendiente muestra cuánto le queda, con botones **+24 h** y **Sin plazo**
(`PATCH /api/admin/reservas/:id/plazo` con `{ horas: 24 }` o `{ horas: null }`). Reactivar una reserva cancelada le da
un plazo nuevo. Las reservas pendientes creadas antes de esta función no tienen plazo.

### Avisos por correo

Cada solicitud de reserva envía (en segundo plano, sin demorar la respuesta al cliente):

1. **Aviso a la corredora** (`NOTIFY_EMAIL`, uno o varios separados por coma): propiedad, fechas, noches, total,
   datos del cliente con enlace a WhatsApp y botón al panel. "Responder" le escribe directo al cliente.
2. **Acuse al cliente** (desactivable con `NOTIFY_CLIENT=false`): resumen de la solicitud, estado pendiente de pago.

Y cuando la corredora cambia el estado en `/admin`, el cliente recibe:

- **Reserva confirmada** (al marcarla *pagada*): dirección, horario de check-in (`HORA_CHECKIN`) y check-out
  (`HORA_CHECKOUT`), huéspedes y total pagado.
- **Reserva cancelada** (al marcarla *cancelada*): fechas liberadas y botón para buscar otras fechas.

Sólo se envían si el estado realmente cambia y la reserva no terminó (cancelar reservas antiguas para ordenar el
panel no le escribe al cliente). También dependen de `NOTIFY_CLIENT`. El panel muestra un aviso cuando se envió el
correo, y la respuesta de `PATCH /api/admin/reservas/:id` incluye `aviso_cliente: true|false`.

Configura el SMTP en `backend/.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) y
revisa `SITE_URL`, `BRAND_NAME` y `CONTACT_PHONE`, que aparecen en los correos. Para comprobarlo:

```bash
npm run probar-correo --prefix backend               # a NOTIFY_EMAIL
npm run probar-correo --prefix backend -- otro@correo.cl
```

Sin `SMTP_HOST` los correos se imprimen en la consola del backend (útil en desarrollo). Si el envío falla, la reserva
igual queda guardada y el error se registra en la consola. Con Gmail usa `smtp.gmail.com`, puerto `465`,
`SMTP_SECURE=true` y una [contraseña de aplicación](https://myaccount.google.com/apppasswords).

### Agenda de llaves y aseo

Las tareas **se generan solas a partir de las reservas pagadas** (las pendientes no aparecen hasta marcarse como
pagadas; las canceladas desaparecen):

| Tarea | Día | Hora por defecto |
|---|---|---|
| 🔑 Entrega de llaves | llegada | `HORA_CHECKIN` (15:00) |
| ↩️ Recepción de llaves | salida | `HORA_CHECKOUT` (11:00) |
| 🧹 Aseo | salida | `HORA_CHECKOUT` (11:00) |

No se copian a otra tabla: se calculan en cada consulta, así que cualquier cambio en las reservas se refleja de
inmediato. La tabla `agenda_tareas` sólo guarda lo que la corredora edita (hora, responsable, hecha, notas), y eso se
conserva aunque una reserva se cancele y se reactive. El panel se refresca cada minuto y al volver a la pestaña.

- **Ruta de llaves del día:** paradas ordenadas por hora (a igual hora, primero la misma propiedad o comuna de la
  parada anterior), enlace a Google Maps con la ruta completa (parte en `ORIGEN_RUTA` si está configurado) y texto
  listo para WhatsApp.
- **Aseos:** se asignan automáticamente al responsable por defecto de cada propiedad (o a quien elijas en la tarea).
  Si ese mismo día llega otro huésped, la tarea se marca como **recambio** urgente. Botón para enviar a cada persona
  su lista del día por WhatsApp.
- **Personal y direcciones:** registro de personal (aseo / llaves / ambos), dirección de cada propiedad para la ruta y
  responsable de aseo por defecto.

Endpoints: `GET /api/admin/agenda?desde=&hasta=` (máx. 62 días), `PUT /api/admin/agenda/tareas/:reservaId/:tipo`
(`{ hora, responsable_id, estado, notas }`) y `GET|POST /api/admin/personal`, `PATCH|DELETE /api/admin/personal/:id`.

### Bloqueos manuales

Tabla `bloqueos`: `propiedad_id, fecha_inicio (primera noche), fecha_fin (primer día libre), motivo`. Sirven para uso
del propietario, mantención o reservas tomadas por otros canales (Airbnb, Booking). Un bloqueo cuenta como ocupado en
todas partes: calendario público, búsqueda por fechas, validación de reservas y reactivación de reservas canceladas.
No se puede bloquear encima de una reserva activa (hay que cancelarla primero) ni encima de otro bloqueo.

## Panel `/admin`

- **Disponibilidad:** indicadores por modalidad, tablero de ocupación de arriendo diario (35 días, navegable por semanas;
  clic en una reserva para ver al cliente y cambiar el estado de pago; clic en un día libre o en "Bloquear" para
  bloquear fechas; clic en un bloqueo para eliminarlo) y listas de año corrido, marzo–diciembre y venta
  para cambiar modalidad y marcar Libre / Arrendada / Vendida.
- **Reservas:** listado con filtros, contacto directo por WhatsApp / correo y cambio de estado de pago.
- **Agenda:** calendario mensual de tareas operativas del arriendo diario (ver abajo).
- **Ficha de marketing** (botón "Ficha" en cada propiedad libre): texto listo para Instagram, Facebook o WhatsApp con
  precio en UF/CLP, características y enlace; copiar, descargar resumen (.txt con enlaces a las fotos), enviar por
  WhatsApp o descargar una **imagen 1080×1350** con foto, precio y datos para publicar directo.

## Modelo `Propiedad`

| Campo | Descripción |
|---|---|
| `titulo`, `descripcion` | Texto de la publicación |
| `precio_uf`, `precio_clp` | Ambos se guardan; el de `moneda_original` es el real y el otro se deriva con la UF del día |
| `moneda_original` | `UF` o `CLP` |
| `modalidad` | `venta`, `arriendo_anual`, `arriendo_marzo_diciembre`, `arriendo_diario` |
| `operacion` | `venta` o `arriendo` (derivada de `modalidad`) |
| `disponible` | `false` = arrendada / vendida |
| `tipo` | `casa`, `departamento`, `terreno`, `oficina`, `local`, `parcela`, `otro` |
| `comuna`, `region`, `direccion` | Ubicación |
| `habitaciones`, `banos`, `estacionamientos` | Programa |
| `superficie_util`, `superficie_total` | m² |
| `imagenes` | Arreglo de URLs |
| `id_portalinmobiliario` | ID del ítem en Mercado Libre (`MLC…`), único |
| `origen`, `estado`, `destacada`, `permalink` | Metadatos |

El valor UF se obtiene de mindicador.cl (con caché de 6 h) y los precios derivados se recalculan automáticamente.

## Endpoints

| Método | Ruta | Auth | |
|---|---|---|---|
| GET | `/api/propiedades` | — | Filtros: `modalidad, tipo, comuna, moneda (UF/CLP), precio_min, precio_max, llegada, salida, dormitorios_min, banos_min, q, orden, page, limit` |
| GET | `/api/propiedades/comunas` | — | Comunas con propiedades activas |
| GET | `/api/propiedades/:id` | — | |
| GET | `/api/propiedades/:id/disponibilidad` | — | Rangos ocupados (sin datos personales) |
| POST | `/api/propiedades/:id/reservas` | — | Solicitud de reserva (arriendo diario) |
| POST / PUT / DELETE | `/api/propiedades[/:id]` | admin | Crear / editar / eliminar |
| POST | `/api/admin/login` | — | `{ password }` → token de sesión (12 h) |
| GET | `/api/admin/inventario?desde=&dias=` | admin | Inventario, ocupación y resumen |
| GET | `/api/admin/reservas?estado=&propiedad_id=&desde=` | admin | Listado de reservas |
| PATCH | `/api/admin/reservas/:id` | admin | `{ estado_pago }` |
| GET | `/api/admin/propiedades/:id/ocupacion` | admin | Reservas + bloqueos (próximos 18 meses) |
| POST | `/api/admin/propiedades/:id/bloqueos` | admin | `{ fecha_inicio, fecha_fin, motivo }` |
| DELETE | `/api/admin/bloqueos/:id` | admin | Libera las fechas |
| GET | `/api/indicadores/uf` | — | Valor UF del día |
| GET | `/api/mercadolibre/auth?key=…` | admin | Inicia OAuth2 (redirige a Mercado Libre) |
| GET | `/api/mercadolibre/callback` | — | Recibe el `code` y guarda los tokens |
| GET | `/api/mercadolibre/status` | admin | Estado de conexión + historial de sincronizaciones |
| POST | `/api/mercadolibre/sync` | admin | Sincronización manual |
| POST | `/api/mercadolibre/notifications` | — | Webhook de Mercado Libre (tópico `items`) |
| DELETE | `/api/mercadolibre/disconnect` | admin | Elimina los tokens |

"admin" = `Authorization: Bearer <token>` (panel) o header `x-api-key: <ADMIN_API_KEY>` (scripts).

## Conectar Portalinmobiliario / Mercado Libre

1. Crea una aplicación en <https://developers.mercadolibre.cl/devcenter> con la cuenta del cliente.
   - **URI de redirect:** `https://TU-DOMINIO/api/mercadolibre/callback` (debe ser HTTPS en producción e igual a `MELI_REDIRECT_URI`).
   - **Scopes:** lectura y `offline_access` (necesario para obtener `refresh_token`).
   - **PKCE:** actívalo (el backend lo usa por defecto; `MELI_USE_PKCE=false` para desactivarlo).
   - **Notificaciones (opcional):** URL `https://TU-DOMINIO/api/mercadolibre/notifications`, tópico `items`.
2. Copia `Client ID` y `Client Secret` a `backend/.env`.
3. Abre en el navegador `http://localhost:4000/api/mercadolibre/auth?key=TU_ADMIN_API_KEY` e inicia sesión con la cuenta del cliente.
4. Al volver, se ejecuta la primera sincronización. Luego se repite cada `MELI_SYNC_INTERVAL_MINUTES` y en tiempo real con el webhook.

La sincronización trae todas las publicaciones **activas** del usuario (`/users/{id}/items/search` en modo *scan*),
obtiene el detalle en lotes de 20 (`/items?ids=`) y la descripción, las inserta/actualiza por `id_portalinmobiliario`
y marca como `inactiva` las que dejaron de estar activas en el portal. Los tokens se renuevan solos (el access token dura 6 h).
