/** O que os dois painéis de pagamento recebem da página em comum. */
export type PanelBase = {
  itemsTotal: number;
  canFinish: boolean;
  /** Por que o botão está travado. Null quando dá para finalizar. */
  blockedReason: string | null;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  error: string;
  setError: (value: string) => void;
};
