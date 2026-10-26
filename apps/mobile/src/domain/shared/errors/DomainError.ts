/** Violación de una regla o invariante de negocio. Cada subclase expone un código estable. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
