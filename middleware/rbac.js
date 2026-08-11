import { ERROR_CODES } from '../config/constants.js';

export function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: ERROR_CODES.FORBIDDEN,
                    message: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}`
                }
            });
        }
        next();
    };
}
