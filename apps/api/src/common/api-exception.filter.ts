import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    if (exception?.code === 'P2002') {
      const target = Array.isArray(exception.meta?.target) ? exception.meta.target.join(', ') : String(exception.meta?.target ?? '');
      const message = target.includes('email') ? 'Ya existe una cuenta registrada con este correo electrónico.' : 'Ya existe un registro con esos datos.';
      return response.status(HttpStatus.CONFLICT).json({ statusCode: HttpStatus.CONFLICT, message, code: 'DUPLICATE_RESOURCE', path: request.url });
    }
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception?.message ?? 'Unhandled exception', exception?.stack);
    }
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const rawMessage = typeof payload === 'object' && payload ? (payload as any).message : undefined;
    const message = Array.isArray(rawMessage) ? rawMessage.join('. ') : rawMessage || (status === 500 ? 'Ocurrió un error inesperado. Inténtalo de nuevo.' : 'No se pudo completar la operación.');
    // Código estable para que la interfaz distinga casos (p. ej. CODE_EXPIRED) sin leer el texto.
    const code = typeof payload === 'object' && payload && typeof (payload as any).code === 'string' ? (payload as any).code : undefined;
    return response.status(status).json({ statusCode: status, message, ...(code ? { code } : {}), path: request.url });
  }
}
