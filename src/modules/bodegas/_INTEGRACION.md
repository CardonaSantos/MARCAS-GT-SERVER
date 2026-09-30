# Bodegas — módulo hexagonal

Este directorio está diseñado para copiarse completo en `src/bodegas`.

## 1. Requisitos del schema Prisma

El módulo asume que `Bodega` tiene, además de sus relaciones de inventario ya creadas:

```prisma
model Bodega {
  id                    Int       @id @default(autoincrement())
  empresaId             Int
  codigo                String    @unique
  nombre                String
  descripcion           String?
  direccion             String?
  telefono              String?
  esPrincipal           Boolean   @default(false)
  responsableId         Int?
  activo                Boolean   @default(true)
  motivoInactivacion    String?
  inactivadaEn          DateTime?
  creadoEn              DateTime  @default(now())
  actualizadoEn         DateTime  @updatedAt

  empresa               Empresa   @relation(fields: [empresaId], references: [id], onDelete: Restrict)
  responsable           Usuario?  @relation("BodegaResponsable", fields: [responsableId], references: [id], onDelete: SetNull)

  stocks                StockBodega[]
  movimientos           MovimientoInventario[]
  requisiciones         Requisicion[]
  transferenciasOrigen  TransferenciaBodega[] @relation("TransferenciaBodegaOrigen")
  transferenciasDestino TransferenciaBodega[] @relation("TransferenciaBodegaDestino")
  ordenesDespacho       OrdenDespacho[]
  eventos               BodegaEvento[]

  @@index([activo])
  @@index([esPrincipal])
  @@index([responsableId])
}
```

No hay coordenadas en Bodega.

También requiere:

```prisma
enum TipoEventoBodega {
  CREADA
  ACTUALIZADA
  ACTIVADA
  DESACTIVADA
  RESPONSABLE_ASIGNADO
  RESPONSABLE_REMOVIDO
  ESTABLECIDA_PRINCIPAL
}

model BodegaEvento {
  id        Int              @id @default(autoincrement())
  bodegaId  Int
  usuarioId Int?
  tipo      TipoEventoBodega
  detalle   String?
  metadata  Json?
  creadoEn  DateTime         @default(now())

  bodega    Bodega           @relation(fields: [bodegaId], references: [id], onDelete: Cascade)
  usuario   Usuario?         @relation("BodegaEventoUsuario", fields: [usuarioId], references: [id], onDelete: SetNull)

  @@index([bodegaId, creadoEn])
  @@index([usuarioId])
}
```

Y en `Usuario`:

```prisma
bodegasResponsable Bodega[]       @relation("BodegaResponsable")
eventosBodega       BodegaEvento[] @relation("BodegaEventoUsuario")
```

## 2. Bodega principal única

Como MARCAS GT usa una empresa por base de datos, debe existir como máximo una bodega principal en toda la base.

Crea la migración sin aplicarla primero:

```bash
npx prisma migrate dev --name bodegas_v1_operativa --create-only
```

Al final del `migration.sql` generado agrega:

```sql
CREATE UNIQUE INDEX "Bodega_unica_principal"
ON "Bodega" ("esPrincipal")
WHERE "esPrincipal" = true;
```

Después aplica y valida:

```bash
npx prisma migrate dev
npx prisma validate
npx prisma generate
npx prisma migrate status
```

## 3. AppModule

Una vez copiado este directorio:

```ts
import { BodegaModule } from './bodegas';
```

Y en `imports`:

```ts
BodegaModule,
```

No requiere registrar servicios adicionales fuera del módulo.

## 4. Endpoints

- `POST /bodegas` — crear. ADMIN.
- `GET /bodegas` — tabla server-side.
- `GET /bodegas/seleccionables` — selects/autocomplete.
- `GET /bodegas/principal` — bodega principal.
- `GET /bodegas/resumen` — resumen operativo.
- `GET /bodegas/:id` — detalle enriquecido.
- `GET /bodegas/:id/eventos` — auditoría paginada.
- `PATCH /bodegas/:id` — datos generales. ADMIN.
- `PATCH /bodegas/:id/responsable` — asignar/quitar responsable. ADMIN.
- `PATCH /bodegas/:id/activar` — ADMIN.
- `PATCH /bodegas/:id/desactivar` — ADMIN, con comprobaciones operativas.
- `PATCH /bodegas/:id/principal` — ADMIN.

`GET /bodegas` acepta:

- `page`, `limit`
- `search`
- `activo`
- `esPrincipal`
- `responsableId`
- `sortBy=nombre|codigo|creadoEn|actualizadoEn`
- `sortDir=asc|desc`

No existe filtro `empresaId`: una base de datos representa una empresa.

## 5. Contrato público para los siguientes módulos

`BodegaModule` exporta únicamente `BODEGA_DIRECTORY`.

Inventario, transferencias, pedidos o despachos podrán importar `BodegaModule` e inyectar ese token para localizar una bodega o la principal sin depender de Prisma ni del repositorio interno de Bodegas.

El puerto `BodegaOperationalDependenciesPort` ya separa la regla de desactivación de sus dependencias externas. La implementación actual consulta las tablas operativas existentes mediante Prisma. Cuando Inventario/Despachos se refactoricen, el caso de uso no necesita cambiar: solo puede sustituirse el adapter.

## 6. Seguridad

El controller usa `AuthGuard('jwt')` existente. Como el `JwtStrategy` actual solo expone `userId`, `BodegaRolesGuard` vuelve a consultar al usuario para validar que siga activo y para obtener su rol.

Lectura: `ADMIN`, `BODEGA`, `VENDEDOR`, `CONTABILIDAD`, `REPARTIDOR`.

Mutaciones administrativas: `ADMIN`.

Responsable permitido: usuario activo con rol `ADMIN` o `BODEGA`.

## 7. Decisiones importantes

- Sin `DELETE`: una bodega se desactiva.
- La primera bodega queda automáticamente como principal.
- Código normalizado a mayúsculas y único.
- Cambio de principal transaccional.
- Mutaciones y auditoría se guardan en la misma transacción Prisma.
- El listado está paginado en servidor y enriquecido por lotes; no hace N+1 por bodega.
- El detalle expone bloqueos de desactivación y últimos eventos.
- No se expone `empresaId` por HTTP.
- Domain/Application no dependen de NestJS ni Prisma.
