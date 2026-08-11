import { ERROR_CODES } from '../config/constants.js';
import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
    console.error(`❌ [Express Error] [${req.method} ${req.url}]:`, err);

    const statusCode = err.statusCode || err.status || 500;
    const errorCode = err.code || ERROR_CODES.INTERNAL_SERVER_ERROR;

    const response = {
        success: false,
        error: {
            code: errorCode,
            message: err.message || 'An unexpected error occurred on the server'
        }
    };

    if (env.NODE_ENV === 'development' && err.stack) {
        response.error.stack = err.stack;
    }

    res.status(statusCode).json(response);
}

export function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: {
            code: ERROR_CODES.NOT_FOUND,
            message: `Endpoint ${req.method} ${req.originalUrl} not found`
        }
    });
}
