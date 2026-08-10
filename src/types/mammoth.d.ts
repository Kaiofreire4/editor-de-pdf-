declare module 'mammoth' {
  interface HtmlResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface ConvertToHtmlOptions {
    includeDefaultStyleMap?: boolean;
    ignoreEmptyParagraphs?: boolean;
    styleMap?: string[];
  }

  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: ConvertToHtmlOptions,
  ): Promise<HtmlResult>;
}
