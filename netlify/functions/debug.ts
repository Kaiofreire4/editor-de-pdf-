import type { Handler } from '@netlify/functions';

export const handler: Handler = async (event) => {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      bodyLength: event.body?.length ?? 0,
      bodyPreview: event.body?.substring(0, 200) ?? null,
      isBase64Encoded: event.isBase64Encoded,
      httpMethod: event.httpMethod,
      contentType: event.headers['content-type'] || event.headers['Content-Type'],
    }),
  };
};