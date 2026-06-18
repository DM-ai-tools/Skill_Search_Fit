from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, code: str, message: str, status_code: int = 400, details: list | None = None):
        super().__init__(
            status_code=status_code,
            detail={"error": {"code": code, "message": message, "details": details or []}},
        )


def not_found(message: str = "Resource not found") -> AppError:
    return AppError("NOT_FOUND", message, status.HTTP_404_NOT_FOUND)


def forbidden(message: str = "Forbidden") -> AppError:
    return AppError("FORBIDDEN", message, status.HTTP_403_FORBIDDEN)


def unauthorized(message: str = "Unauthorized") -> AppError:
    return AppError("UNAUTHORIZED", message, status.HTTP_401_UNAUTHORIZED)


def conflict(message: str, code: str = "CONFLICT") -> AppError:
    return AppError(code, message, status.HTTP_409_CONFLICT)


def validation_error(message: str, details: list | None = None) -> AppError:
    return AppError("VALIDATION_ERROR", message, status.HTTP_422_UNPROCESSABLE_ENTITY, details)
