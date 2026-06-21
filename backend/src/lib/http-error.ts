/**
 * HttpError carries a status, a machine code, an i18n key, and optional
 * interpolation vars / field details. The error middleware localizes the
 * message from `messageKey` using the request locale.
 */
export class HttpError extends Error {
  status: number;
  code?: string;
  messageKey: string;
  vars?: Record<string, string | number>;
  details?: Record<string, string>;

  constructor(
    status: number,
    messageKey: string,
    opts: {
      code?: string;
      vars?: Record<string, string | number>;
      details?: Record<string, string>;
    } = {}
  ) {
    super(messageKey);
    this.name = "HttpError";
    this.status = status;
    this.messageKey = messageKey;
    this.code = opts.code;
    this.vars = opts.vars;
    this.details = opts.details;
  }
}

export const httpError = (
  status: number,
  messageKey: string,
  opts?: {
    code?: string;
    vars?: Record<string, string | number>;
    details?: Record<string, string>;
  }
) => new HttpError(status, messageKey, opts);
