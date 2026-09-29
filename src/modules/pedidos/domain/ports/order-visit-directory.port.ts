export type OrderVisitEntry = Readonly<{
  id: number;
  clienteId: number;
  usuarioId: number;
  estadoVisita: string;
  inicio: Date;
  fin: Date | null;
}>;

export interface OrderVisitDirectoryPort {
  findById(id: number): Promise<OrderVisitEntry | null>;
}
