export type ParamsT1262528991 = {};
export type ResponseTGET1266222180 = {
  testAddresses: Array<{
    id: string;
    address: string;
    label: ((string) | (null));
    createdAt: string
  }>
};
export type JsonTPOST3983687089 = {
  address: VRefine<string, {
    format: "email";
    maxLength: 320
  }>;
  label?: VRefine<string, {
    maxLength: 80
  }>
};
export type ResponseTPOST2334426939 = {
  id: string;
  address: string;
  label: ((string) | (null));
  createdAt: string
};
