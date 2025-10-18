import { createLogger, format, transports } from 'winston';

const logger = createLogger({
    level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    format: format.combine(format.timestamp(), format.json()),
    defaultMeta: { service: 'me2resh-daily-scan' },
    transports: [new transports.Console()],
});

if (process.env.NODE_ENV === 'test') {
    logger.transports.forEach((t) => (t.silent = true));
}

export { logger };
