declare module 'mammoth' {
  interface HtmlResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  export function convertToHtml(options: { arrayBuffer: ArrayBuffer }): Promise<HtmlResult>;
}
