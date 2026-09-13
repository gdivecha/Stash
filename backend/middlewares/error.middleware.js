const errorMiddleware = (err, req, res, next) => {
    try {
        // Shallow cloning `{ ...err }` loses non-enumerable properties like `name` and `message` on native Error instances.
        let error = err;
        let statusCode = err.statusCode || err.status || 500;
        let message = err.message || 'Server error';

        console.error(err);

        // Mongoose bad ObjectId
        if (err.name === 'CastError') {
            message = 'Resource not found';
            statusCode = 404;
        }

        // Mongoose duplicate key
        if (err.code === 11000) {
            // Extract specific conflicting field name if available from Mongo error keyPattern/keyValue
            const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
            message = `Duplicate ${field} value entered`;
            statusCode = 400;
        }

        // Mongoose stores the string 'ValidationError' under `err.name`, while `err.code` is undefined.
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors || {}).map(val => val.message);
            message = messages.join(', ');
            statusCode = 400;
        }

        // Handle JWT authentication/authorization errors cleanly
        if (err.name === 'JsonWebTokenError') {
            message = 'Invalid authentication token';
            statusCode = 401;
        }

        if (err.name === 'TokenExpiredError') {
            message = 'Authentication token expired';
            statusCode = 401;
        }

        res.status(statusCode).json({ 
            success: false, 
            error: message 
        });
    } catch (error) {
        next(error);
    }
};

export default errorMiddleware;
