-- ============================================================================
-- FACTURACION V1 - CHECKS COMPLEMENTARIOS DE AUDITORIA E IMPUESTOS
-- ============================================================================
-- Esta migracion agrega constraints introducidos por el ajuste de esquema
-- posterior a facturacionv1. Se mantiene separada porque las migraciones
-- anteriores ya fueron aplicadas.

ALTER TABLE "EmpresaPerfilFiscal"
ADD CONSTRAINT "EmpresaPerfilFiscal_tasaIvaDefault_check"
CHECK (
  "tasaIvaDefault" IS NULL
  OR ("tasaIvaDefault" >= 0 AND "tasaIvaDefault" <= 100)
);

ALTER TABLE "FacturaDetalleImpuesto"
ADD CONSTRAINT "FacturaDetalleImpuesto_tasa_check"
CHECK (
  "tasa" IS NULL
  OR ("tasa" >= 0 AND "tasa" <= 100)
);

ALTER TABLE "FacturaEvento"
ADD CONSTRAINT "FacturaEvento_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);

ALTER TABLE "Factura"
ADD CONSTRAINT "Factura_descartada_estado_check"
CHECK (
  "estado" <> 'DESCARTADA'
  OR "descartadaEn" IS NOT NULL
);
