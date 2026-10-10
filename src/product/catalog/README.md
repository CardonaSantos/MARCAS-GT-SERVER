# Catálogo de productos — contrato V2

Implementación sobre el schema Prisma existente. **No genera migraciones**.
Se introduce un endpoint de consulta nuevo para evitar romper la UI heredada mientras se migra `/marcas-gt/ver-productos`.

## Situación anterior

- La página `src/Pages/ViewProducts.tsx` consulta `GET /product/get-product-to-inventary`, que devuelve un arreglo sin paginación.
- Busca, filtra categorías/precios y pagina **en el navegador**.
- Muestra `producto.stock.cantidad` de la tabla legacy `Stock`; no consulta `StockBodega`.
- Otros endpoints consumidos: `GET /categories/simple-categories`, `PATCH /product/:id`, `DELETE /product/delete-one-image-product/:id/image/:imageId?publicId=...`, `PATCH /product/update-images-product/:id`.
- La ruta de edición y las operaciones de imagen se mantienen intactas por compatibilidad.

## Nuevo contrato de lectura

### `GET /product/catalogo`

Requiere JWT, usuario **ADMIN activo** y empresa asignada. La empresa y rol se revalidan desde BD, no se aceptan del query.

| Query | Detalle |
|---|---|
| `page` | int positivo, default 1 |
| `limit` | int 1–100, default 20 |
| `search` | nombre/código/descripción, case-insensitive, hasta 120 |
| `categoriaId` | ID positivo, filtro server-side |
| `precioMin`, `precioMax` | Q, no negativos, 0–2 decimales |
| `bodegaId` | ID positivo, debe pertenecer a empresa autenticada |
| `conExistencia` | bool: true real >0; false sin real >0 en ámbito filtrado |
| `sortBy` | nombre, codigoProducto, precio, costo, creadoEn, actualizadoEn |
| `sortDir` | asc, desc |

Paginación y conteo se ejecutan sobre `Producto` en PostgreSQL, **antes** de enriquecer la página con stocks.
Orden estable con ID ascendente como desempate.

Respuesta:

```json
{
  "data": [
    {
      "id": 10,
      "codigoProducto": "SKU-001",
      "nombre": "Producto ejemplo",
      "descripcion": null,
      "precio": 125,
      "costoReferencia": 80,
      "categorias": [{ "id": 3, "nombre": "Categoría" }],
      "imagenes": [{ "id": 25, "url": "https://example.test/a.jpg" }],
      "imagenPrincipal": "https://example.test/a.jpg",
      "perfilFiscal": null,
      "inventario": {
        "fuente": "STOCK_BODEGA",
        "totales": { "real": 15, "reservado": 5, "disponible": 10 },
        "bodegas": [
          {
            "stockId": 90,
            "bodega": {
              "id": 1, "codigo": "CENTRAL", "nombre": "Bodega Central",
              "esPrincipal": true, "activo": true
            },
            "real": 15, "reservado": 5, "disponible": 10,
            "costoPromedio": "75.0000",
            "actualizadoEn": "2026-10-08T00:00:00.000Z"
          }
        ]
      },
      "stockLegacy": {
        "fuente": "STOCK_LEGACY",
        "cantidad": 20,
        "proveedorId": 6,
        "diferenciaConInventarioReal": 5
      },
      "creadoEn": "2026-10-08T00:00:00.000Z",
      "actualizadoEn": "2026-10-08T00:00:00.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
}
```

**Ámbito de stock:** solo bodegas de la empresa del ADMIN autenticado.
El filtro `bodegaId` determina qué productos aparecen; el desglose y los totales
de cada producto siguen mostrando **todas las bodegas de esa empresa**.
La tabla `Producto` no tiene `empresaId`; el catálogo de productos sigue siendo global
hasta que se defina una política comercial de segregación por empresa.

**Precaución:** `stockLegacy` es informativo. No se suma ni se utiliza para determinar
existencias disponibles ni para aprobar ventas. Al no tener bodega/empresa,
la diferencia sirve como señal de conciliación, no como prueba de pérdida física.

### `GET /product/catalogo/:id`

Devuelve el mismo objeto y agrega:

- `movimientosRecientes`: últimos 10 movimientos en bodegas de la empresa.
- `ingresosRecientes`: últimas 10 entradas/transferencias entrantes/ajustes de entrada/devoluciones/migraciones, con bodega y proveedor **si existe**.
- `referencia`: `{ tipo, id }` cuando se registró en Kardex.

La última entrada o su proveedor **no es un sistema de lotes**: no implica que las
unidades que aún están en bodega provengan de ese proveedor. Para procedencia exacta
haría falta trazabilidad por lote, que no está implementada.

## Diseño propuesto para la futura UI

1. **Catálogo de productos**: cabecera pequeña con botón «Nuevo producto».
2. Filtros etiquetados: buscar nombre/código, categoría, bodega, disponibilidad, rango de precios; limpiar filtros.
3. Tabla server-side: foto, código y nombre, categorías, precio venta, costo referencia,
   **disponible/real/reservado** (oficial), bodegas con stock y acciones.
4. Paginación real desde `meta` y ordenamiento por columnas compatibles con `sortBy`.
5. Vista detalle (panel o página) con:
   - Información e imágenes
   - Stock por bodega
   - Entradas/proveedores y movimientos recientes
   - Perfil fiscal si está configurado
   - Acceso al Kardex y a la ficha de inventario
   - Edición de nombre/precio/categorías/imágenes, sin editar unidades directamente.
6. Stock legacy **no** es columna principal; mostrar advertencia técnica solo en detalle
   cuando exista diferencia y mientras se concilian datos históricos.

No eliminar `GET /product/get-product-to-inventary` hasta migrar todos sus consumidores.
Las ventas antiguas continúan descontando de `Stock`; este contrato de solo lectura
no repara ese flujo ni cambia existencias.
