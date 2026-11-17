// The error a request throws when it got an answer with an error status: from the server over
// HTTP (src/hooks/request.ts) or from a route handler in browser data mode (dispatch.ts unwrap).
// A network failure is not one. Pure: no framework, browser or server imports.

export class RequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
