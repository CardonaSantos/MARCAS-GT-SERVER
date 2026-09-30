export type OrderCustomerEntry = Readonly<{
  id: number;
  nombre: string;
  apellido: string | null;
  telefono: string;
  correo: string | null;
  direccion: string;
}>;

export interface OrderCustomerDirectoryPort {
  findById(id: number): Promise<OrderCustomerEntry | null>;
}
