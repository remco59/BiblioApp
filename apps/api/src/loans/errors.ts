import { HttpException, HttpStatus } from '@nestjs/common';

/** Domeinfout met machineleesbare `code`, zodat de UI er een duidelijke melding bij kan tonen. */
export class DomainError extends HttpException {
  constructor(
    message: string,
    readonly code: string,
    status: HttpStatus = HttpStatus.CONFLICT,
  ) {
    super({ statusCode: status, message, code }, status);
  }
}
