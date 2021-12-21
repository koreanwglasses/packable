export class FetchError extends Error {
  constructor(readonly name: string, message: string) {
    super(message);
  }
}
