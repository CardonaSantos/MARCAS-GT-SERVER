/*
  Warnings:

  - You are about to drop the column `entregaId` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `impuesto` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `FacturaDetalle` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `CuentaPorCobrar` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[claveIdempotencia]` on the table `Factura` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bienOServicio` to the `FacturaDetalle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descripcion` to the `FacturaDetalle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `precioBruto` to the `FacturaDetalle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalLinea` to the `FacturaDetalle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unidadMedida` to the `FacturaDetalle` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EntornoFel" AS ENUM ('PRUEBAS', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "TipoIdentificacionFiscal" AS ENUM ('NIT', 'CUI', 'CF', 'PASAPORTE', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoBienServicioFiscal" AS ENUM ('BIEN', 'SERVICIO');

-- CreateEnum
CREATE TYPE "EstadoDocumentoFiscal" AS ENUM ('BORRADOR', 'PREPARADO', 'EN_PROCESO', 'CERTIFICACION_INCIERTA', 'CERTIFICADO', 'RECHAZADO', 'CONTINGENCIA', 'ANULACION_PENDIENTE', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoOperacionFel" AS ENUM ('GENERAR_XML', 'FIRMAR', 'CERTIFICAR', 'CONSULTAR', 'RECONCILIAR', 'OBTENER_PDF', 'ANULAR');

-- CreateEnum
CREATE TYPE "EstadoOperacionFel" AS ENUM ('PENDIENTE', 'EJECUTANDO', 'REINTENTABLE', 'INCIERTA', 'EXITOSA', 'RECHAZADA', 'FALLIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoArtefactoFiscal" AS ENUM ('XML_GENERADO', 'XML_FIRMADO', 'XML_CERTIFICADO', 'PDF', 'XML_ANULACION');

-- CreateEnum
CREATE TYPE "EstadoContingenciaFel" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoEventoDocumentoFiscal" AS ENUM ('CREADO', 'PREPARADO', 'OPERACION_ENCOLADA', 'CERTIFICACION_SOLICITADA', 'CERTIFICACION_INCIERTA', 'CERTIFICADO', 'RECHAZADO', 'RECONCILIADO', 'CONTINGENCIA_ASIGNADA', 'ANULACION_SOLICITADA', 'ANULADO', 'OBSERVACION');

-- AlterEnum
ALTER TYPE "EstadoFactura" ADD VALUE 'LISTA_EMISION';

-- DropForeignKey
ALTER TABLE "Factura" DROP CONSTRAINT "Factura_entregaId_fkey";

-- DropIndex
DROP INDEX "Factura_entregaId_key";

-- AlterTable
ALTER TABLE "CuentaPorCobrar" ADD COLUMN     "anuladaEn" TIMESTAMP(3),
ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "moneda" TEXT NOT NULL DEFAULT 'GTQ',
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Factura" DROP COLUMN "entregaId",
DROP COLUMN "impuesto",
ADD COLUMN     "anuladaEn" TIMESTAMP(3),
ADD COLUMN     "claveIdempotencia" TEXT,
ADD COLUMN     "condicionPago" "CondicionPago",
ADD COLUMN     "creadoPorId" INTEGER,
ADD COLUMN     "descuentoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "impuestoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "motivoAnulacion" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FacturaDetalle" DROP COLUMN "subtotal",
ADD COLUMN     "bienOServicio" "TipoBienServicioFiscal" NOT NULL,
ADD COLUMN     "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "descripcion" TEXT NOT NULL,
ADD COLUMN     "impuestoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "precioBruto" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "totalLinea" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "unidadMedida" VARCHAR(16) NOT NULL;

-- CreateTable
CREATE TABLE "EmpresaPerfilFiscal" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "nit" VARCHAR(16) NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "afiliacionIva" VARCHAR(16) NOT NULL,
    "correoFiscal" TEXT,
    "direccion" TEXT NOT NULL,
    "codigoPostal" TEXT,
    "municipio" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "pais" VARCHAR(3) NOT NULL DEFAULT 'GT',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmpresaPerfilFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstablecimientoFiscal" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "codigoSat" INTEGER NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "correo" TEXT,
    "direccion" TEXT NOT NULL,
    "codigoPostal" TEXT,
    "municipio" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "pais" VARCHAR(3) NOT NULL DEFAULT 'GT',
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstablecimientoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePerfilFiscal" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "tipoIdentificacion" "TipoIdentificacionFiscal" NOT NULL,
    "identificacion" VARCHAR(32) NOT NULL,
    "nombreFiscal" TEXT NOT NULL,
    "correoFiscal" TEXT,
    "direccion" TEXT,
    "codigoPostal" TEXT,
    "municipio" TEXT,
    "departamento" TEXT,
    "pais" VARCHAR(3) NOT NULL DEFAULT 'GT',
    "validadoEn" TIMESTAMP(3),
    "fuenteValidacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientePerfilFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoPerfilFiscal" (
    "id" SERIAL NOT NULL,
    "productoId" INTEGER NOT NULL,
    "bienOServicio" "TipoBienServicioFiscal" NOT NULL DEFAULT 'BIEN',
    "unidadMedida" VARCHAR(16) NOT NULL DEFAULT 'UN',
    "descripcionFiscal" TEXT,
    "nombreCortoImpuesto" TEXT,
    "codigoUnidadGravable" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoPerfilFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProveedorFel" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(32) NOT NULL,
    "nombre" TEXT NOT NULL,
    "nitCertificador" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorFel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaProveedorFel" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "proveedorFelId" INTEGER NOT NULL,
    "entorno" "EntornoFel" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "prioridad" INTEGER NOT NULL DEFAULT 1,
    "appKeySecretRef" TEXT,
    "apiKeySecretRef" TEXT,
    "baseUrlOverride" TEXT,
    "firmaConfigurada" BOOLEAN NOT NULL DEFAULT false,
    "configuracion" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmpresaProveedorFel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DteSecuencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "establecimientoFiscalId" INTEGER NOT NULL,
    "entorno" "EntornoFel" NOT NULL,
    "serieInterna" TEXT NOT NULL,
    "siguienteNumero" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DteSecuencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaEntrega" (
    "facturaId" INTEGER NOT NULL,
    "entregaId" INTEGER NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaEntrega_pkey" PRIMARY KEY ("facturaId","entregaId")
);

-- CreateTable
CREATE TABLE "FacturaDetalleImpuesto" (
    "id" SERIAL NOT NULL,
    "facturaDetalleId" INTEGER NOT NULL,
    "nombreCorto" TEXT NOT NULL,
    "codigoUnidadGravable" INTEGER,
    "montoGravable" DECIMAL(18,8) NOT NULL,
    "montoImpuesto" DECIMAL(18,8) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaDetalleImpuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoFiscal" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "establecimientoFiscalId" INTEGER NOT NULL,
    "proveedorFelConfigId" INTEGER,
    "contingenciaId" INTEGER,
    "tipoDte" VARCHAR(8) NOT NULL,
    "estado" "EstadoDocumentoFiscal" NOT NULL DEFAULT 'BORRADOR',
    "entorno" "EntornoFel" NOT NULL,
    "codigoMoneda" VARCHAR(8) NOT NULL DEFAULT 'GTQ',
    "fechaHoraEmision" TIMESTAMP(3) NOT NULL,
    "granTotal" DECIMAL(12,2) NOT NULL,
    "serieInterna" TEXT NOT NULL,
    "numeroInterno" INTEGER NOT NULL,
    "uuid" VARCHAR(64),
    "serieFel" TEXT,
    "numeroFel" TEXT,
    "fechaCertificacion" TIMESTAMP(3),
    "refIdProveedor" TEXT,
    "certificadorNit" TEXT,
    "certificadorNombre" TEXT,
    "numeroAcceso" TEXT,
    "emisorNit" TEXT NOT NULL,
    "emisorNombre" TEXT NOT NULL,
    "emisorNombreComercial" TEXT NOT NULL,
    "emisorAfiliacionIva" TEXT NOT NULL,
    "emisorCorreo" TEXT,
    "emisorDireccion" JSONB NOT NULL,
    "receptorTipoIdentificacion" "TipoIdentificacionFiscal" NOT NULL,
    "receptorIdentificacion" TEXT NOT NULL,
    "receptorNombre" TEXT NOT NULL,
    "receptorCorreo" TEXT,
    "receptorDireccion" JSONB,
    "frases" JSONB,
    "adendas" JSONB,
    "complementos" JSONB,
    "payloadHash" VARCHAR(64) NOT NULL,
    "versionEsquema" TEXT,
    "anuladoEn" TIMESTAMP(3),
    "motivoAnulacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoFiscalArtefacto" (
    "id" SERIAL NOT NULL,
    "documentoFiscalId" INTEGER NOT NULL,
    "tipo" "TipoArtefactoFiscal" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contenido" TEXT,
    "storageKey" TEXT,
    "url" TEXT,
    "mimeType" TEXT,
    "size" INTEGER,
    "sha256" VARCHAR(64),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoFiscalArtefacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoFiscalEvento" (
    "id" SERIAL NOT NULL,
    "documentoFiscalId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" "TipoEventoDocumentoFiscal" NOT NULL,
    "estado" "EstadoDocumentoFiscal" NOT NULL,
    "detalle" TEXT,
    "referenciaTipo" TEXT,
    "referenciaId" INTEGER,
    "claveIdempotencia" TEXT,
    "metadata" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoFiscalEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FelOperacion" (
    "id" SERIAL NOT NULL,
    "documentoFiscalId" INTEGER NOT NULL,
    "proveedorFelConfigId" INTEGER NOT NULL,
    "tipo" "TipoOperacionFel" NOT NULL,
    "estado" "EstadoOperacionFel" NOT NULL DEFAULT 'PENDIENTE',
    "claveIdempotencia" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "maxIntentos" INTEGER NOT NULL DEFAULT 5,
    "disponibleEn" TIMESTAMP(3),
    "bloqueadaHasta" TIMESTAMP(3),
    "workerId" TEXT,
    "refIdProveedor" TEXT,
    "ultimoCodigoError" TEXT,
    "ultimoMensajeError" TEXT,
    "iniciadaEn" TIMESTAMP(3),
    "finalizadaEn" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FelOperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FelIntento" (
    "id" SERIAL NOT NULL,
    "operacionId" INTEGER NOT NULL,
    "numeroIntento" INTEGER NOT NULL,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadoEn" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "duracionMs" INTEGER,
    "requestHash" VARCHAR(64),
    "codigoProveedor" TEXT,
    "mensajeProveedor" TEXT,
    "refIdProveedor" TEXT,
    "respuestaResumen" JSONB,
    "errorTipo" TEXT,

    CONSTRAINT "FelIntento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FelContingencia" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "establecimientoFiscalId" INTEGER NOT NULL,
    "estado" "EstadoContingenciaFel" NOT NULL DEFAULT 'ABIERTA',
    "inicioEn" TIMESTAMP(3) NOT NULL,
    "finEn" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "abiertaPorId" INTEGER,
    "cerradaPorId" INTEGER,
    "notificadaSatEn" TIMESTAMP(3),
    "claveIdempotencia" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FelContingencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaPerfilFiscal_empresaId_key" ON "EmpresaPerfilFiscal"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaPerfilFiscal_nit_key" ON "EmpresaPerfilFiscal"("nit");

-- CreateIndex
CREATE INDEX "EmpresaPerfilFiscal_activo_idx" ON "EmpresaPerfilFiscal"("activo");

-- CreateIndex
CREATE INDEX "EstablecimientoFiscal_empresaId_activo_idx" ON "EstablecimientoFiscal"("empresaId", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "EstablecimientoFiscal_empresaId_codigoSat_key" ON "EstablecimientoFiscal"("empresaId", "codigoSat");

-- CreateIndex
CREATE UNIQUE INDEX "ClientePerfilFiscal_clienteId_key" ON "ClientePerfilFiscal"("clienteId");

-- CreateIndex
CREATE INDEX "ClientePerfilFiscal_tipoIdentificacion_identificacion_idx" ON "ClientePerfilFiscal"("tipoIdentificacion", "identificacion");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoPerfilFiscal_productoId_key" ON "ProductoPerfilFiscal"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProveedorFel_codigo_key" ON "ProveedorFel"("codigo");

-- CreateIndex
CREATE INDEX "EmpresaProveedorFel_empresaId_entorno_activo_prioridad_idx" ON "EmpresaProveedorFel"("empresaId", "entorno", "activo", "prioridad");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaProveedorFel_empresaId_proveedorFelId_entorno_key" ON "EmpresaProveedorFel"("empresaId", "proveedorFelId", "entorno");

-- CreateIndex
CREATE INDEX "DteSecuencia_empresaId_entorno_idx" ON "DteSecuencia"("empresaId", "entorno");

-- CreateIndex
CREATE UNIQUE INDEX "DteSecuencia_empresaId_establecimientoFiscalId_entorno_seri_key" ON "DteSecuencia"("empresaId", "establecimientoFiscalId", "entorno", "serieInterna");

-- CreateIndex
CREATE INDEX "FacturaEntrega_entregaId_idx" ON "FacturaEntrega"("entregaId");

-- CreateIndex
CREATE INDEX "FacturaDetalleImpuesto_facturaDetalleId_idx" ON "FacturaDetalleImpuesto"("facturaDetalleId");

-- CreateIndex
CREATE INDEX "FacturaDetalleImpuesto_nombreCorto_idx" ON "FacturaDetalleImpuesto"("nombreCorto");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_facturaId_key" ON "DocumentoFiscal"("facturaId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_uuid_key" ON "DocumentoFiscal"("uuid");

-- CreateIndex
CREATE INDEX "DocumentoFiscal_empresaId_estado_fechaHoraEmision_idx" ON "DocumentoFiscal"("empresaId", "estado", "fechaHoraEmision");

-- CreateIndex
CREATE INDEX "DocumentoFiscal_establecimientoFiscalId_estado_fechaHoraEmi_idx" ON "DocumentoFiscal"("establecimientoFiscalId", "estado", "fechaHoraEmision");

-- CreateIndex
CREATE INDEX "DocumentoFiscal_contingenciaId_idx" ON "DocumentoFiscal"("contingenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_empresaId_establecimientoFiscalId_entorno_s_key" ON "DocumentoFiscal"("empresaId", "establecimientoFiscalId", "entorno", "serieInterna", "numeroInterno");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscal_proveedorFelConfigId_refIdProveedor_key" ON "DocumentoFiscal"("proveedorFelConfigId", "refIdProveedor");

-- CreateIndex
CREATE INDEX "DocumentoFiscalArtefacto_documentoFiscalId_creadoEn_idx" ON "DocumentoFiscalArtefacto"("documentoFiscalId", "creadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscalArtefacto_documentoFiscalId_tipo_version_key" ON "DocumentoFiscalArtefacto"("documentoFiscalId", "tipo", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFiscalEvento_claveIdempotencia_key" ON "DocumentoFiscalEvento"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "DocumentoFiscalEvento_documentoFiscalId_creadoEn_idx" ON "DocumentoFiscalEvento"("documentoFiscalId", "creadoEn");

-- CreateIndex
CREATE INDEX "DocumentoFiscalEvento_tipo_creadoEn_idx" ON "DocumentoFiscalEvento"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "DocumentoFiscalEvento_estado_creadoEn_idx" ON "DocumentoFiscalEvento"("estado", "creadoEn");

-- CreateIndex
CREATE INDEX "DocumentoFiscalEvento_usuarioId_creadoEn_idx" ON "DocumentoFiscalEvento"("usuarioId", "creadoEn");

-- CreateIndex
CREATE INDEX "DocumentoFiscalEvento_referenciaTipo_referenciaId_idx" ON "DocumentoFiscalEvento"("referenciaTipo", "referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "FelOperacion_claveIdempotencia_key" ON "FelOperacion"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "FelOperacion_estado_disponibleEn_idx" ON "FelOperacion"("estado", "disponibleEn");

-- CreateIndex
CREATE INDEX "FelOperacion_documentoFiscalId_tipo_estado_idx" ON "FelOperacion"("documentoFiscalId", "tipo", "estado");

-- CreateIndex
CREATE INDEX "FelOperacion_proveedorFelConfigId_estado_idx" ON "FelOperacion"("proveedorFelConfigId", "estado");

-- CreateIndex
CREATE INDEX "FelIntento_operacionId_iniciadoEn_idx" ON "FelIntento"("operacionId", "iniciadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "FelIntento_operacionId_numeroIntento_key" ON "FelIntento"("operacionId", "numeroIntento");

-- CreateIndex
CREATE UNIQUE INDEX "FelContingencia_claveIdempotencia_key" ON "FelContingencia"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "FelContingencia_empresaId_estado_inicioEn_idx" ON "FelContingencia"("empresaId", "estado", "inicioEn");

-- CreateIndex
CREATE INDEX "FelContingencia_establecimientoFiscalId_estado_inicioEn_idx" ON "FelContingencia"("establecimientoFiscalId", "estado", "inicioEn");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorCobrar_claveIdempotencia_key" ON "CuentaPorCobrar"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "CuentaPorCobrar_pedidoId_estado_idx" ON "CuentaPorCobrar"("pedidoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_claveIdempotencia_key" ON "Factura"("claveIdempotencia");

-- CreateIndex
CREATE INDEX "Factura_pedidoId_creadoEn_idx" ON "Factura"("pedidoId", "creadoEn");

-- CreateIndex
CREATE INDEX "Factura_creadoPorId_creadoEn_idx" ON "Factura"("creadoPorId", "creadoEn");

-- CreateIndex
CREATE INDEX "FacturaDetalle_productoId_idx" ON "FacturaDetalle"("productoId");

-- CreateIndex
CREATE INDEX "FacturaDetalle_pedidoDetalleId_idx" ON "FacturaDetalle"("pedidoDetalleId");

-- CreateIndex
CREATE INDEX "FacturaDetalle_entregaDetalleId_idx" ON "FacturaDetalle"("entregaDetalleId");

-- AddForeignKey
ALTER TABLE "EmpresaPerfilFiscal" ADD CONSTRAINT "EmpresaPerfilFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablecimientoFiscal" ADD CONSTRAINT "EstablecimientoFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePerfilFiscal" ADD CONSTRAINT "ClientePerfilFiscal_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoPerfilFiscal" ADD CONSTRAINT "ProductoPerfilFiscal_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaProveedorFel" ADD CONSTRAINT "EmpresaProveedorFel_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaProveedorFel" ADD CONSTRAINT "EmpresaProveedorFel_proveedorFelId_fkey" FOREIGN KEY ("proveedorFelId") REFERENCES "ProveedorFel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DteSecuencia" ADD CONSTRAINT "DteSecuencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DteSecuencia" ADD CONSTRAINT "DteSecuencia_establecimientoFiscalId_fkey" FOREIGN KEY ("establecimientoFiscalId") REFERENCES "EstablecimientoFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEntrega" ADD CONSTRAINT "FacturaEntrega_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaEntrega" ADD CONSTRAINT "FacturaEntrega_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDetalleImpuesto" ADD CONSTRAINT "FacturaDetalleImpuesto_facturaDetalleId_fkey" FOREIGN KEY ("facturaDetalleId") REFERENCES "FacturaDetalle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_establecimientoFiscalId_fkey" FOREIGN KEY ("establecimientoFiscalId") REFERENCES "EstablecimientoFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_proveedorFelConfigId_fkey" FOREIGN KEY ("proveedorFelConfigId") REFERENCES "EmpresaProveedorFel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscal" ADD CONSTRAINT "DocumentoFiscal_contingenciaId_fkey" FOREIGN KEY ("contingenciaId") REFERENCES "FelContingencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscalArtefacto" ADD CONSTRAINT "DocumentoFiscalArtefacto_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscalEvento" ADD CONSTRAINT "DocumentoFiscalEvento_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFiscalEvento" ADD CONSTRAINT "DocumentoFiscalEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelOperacion" ADD CONSTRAINT "FelOperacion_documentoFiscalId_fkey" FOREIGN KEY ("documentoFiscalId") REFERENCES "DocumentoFiscal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelOperacion" ADD CONSTRAINT "FelOperacion_proveedorFelConfigId_fkey" FOREIGN KEY ("proveedorFelConfigId") REFERENCES "EmpresaProveedorFel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelIntento" ADD CONSTRAINT "FelIntento_operacionId_fkey" FOREIGN KEY ("operacionId") REFERENCES "FelOperacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelContingencia" ADD CONSTRAINT "FelContingencia_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelContingencia" ADD CONSTRAINT "FelContingencia_establecimientoFiscalId_fkey" FOREIGN KEY ("establecimientoFiscalId") REFERENCES "EstablecimientoFiscal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelContingencia" ADD CONSTRAINT "FelContingencia_abiertaPorId_fkey" FOREIGN KEY ("abiertaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FelContingencia" ADD CONSTRAINT "FelContingencia_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CHECKS

-- ============================================================================
-- CHECK CONSTRAINTS - FACTURACION / CXC / FEL
-- ============================================================================

-- FACTURA
ALTER TABLE "Factura"
ADD CONSTRAINT "Factura_subtotal_check"
CHECK ("subtotal" >= 0),
ADD CONSTRAINT "Factura_descuentoTotal_check"
CHECK ("descuentoTotal" >= 0 AND "descuentoTotal" <= "subtotal"),
ADD CONSTRAINT "Factura_impuestoTotal_check"
CHECK ("impuestoTotal" >= 0),
ADD CONSTRAINT "Factura_total_check"
CHECK ("total" >= 0),
ADD CONSTRAINT "Factura_version_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "Factura_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- FACTURA DETALLE
ALTER TABLE "FacturaDetalle"
ADD CONSTRAINT "FacturaDetalle_cantidad_check"
CHECK ("cantidad" > 0),
ADD CONSTRAINT "FacturaDetalle_precioUnitario_check"
CHECK ("precioUnitario" >= 0),
ADD CONSTRAINT "FacturaDetalle_precioBruto_check"
CHECK ("precioBruto" >= 0),
ADD CONSTRAINT "FacturaDetalle_descuento_check"
CHECK ("descuento" >= 0),
ADD CONSTRAINT "FacturaDetalle_impuestoTotal_check"
CHECK ("impuestoTotal" >= 0),
ADD CONSTRAINT "FacturaDetalle_totalLinea_check"
CHECK ("totalLinea" >= 0);


-- FACTURA DETALLE IMPUESTO
ALTER TABLE "FacturaDetalleImpuesto"
ADD CONSTRAINT "FacturaDetalleImpuesto_montoGravable_check"
CHECK ("montoGravable" >= 0),
ADD CONSTRAINT "FacturaDetalleImpuesto_montoImpuesto_check"
CHECK ("montoImpuesto" >= 0);


-- CUENTA POR COBRAR
ALTER TABLE "CuentaPorCobrar"
ADD CONSTRAINT "CuentaPorCobrar_montos_check"
CHECK (
  "montoOriginal" >= 0
  AND "saldoPendiente" >= 0
  AND "saldoPendiente" <= "montoOriginal"
),
ADD CONSTRAINT "CuentaPorCobrar_version_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "CuentaPorCobrar_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- EMPRESA PERFIL FISCAL
ALTER TABLE "EmpresaPerfilFiscal"
ADD CONSTRAINT "EmpresaPerfilFiscal_nit_check"
CHECK (length(trim("nit")) > 0),
ADD CONSTRAINT "EmpresaPerfilFiscal_version_check"
CHECK ("version" >= 0);


-- ESTABLECIMIENTO FISCAL
ALTER TABLE "EstablecimientoFiscal"
ADD CONSTRAINT "EstablecimientoFiscal_codigoSat_check"
CHECK ("codigoSat" >= 0),
ADD CONSTRAINT "EstablecimientoFiscal_version_check"
CHECK ("version" >= 0);


-- CLIENTE PERFIL FISCAL
ALTER TABLE "ClientePerfilFiscal"
ADD CONSTRAINT "ClientePerfilFiscal_identificacion_check"
CHECK (length(trim("identificacion")) > 0),
ADD CONSTRAINT "ClientePerfilFiscal_nombreFiscal_check"
CHECK (length(trim("nombreFiscal")) > 0),
ADD CONSTRAINT "ClientePerfilFiscal_version_check"
CHECK ("version" >= 0);


-- PRODUCTO PERFIL FISCAL
ALTER TABLE "ProductoPerfilFiscal"
ADD CONSTRAINT "ProductoPerfilFiscal_unidadMedida_check"
CHECK (length(trim("unidadMedida")) > 0),
ADD CONSTRAINT "ProductoPerfilFiscal_version_check"
CHECK ("version" >= 0);


-- EMPRESA PROVEEDOR FEL
ALTER TABLE "EmpresaProveedorFel"
ADD CONSTRAINT "EmpresaProveedorFel_prioridad_check"
CHECK ("prioridad" > 0),
ADD CONSTRAINT "EmpresaProveedorFel_version_check"
CHECK ("version" >= 0);


-- DTE SECUENCIA
ALTER TABLE "DteSecuencia"
ADD CONSTRAINT "DteSecuencia_siguienteNumero_check"
CHECK ("siguienteNumero" > 0),
ADD CONSTRAINT "DteSecuencia_serieInterna_check"
CHECK (length(trim("serieInterna")) > 0),
ADD CONSTRAINT "DteSecuencia_version_check"
CHECK ("version" >= 0);


-- DOCUMENTO FISCAL
ALTER TABLE "DocumentoFiscal"
ADD CONSTRAINT "DocumentoFiscal_numeroInterno_check"
CHECK ("numeroInterno" > 0),
ADD CONSTRAINT "DocumentoFiscal_granTotal_check"
CHECK ("granTotal" >= 0),
ADD CONSTRAINT "DocumentoFiscal_payloadHash_check"
CHECK (length(trim("payloadHash")) > 0),
ADD CONSTRAINT "DocumentoFiscal_version_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "DocumentoFiscal_certificado_check"
CHECK (
  "estado" <> 'CERTIFICADO'
  OR (
    "uuid" IS NOT NULL
    AND length(trim("uuid")) > 0
    AND "serieFel" IS NOT NULL
    AND length(trim("serieFel")) > 0
    AND "numeroFel" IS NOT NULL
    AND length(trim("numeroFel")) > 0
    AND "fechaCertificacion" IS NOT NULL
  )
),
ADD CONSTRAINT "DocumentoFiscal_contingencia_check"
CHECK (
  "estado" <> 'CONTINGENCIA'
  OR (
    "contingenciaId" IS NOT NULL
    AND "numeroAcceso" IS NOT NULL
    AND length(trim("numeroAcceso")) > 0
  )
);


-- ARTEFACTOS FISCALES
ALTER TABLE "DocumentoFiscalArtefacto"
ADD CONSTRAINT "DocumentoFiscalArtefacto_version_check"
CHECK ("version" > 0),
ADD CONSTRAINT "DocumentoFiscalArtefacto_size_check"
CHECK ("size" IS NULL OR "size" >= 0);


-- EVENTOS DOCUMENTO FISCAL
ALTER TABLE "DocumentoFiscalEvento"
ADD CONSTRAINT "DocumentoFiscalEvento_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- OPERACIONES FEL
ALTER TABLE "FelOperacion"
ADD CONSTRAINT "FelOperacion_intentos_check"
CHECK (
  "intentos" >= 0
  AND "maxIntentos" > 0
),
ADD CONSTRAINT "FelOperacion_version_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "FelOperacion_claveIdempotencia_check"
CHECK (length(trim("claveIdempotencia")) > 0);


-- INTENTOS FEL
ALTER TABLE "FelIntento"
ADD CONSTRAINT "FelIntento_numeroIntento_check"
CHECK ("numeroIntento" > 0),
ADD CONSTRAINT "FelIntento_duracion_check"
CHECK ("duracionMs" IS NULL OR "duracionMs" >= 0),
ADD CONSTRAINT "FelIntento_httpStatus_check"
CHECK (
  "httpStatus" IS NULL
  OR ("httpStatus" >= 100 AND "httpStatus" <= 599)
);


-- CONTINGENCIA FEL
ALTER TABLE "FelContingencia"
ADD CONSTRAINT "FelContingencia_fechas_check"
CHECK (
  "finEn" IS NULL
  OR "finEn" >= "inicioEn"
),
ADD CONSTRAINT "FelContingencia_version_check"
CHECK ("version" >= 0),
ADD CONSTRAINT "FelContingencia_claveIdempotencia_check"
CHECK (
  "claveIdempotencia" IS NULL
  OR length(trim("claveIdempotencia")) > 0
);


-- Solo un establecimiento principal por empresa.
CREATE UNIQUE INDEX "EstablecimientoFiscal_un_principal_por_empresa"
ON "EstablecimientoFiscal" ("empresaId")
WHERE "esPrincipal" = true;