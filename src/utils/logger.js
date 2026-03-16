'use strict';

const winston = require('winston');
const path = require('path');
const { nodeEnv } = require('../config/environment');

const logDir = path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
    level: nodeEnv === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 10 * 1024 * 1024, // 10 MB
            maxFiles: 5,
        }),
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            maxsize: 20 * 1024 * 1024, // 20 MB
            maxFiles: 10,
        }),
    ],
});

if (nodeEnv !== 'production') {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
                    return `${timestamp} [${level}]: ${message}${metaStr}`;
                })
            ),
        })
    );
}

module.exports = logger;
