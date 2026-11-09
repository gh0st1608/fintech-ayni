const { TestEnvironment } = require('jest-environment-jsdom');

/**
 * jsdom no trae la API Fetch (`Request`, `Response`, `Headers`) que React Router usa al navegar.
 * Se toman las de Node, junto con su `AbortController` (`Request` solo acepta señales de Node) y
 * `structuredClone`.
 */
class JsdomWithFetch extends TestEnvironment {
  constructor(...args) {
    super(...args);
    Object.assign(this.global, {
      Request,
      Response,
      Headers,
      FormData,
      AbortController,
      AbortSignal,
      TextEncoder,
      TextDecoder,
      ReadableStream,
      structuredClone,
    });
  }
}

module.exports = JsdomWithFetch;
