-- Comprobantes operativos: snapshots inmutables de salidas y entregas.
-- No altera stock, pedidos, entrega ni facturacion.
CREATE TYPE "TipoComprobanteOperativo" AS ENUM ('SALIDA_DESPACHO', 'ENTREGA');
CREATE TYPE "AccionComprobanteOperativo" AS ENUM ('EMITIDO', 'IMPRESION_SOLICITADA', 'DESCARGA_SOLICITADA', 'COMPARTICION_PREPARADA');

CREATE TABLE "ComprobanteOperativo" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "tipo" "TipoComprobanteOperativo" NOT NULL,
  "referenciaId" INTEGER NOT NULL,
  "numero" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "huellaSha256" VARCHAR(64) NOT NULL,
  "emitidoPorId" INTEGER NOT NULL,
  "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComprobanteOperativo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComprobanteOperativo_numero_key" ON "ComprobanteOperativo"("numero");
CREATE UNIQUE INDEX "ComprobanteOperativo_empresaId_tipo_referenciaId_key" ON "ComprobanteOperativo"("empresaId", "tipo", "referenciaId");
CREATE INDEX "ComprobanteOperativo_empresaId_emitidoEn_idx" ON "ComprobanteOperativo"("empresaId", "emitidoEn");
CREATE INDEX "ComprobanteOperativo_emitidoPorId_emitidoEn_idx" ON "ComprobanteOperativo"("emitidoPorId", "emitidoEn");
ALTER TABLE "ComprobanteOperativo" ADD CONSTRAINT "ComprobanteOperativo_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComprobanteOperativo" ADD CONSTRAINT "ComprobanteOperativo_emitidoPorId_fkey"
  FOREIGN KEY ("emitidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ComprobanteOperativoEvento" (
  "id" SERIAL NOT NULL,
  "comprobanteId" INTEGER NOT NULL,
  "usuarioId" INTEGER NOT NULL,
  "accion" "AccionComprobanteOperativo" NOT NULL,
  "canal" VARCHAR(32),
  "claveIdempotencia" VARCHAR(128) NOT NULL,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComprobanteOperativoEvento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComprobanteOperativoEvento_claveIdempotencia_key" ON "ComprobanteOperativoEvento"("claveIdempotencia");
CREATE INDEX "ComprobanteOperativoEvento_comprobanteId_creadoEn_idx" ON "ComprobanteOperativoEvento"("comprobanteId", "creadoEn");
CREATE INDEX "ComprobanteOperativoEvento_usuarioId_creadoEn_idx" ON "ComprobanteOperativoEvento"("usuarioId", "creadoEn");
ALTER TABLE "ComprobanteOperativoEvento" ADD CONSTRAINT "ComprobanteOperativoEvento_comprobanteId_fkey"
  FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteOperativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComprobanteOperativoEvento" ADD CONSTRAINT "ComprobanteOperativoEvento_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
