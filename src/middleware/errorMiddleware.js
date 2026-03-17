import { ApiError } from "../utils/ApiError.js";

const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";
  let errors = err.errors || [];

  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = "Validation Error";
    errors = Object.values(err.errors).map(val => val.message);
  }

  // Handle Mongoose Cast Errors (Invalid ID)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Handle JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = "Invalid token. Please log in again.";
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = "Your session has expired. Please log in again.";
  }

  // Log error for debugging (you might want to use a proper logger like winston)
  console.error(`[Error] ${req.method} ${req.url} - ${statusCode} - ${message}`);
  
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    // console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

export default errorMiddleware;
