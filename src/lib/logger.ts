type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  data?: unknown
  timestamp: string
  requestId?: string
}

function createEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
  return {
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  }
}

function log(entry: LogEntry): void {
  if (process.env.NODE_ENV === 'test') return

  const output = JSON.stringify(entry)

  switch (entry.level) {
    case 'error':
      console.error(output)
      break
    case 'warn':
      console.warn(output)
      break
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(output)
      }
      break
    default:
      console.log(output)
  }
}

export const logger = {
  debug: (message: string, data?: unknown) => log(createEntry('debug', message, data)),
  info: (message: string, data?: unknown) => log(createEntry('info', message, data)),
  warn: (message: string, data?: unknown) => log(createEntry('warn', message, data)),
  error: (message: string, data?: unknown) => log(createEntry('error', message, data)),
}

export default logger
