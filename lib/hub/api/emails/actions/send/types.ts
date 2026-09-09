export type ParamsT1630357400 = {};
export type JsonTPOST2693448674 = {
  ids: VRefine<Array<VRefine<string, {
    format: "uuid"
  }>>, {
    minItems: 1;
    maxItems: 200
  }>
};
export type ResponseTPOST3829878672 = {
  outcomes: Array<{
    id: string;
    ok: boolean;
    error?: string;
    code?: string
  }>
};
