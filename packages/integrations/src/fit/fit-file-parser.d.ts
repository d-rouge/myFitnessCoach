declare module "fit-file-parser" {
  export interface FitParserOptions {
    mode?: "list" | "cascade";
    lengthUnit?: "m" | "km" | "mi";
    speedUnit?: "m/s" | "km/h" | "mph";
    elapsedRecordField?: boolean;
    force?: boolean;
  }

  export default class FitParser {
    constructor(options?: FitParserOptions);
    parseAsync(content: Buffer | ArrayBuffer | Uint8Array): Promise<Record<string, unknown>>;
  }
}
