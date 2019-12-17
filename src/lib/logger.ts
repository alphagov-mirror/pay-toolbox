// Sensible defaults for different logging transports based on environment
// set through config
// @TODO(sfount) also extract and log the correlation ID sent from the nginx
//               reverse proxy servers in production
// import * as crypto from 'crypto'
import * as crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { createLogger, format, transports } from 'winston'

// @FIXME(sfount) performance implications of cls-hooked and using the async-hooks
//                node libraries should be very carefully considered continuation-local
//                storage is basically the equivalent of Java thread storage, expires
//                after all methods in a call have ended
import { createNamespace } from 'cls-hooked'

import WinstonSentryTransport from './winstonSentryTransport'

import * as config from '../config'

const { govUkPayLoggingFormat } = require('@govuk-pay/pay-js-commons').logging

const {
  combine,
  timestamp,
  json,
  splat,
  prettyPrint
} = format

const TOOLBOX_ID_KEY = 'toolbox_id'
const CORRELATION_ID_KEY = 'correlation_id'
const AUTHENTICATED_USER_ID_KEY = 'authenticated_user_id'

const logger = createLogger()
const session = createNamespace('govuk-pay-logging')

const loggerMiddleware = function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  session.run((): void => {
    const correlationHeader = 'x-request-id'
    const toolboxId = crypto.randomBytes(4).toString('hex')
    session.set(TOOLBOX_ID_KEY, toolboxId)
    session.set(CORRELATION_ID_KEY, req.headers[correlationHeader])
    session.set(AUTHENTICATED_USER_ID_KEY, req.user && req.user.username)

    // expose toolbox ID to template for debugging
    res.locals.toolboxId = toolboxId
    next()
  })
}

const supplementProductionInfo = format((info) => {
  // LOGSTASH 675 versioning https://gds-way.cloudapps.digital/manuals/logging.html
  const productionContext: any = {
    toolbox_id: session.get(TOOLBOX_ID_KEY),
    x_request_id: session.get(CORRELATION_ID_KEY),
    user_id: session.get(AUTHENTICATED_USER_ID_KEY)
  }
  return Object.assign(info, productionContext)
})

if (!config.common.development) {
  const productionTransport = new transports.Console({
    format: combine(
      supplementProductionInfo(),
      splat(),
      prettyPrint(),
      govUkPayLoggingFormat({ container: 'toolbox', environment: process.env.ENVIRONMENT }),
      json()
    ),
    level: 'info'
  })
  logger.add(productionTransport)
}

if (!config.common.development) {
  const sentryTransport = new WinstonSentryTransport({
    level: 'error'
  })
  logger.add(sentryTransport)
}

// coloursise and timestamp developer logs as these will probably be viewed
// in a simple console (vs. in an already timestamped web viewer)
if (config.common.development) {
  const developmentTransport = new transports.Console({
    level: 'debug',
    format: combine(
      format((info) => Object.assign(info, { toolboxId: session.get(TOOLBOX_ID_KEY) }))(),
      timestamp({ format: 'HH:mm:ss' }),
      format.colorize(),
      format.simple()
    )
  })
  logger.add(developmentTransport)
}

// @TODO(sfount) attaching object to logger could muddy API in future
Object.assign(logger, { middleware: loggerMiddleware })

// eslint-disable-next-line import/prefer-default-export
export = logger
