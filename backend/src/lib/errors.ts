/** An error carrying an HTTP status code and a stable machine-readable code. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "HttpError";
  }
}

export const badRequest = (code: string, message?: string) => new HttpError(400, code, message);
export const unauthorized = (code = "unauthorized", message?: string) => new HttpError(401, code, message);
export const forbidden = (code = "forbidden", message?: string) => new HttpError(403, code, message);
export const notFound = (code = "not_found", message?: string) => new HttpError(404, code, message);
export const conflict = (code: string, message?: string) => new HttpError(409, code, message);
export const payloadTooLarge = (code = "payload_too_large", message?: string) => new HttpError(413, code, message);
