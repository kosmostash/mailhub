export type ParamsT2732594447 = {};
export type ResponseTGET3760309972 = {
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
export type JsonTPOST3016094572 = {
  email: VRefine<string, {
    format: "email";
    maxLength: 320
  }>;
  password: VRefine<string, {
    minLength: 10;
    maxLength: 512
  }>
};
export type ResponseTPOST2846655654 = {
  id: string;
  email: string;
  disabled: boolean;
  operators: number;
  providers: number;
  collections: number;
  pending: number;
  lastActivityAt: ((string) | (null));
  deletable: boolean
};
