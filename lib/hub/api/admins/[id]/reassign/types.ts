export type ParamsT176132705 = {
  "id": VRefine<string, {
    format: "uuid"
  }>
};
export type JsonTPOST100001437 = {
  targetId: VRefine<string, {
    format: "uuid"
  }>
};
export type ResponseTPOST69354645 = {
  admins: Array<{
    id: string;
    email: string;
    disabled: boolean;
    operators: number;
    providers: number;
    collections: number;
    pending: number;
    lastActivityAt: ((string) | (null));
    deletable: boolean
  }>
};
