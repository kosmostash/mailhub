export type ParamsT3182389174 = {};
export type JsonTPOST3464874783 = {
  currentPassword: VRefine<string, {
    minLength: 1;
    maxLength: 512
  }>;
  newPassword: VRefine<string, {
    minLength: 10;
    maxLength: 512
  }>
};
export type ResponseTPOST511736455 = {
  sentTo: string;
  expiresAt: string;
  via: string
};
export type JsonTPUT3464874783 = {
  code: VRefine<string, {
    minLength: 1;
    maxLength: 64
  }>
};
export type ResponseTPUT3892158224 = {
  ok: true
};
