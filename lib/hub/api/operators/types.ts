export type ParamsT2171001370 = {};
export type ResponseTGET2577327683 = {
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
export type JsonTPOST3161559725 = {
  email: VRefine<string, {
    format: "email";
    maxLength: 320
  }>;
  password: VRefine<string, {
    minLength: 10;
    maxLength: 512
  }>
};
export type ResponseTPOST2894467348 = {
  id: string;
  email: string;
  disabled: boolean;
  collections: number;
  pending: number;
  lastActivityAt: ((string) | (null));
  deletable: boolean
};
