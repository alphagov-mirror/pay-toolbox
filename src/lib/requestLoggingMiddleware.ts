import * as morgan from 'morgan'
import * as logger from './logger'

const { requestLogFormat } = require('@govuk-pay/pay-js-commons').logging

const logRequest = function logRequest(): void {
  return morgan(requestLogFormat, {
    stream: {
      write: (message: string): void => {
        logger.info('Request received', JSON.parse(message))
      }
    }
  })
}

export = logRequest
