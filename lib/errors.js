/* Domain errors. Services throw these; the HTTP layer (lib/http.js `handler`)
   turns them into the right status code. Nothing here knows about req/res, so
   the service layer stays transport-agnostic. */

export class AppError extends Error {
  constructor(status, message, { fieldErrors = null, retryAfter = null } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.retryAfter = retryAfter;
  }
}

export const badRequest = (message = "Invalid request") => new AppError(400, message);
export const unauthorized = (message = "You must be logged in") => new AppError(401, message);
export const forbidden = (message = "Not allowed") => new AppError(403, message);
export const notFound = (message = "Not found") => new AppError(404, message);
export const conflict = (message) => new AppError(409, message);
export const unprocessable = (message, fieldErrors) => new AppError(422, message, { fieldErrors });
export const tooMany = (retryAfter, message = "Too many attempts. Please try again later.") =>
  new AppError(429, message, { retryAfter });
