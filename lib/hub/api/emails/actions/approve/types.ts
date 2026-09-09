export type ParamsT4167585113 = {};
export type JsonTPOST638848229 = {
  ids: VRefine<Array<VRefine<string, {
    format: "uuid"
  }>>, {
    minItems: 1;
    maxItems: 500
  }>
};
export type ResponseTPOST1652533661 = {
  outcomes: Array<{
    id: string;
    ok: boolean;
    error?: string;
    code?: string
  }>
};
