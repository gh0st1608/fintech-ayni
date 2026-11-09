const { TestEnvironment } = require('jest-environment-jsdom');

/**
 * jsdom no trae la API Fetch (`Request`, `Response`, `Headers`) que React Router usa al navegar.
 * Se toman las de Node, junto con su `AbortController` (`Request` solo acepta señales de Node) y
 * `structuredClone`. `FormData` sigue siendo el de jsdom: React 19 lo construye con el formulario
 * (`new FormData(form)`) cuando un submit ocurre durante una transición, y el de Node no lo admite.
 */
class JsdomWithFetch extends TestEnvironment {
  constructor(...args) {
    super(...args);
    Object.assign(this.global, {
      Request,
      Response,
      Headers,
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
