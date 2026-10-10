import { PageResult } from 'src/shared/application/pagination/page.models';

export type CustomerDirectoryItem = Readonly<{
  id: number;
  nombre: string;
  apellido: string | null;
  correo: string | null;
  telefono: string;
  direccion: string;
  tipoCliente: string | null;
  categoriasInteres: string[];
  volumenCompra: string | null;
  presupuestoMensual: string | null;
  preferenciaContacto: string | null;
  departamento: { id: number; nombre: string } | null;
  municipio: { id: number; nombre: string; departamentoId: number } | null;
  departamentoId: number | null;
  municipioId: number | null;
  ubicacion: { latitud: number; longitud: number } | null;
  actividad: {
    ventas: number;
    pedidos: number;
    visitas: number;
    solicitudesCredito: number;
    entregas: number;
  };
  creadoEn: Date;
  actualizadoEn: Date;
}>;

export type CustomerDirectoryPage = PageResult<CustomerDirectoryItem>;

export type CustomerDirectoryDetail = CustomerDirectoryItem & Readonly<{
  comentarios: string | null;
  perfilFiscal: {
    tipoIdentificacion: string;
    identificacion: string;
    nombreFiscal: string;
    correoFiscal: string | null;
  } | null;
}>;
