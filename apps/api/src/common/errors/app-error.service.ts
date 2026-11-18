import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

@Injectable()
export class AppErrorService {
  notFound(message = "Resource not found"): never {
    throw new NotFoundException(message);
  }

  badRequest(message: string): never {
    throw new BadRequestException(message);
  }

  unauthorized(message = "Unauthorized"): never {
    throw new UnauthorizedException(message);
  }

  forbidden(message = "Forbidden"): never {
    throw new ForbiddenException(message);
  }

  conflict(message: string): never {
    throw new ConflictException(message);
  }

  serviceUnavailable(message = "Service unavailable"): never {
    throw new ServiceUnavailableException(message);
  }

  internal(message = "Internal server error"): never {
    throw new InternalServerErrorException(message);
  }
}
