export type ProductAvailability = 'DISPONIBLE' | 'AGOTADO';
export interface ProductPreview {
  readonly id: string;
  readonly categoryCode: string;
  readonly name: string;
  readonly description: string;
  readonly price: string;
  readonly priceCents: number;
  readonly allowsAddons: boolean;
  readonly allowsPriceChange: boolean;
  readonly availability: ProductAvailability;
}
export type TableVisualState = 'DISPONIBLE' | 'OCUPADA' | 'PENDIENTE_SERVIR' | 'PAGADA';
export interface TablePreview {
  readonly id: string;
  readonly label: string;
  readonly state: TableVisualState;
  readonly openAccounts: 0 | 1 | 2;
  readonly balance?: string;
  readonly joinedLabel?: string;
  readonly accounts: readonly {
    readonly operationId: string;
    readonly operationCode: string;
    readonly label: 'Cuenta A' | 'Cuenta B';
  }[];
}
