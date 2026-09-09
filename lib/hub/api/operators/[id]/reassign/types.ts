export type ParamsT1115521599 = {
  "id": VRefine<string, {
    format: "uuid"
  }>
};
export type JsonTPOST4241570055 = {
  targetId: VRefine<string, {
    format: "uuid"
  }>
};
export type ResponseTPOST2148720077 = {
  operators: Array<{
    id: string;
    email: string;
    disabled: boolean;
    collections: number;
    pending: number;
    lastActivityAt: ((string) | (null));
    deletable: boolean
  }>
};
