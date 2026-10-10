# Comprobantes operativos V1

Modulo hexagonal independiente de Facturacion, Inventario, Despachos y Entregas. No emite FEL, no cobra, no mueve existencias ni altera estados de los procesos operativos.

## Arquitectura

- domain: contratos tipados, errores y puertos de documento/almacenamiento.
- application: vista previa, emision idempotente, consulta historica y auditoria.
- infrastructure: adaptadores Prisma para actor, hechos fuente y snapshots inmutables.
- presentation: HTTP NestJS DTO/ValidationPipe, JwtGuard y manejo de errores.

No se aplican filtros de rol en este modulo: la UI controla navegacion/acciones. **El backend si verifica JWT, cuenta activa y pertenencia a la empresa** antes de exponer o emitir documentos.

## Contrato HTTP

| Metodo | Endpoint | Efecto |
|---|---|---|
| GET | /comprobantes/despachos/:despachoId/salidas/:operacionId/vista-previa | Devuelve snapshot propuesto o el ya emitido; no escribe |
| POST | /comprobantes/despachos/:despachoId/salidas/:operacionId/emitir | Emite o reutiliza comprobante de una salida aplicada |
| GET | /comprobantes/entregas/:entregaId/vista-previa | Preview de entrega terminal |
| POST | /comprobantes/entregas/:entregaId/emitir | Emite o reutiliza comprobante de entrega finalizada |
| GET | /comprobantes/:id | Consulta el snapshot historico |
| POST | /comprobantes/:id/acciones | Registra IMPRESION_SOLICITADA, DESCARGA_SOLICITADA o COMPARTICION_PREPARADA |

Todos requieren Bearer JWT. El body de acciones es:
\`\`\`json
{"accion":"IMPRESION_SOLICITADA","canal":"TERMICA_80MM","claveIdempotencia":"uuid-generado-por-el-frontend"}
\`\`\`
Los eventos de compartir registran preparacion del archivo/enlace; **no equivalen a enviar WhatsApp, email o confirmar entrega externa**.

### Regla de despacho
El documento referencia **una OperacionDespacho SALIDA_DESPACHO APLICADA**, no la orden acumulada. Todas sus lineas deben estar aplicadas, con un MovimientoInventario SALIDA_DESPACHO, mismo producto, bodega y cantidad. Debe funcionar con salidas parciales.

### Regla de entrega
La entrega debe estar finalizada y en ENTREGADA, PARCIAL, RECHAZADA o NO_ENTREGADA. RECHAZADA/NO_ENTREGADA emiten una CONSTANCIA_INTENTO_ENTREGA, nunca una afirmacion de recepcion aceptada. Incluye receptor, responsable de transporte, evidencias y ubicación final si existe.

### Integridad
Una fila por empresa + tipo + referencia. La primera emision crea snapshot JSONB versionado con SHA256, numero NSB/CEN y evento EMITIDO atomicamente. La reemision devuelve exactamente el snapshot original y el mismo numero, incluso si luego cambia Cliente o Producto. Acciones tienen clave idempotente y auditoria separada.

La representacion A4 y termica se implementara en la UI, sin nuevas escrituras en el origen. No existe aun un generador PDF ni integración de envio en el servidor. Archivos de evidencia se referencian por storage key; si el link expira, la futura UI debe resolverlo mediante un acceso autorizado.

## Migracion

Revisar primero en staging:
\`\`\`bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
npm test -- --runInBand comprobantes
npm run build
\`\`\`
Migracion aditiva: 20261009014000_comprobantes_operativos_v1. No borra ni migra registros existentes.
