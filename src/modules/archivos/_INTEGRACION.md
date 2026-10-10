# Archivos privados - DigitalOcean Spaces

Módulo hexagonal reutilizable: `FileStoragePort`, `UploadFileUseCase` y
`SpacesStorageAdapter`. La implementación usa AWS Signature V4 con
`node:crypto` y `fetch` nativos; no agrega SDK ni modifica package-lock.

## Variables en Railway / .env de MARCAS-GT-SERVER
```dotenv
DO_SPACES_REGION=nyc3
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_KEY=...
DO_SPACES_SECRET=...
DO_SPACES_BUCKET=...
DO_SPACES_CDN_BASE=... # opcional, no se utiliza para archivos privados
```
Reutiliza las variables que ya maneja el CRM en el entorno de MARCAS, pero
no copies credenciales al frontend ni al repositorio.

La configuración se valida cuando se usa el servicio por primera vez. Los
objetos son privados (x-amz-acl=private), con URLs GET firmadas de 60 segundos.
Si existe una política pública en el bucket, revisarla antes de usar documentos
financieros: los prefijos privados deben permanecer restringidos.

## Integración con Pagos
`POST /pagos/:pagoId/comprobantes/archivo`
Content-Type: multipart/form-data
Campos: `archivo` (JPEG/PNG/WebP/PDF, máx. 10 MB),
`descripcion` opcional y `claveIdempotencia` (8-200 caracteres).
Roles: ADMIN, CONTABILIDAD, VENDEDOR (solo pedidos propios).
Genera un objeto privado y un PagoComprobante auditable.

`GET /pagos/:pagoId/comprobantes/:comprobanteId/archivo`
Retorna `{url,mimeType,descripcion}`; la URL firmada vence en 60 segundos.
Requiere autenticación, empresa correcta y alcance vendedor si aplica.

`DELETE /pagos/:pagoId/comprobantes/:comprobanteId`
Solo ADMIN. Marca eliminadoEn / eliminadoPorId, registra PagoEvento, y
luego intenta borrar el objeto de Spaces. Si Spaces no responde, la referencia
queda oculta e inaccesible desde la aplicación y se reporta
`storageDeleted:false` para seguimiento técnico.

El endpoint antiguo `POST /pagos/:id/comprobantes` se conserva temporalmente
para compatibilidad de clientes existentes; la UI nueva ya no lo usa.
Los links previos (sin key de este módulo) se conservan en la lectura.

La migración es **20261009190000_archivos_pago_spaces_v1**. Ejecutar
`npx prisma migrate deploy` y `npx prisma generate` antes del despliegue.

Otros consumidores podrán inyectar `FILE_STORAGE_PORT` y
`UploadFileUseCase`; cada módulo decide su propio vínculo/permiso.
