# Facturación V1 — estado de integración

## Alcance funcional actual

El módulo cubre hasta la preparación fiscal del DTE, sin simular certificación externa.

Flujo disponible:

```
Entrega ENTREGADA/PARCIAL
        ↓
candidatos a facturar
        ↓
Factura BORRADOR
        ↓
validación de cantidades / idempotencia
        ↓
configuración fiscal
        ↓
Factura LISTA_EMISION
DocumentoFiscal PREPARADO
```

La certificación real con Grupo CDS permanece deliberadamente pendiente de:

- cotización y contratación;
- credenciales de sandbox/producción;
- contrato API vigente;
- claves/firma del emisor;
- confirmación del proceso productivo de anulación y contingencia.

## Garantías cubiertas por tests

### PostgreSQL Integration

- creación parcial desde cantidades realmente entregadas;
- idempotencia de creación;
- protección contra doble facturación;
- liberación de cantidades al descartar un borrador;
- re-facturación posterior al descarte;
- cálculo proporcional de descuentos;
- preparación fiscal;
- persistencia de impuestos;
- secuencia DTE incremental;
- eventos comerciales y fiscales;
- constraints de montos, tasas, idempotencia y certificación.

### HTTP E2E

- JWT y roles;
- scope de VENDEDOR;
- candidatos paginados;
- configuración fiscal por HTTP;
- creación idempotente;
- detalle enriquecido;
- cantidades disponibles;
- preparación DTE;
- integración externa reportada como deshabilitada;
- descarte;
- auditoría;
- resumen y reporte operacional.

## Grupo CDS

`GrupoCdsFelAdapter` existe como adaptador de infraestructura, pero no certifica ni reconcilia mientras la integración no esté habilitada.

No se crean UUID, serie FEL ni número FEL falsos.

La futura integración debe implementar el contrato `FelProviderPort` sin modificar el dominio comercial.
