# Dashboard ADMIN — contrato de solo lectura

## Seguridad
Todos los endpoints requieren JWT, usuario activo, rol `ADMIN` y una empresa asignada al usuario. **No se admite un `empresaId` desde la petición.** Los indicadores se consultan siempre con la empresa resuelta desde el actor. La tabla legacy `Cliente` carece de empresa: solo se cuentan clientes con pedidos de esa empresa. No se modifica ningún registro.

## Endpoints

| Endpoint | Bloques de `sections` |
| --- | --- |
| `GET /dashboard/admin/resumen` | finanzas, pedidos, cartera, inventario, logistica, abastecimiento, clientes, facturacion |
| `GET /dashboard/admin/alertas` | pagosPorVerificar, creditosPorAprobar, cuotasVencidas, despachosFallidos, incidenciasTransporte, requisicionesPorAprobar |
| `GET /dashboard/admin/agenda` | proximosCobros, pedidosPendientes, salidasProgramadas, transferenciasPorRecibir |
| `GET /dashboard/admin/graficos` | cobrosDiarios, pedidosDiarios, carteraAntiguedad, despachosPorEstado |
| `GET /dashboard/admin/actividad` | ultimosPedidos, ultimosPagos, ultimosEnvios |
| `GET /dashboard/admin/live` | enviosEnRuta, personalEnCampo |

**Parámetros comunes:** `desde` y `hasta` opcionales en `YYYY-MM-DD`, máximo 365 días; por defecto los últimos 30 días en Guatemala, incluyendo hoy. `limit`: entre 1 y 20, por defecto 10; limita listas, no totales.

## Respuesta

```json
{
  "view": "alertas",
  "empresaId": 1,
  "generatedAt": "2026-10-09T12:00:00.000Z",
  "timezone": "America/Guatemala",
  "period": { "desde": "2026-09-10", "hasta": "2026-10-09" },
  "partial": true,
  "sections": {
    "pagosPorVerificar": {
      "status": "OK",
      "data": { "total": 0, "items": [] }
    },
    "incidenciasTransporte": { "status": "UNAVAILABLE", "data": null }
  }
}
```

El ejemplo muestra solo dos de las secciones que incluye la respuesta real.

- **`OK` con cero/array vacío:** consulta completada, no existen registros.
- **`UNAVAILABLE` con `data:null`:** error o demora mayor que 6 segundos en la consulta de esa sección; mostrar placeholder y permitir reintento.
- **`partial:true`:** al menos una sección no está disponible. Las demás siguen siendo utilizables.
- Autorizaciones rechazadas se comunican como HTTP 401/403; las fechas inválidas como HTTP 400. Nunca se convierten en valores vacíos.
- Un valor monetario se devuelve como **cadena decimal de dos posiciones**, no float.
- Un registro de `items` conserva identificadores de origen para abrir el módulo correspondiente.

## Significado de los indicadores

- **Cobros:** pagos en estado `VERIFICADO`, agrupados por `verificadoEn`. Incluyen anticipos y pagos de cuotas; no son necesariamente ventas ni dinero disponible para aplicar.
- **Pedidos:** monto neto de pedidos creados en el rango, excluyendo cancelados. No son cobros recibidos.
- **Cartera:** saldos de CxC pendientes, parciales y vencidas. Anticipos vinculados a CxC pueden formar parte de cartera mientras permanezcan impagos.
- **Por vencer:** CxC con vencimiento desde el instante actual hasta siete días posteriores. Es una proyección de obligaciones, no ingresos garantizados.
- **Actividad reciente:** últimas operaciones de la empresa; no se limita al filtro temporal cuando la sección es un feed de últimos eventos.
- **Clientes:** clientes distintos asociados a pedidos de la empresa. No es un conteo universal de `Cliente`.
- **Tracking:** sesiones activas y sesiones sin heartbeat por 10 minutos, no usuarios con sesión web abierta. La posición se muestra solo si se ha recibido una ubicación.
- **Inventario:** unidades físicas, reservadas y disponibles; no se presenta una valoración monetaria aún.
- **Gráficos diarios:** agregaciones SQL con fecha local `America/Guatemala`, por ahora se emiten los días que tienen datos. El frontend puede rellenar días ausentes con cero solo si `status=OK`.
- Los widgets financieros corresponden a moneda operativa GTQ; antes de habilitar multimoneda habrá que agrupar por `moneda`.

## Patrón de integración para UI

Consumir los seis endpoints con sus propios cachés. No bloquear el dashboard completo si falla uno. Actualizaciones sugeridas:
- resumen/alertas: cada 60 segundos
- agenda y actividad: cada 60–120 segundos
- gráficos: cada 5–15 minutos o al cambiar fechas
- live: cada 15–30 segundos; el mapa detallado continúa en Tracking

Este módulo no introduce migraciones ni crea dependencias transaccionales en Pedidos, Créditos, Pagos o Transporte.
