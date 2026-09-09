export type ParamsT3661605060 = {};
export type JsonTPOST4227977922 = {
  email: VRefine<string, {
    format: "email";
    maxLength: 320
  }>
};
export type ResponseTPOST1423744252 = {
  sentTo: string;
  expiresAt: string;
  via: string
};
export type JsonTPUT4227977922 = {
  code: VRefine<string, {
    minLength: 1;
    maxLength: 64
  }>
};
export type ResponseTPUT508209004 = {
  email: string
};
