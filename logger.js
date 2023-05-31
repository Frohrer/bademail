const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const custom_format = printf(({ level, message, label, timestamp }) => {
    return `${timestamp} - ${level}: ${message}`;
});

const logger = createLogger({
    level: 'info',
    format: combine(
        timestamp(),
        custom_format
    ),
    defaultMeta: { service: 'bademail-service' },
    transports: [
      new transports.File({ filename: 'logs/error.log', level: 'error' }),
      new transports.File({ filename: 'logs/info.log', level: 'info' }),
      new transports.File({ filename: 'logs/combined.log' }),
    ],
});

module.exports = {
    logger
}