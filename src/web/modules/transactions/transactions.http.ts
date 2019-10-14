/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-param-reassign */
/* eslint-disable import/prefer-default-export */
import { Request, Response, NextFunction } from 'express'

import { Transaction } from 'ledger'

import { Ledger, Connector, AdminUsers } from '../../../lib/pay-request'

import { periodKey } from './selected.period'

import * as logger from '../../../lib/logger'

const moment = require('moment');

export async function searchPage(req: Request, res: Response): Promise<void> {
  res.render('transactions/search', { csrf: req.csrfToken() })
}

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.body

    // most basic search implementation - just forward to transactions route
    res.redirect(`/transactions/${id}`)
  } catch (error) {
    next(error)
  }
}

// @TODO(sfount) move to `transaction.d.ts` -- resolve JavaScript/ TypeScript module issue
export enum PaymentListFilterStatus {
  'succeeded', 'failed', 'in-progress', 'all'
}


export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let account
    const accountId = req.query.account
    const selectedStatus = req.query.status || PaymentListFilterStatus[PaymentListFilterStatus.all]
    const response = await Ledger.transactions(accountId, req.query.page, selectedStatus)

    if (req.query.account) {
      account = await AdminUsers.gatewayAccountServices(accountId)
    }

    res.render('transactions/list', {
      transactions: response.results,
      selectedStatus,
      set: response,
      account,
      accountId
    })
  } catch (error) {
    next(error)
  }
}

export async function show(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const transaction = await Ledger.transaction(req.params.id) as Transaction
    const account = await Connector.account(transaction.gateway_account_id)
    const service = await AdminUsers.gatewayAccountServices(transaction.gateway_account_id)

    const transactionEvents = await Ledger.events(
      transaction.transaction_id,
      transaction.gateway_account_id
    )
    const events = transactionEvents.events
      .map((event: any) => {
        event.data = Object.keys(event.data).length ? event.data : null
        return event
      })
    res.render('transactions/payment', {
      transaction,
      account,
      service,
      events
    })
  } catch (error) {
    next(error)
  }
}

const sum = (a: number, b: number) => a + b

export async function statistics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let account
    const accountId = req.query.account

    if (req.query.account) {
      account = await AdminUsers.gatewayAccountServices(accountId)
    } else {
      // @TODO(sfount) temporarily disable platform level queries - these aren't yet supported by Ledger
      throw new Error('Platform statistics not supported by Ledger')
    }

    const selectedPeriod: any = req.query.period || 'today'
    const momentKey = periodKey(selectedPeriod)

    const fromDate: string = moment().utc().startOf(momentKey).format()
    const toDate: string = moment().utc().endOf(momentKey).format()

    const paymentsByState = await Ledger.getPaymentsByState(accountId, fromDate, toDate)
    const paymentStatistics = await Ledger.paymentStatistics(accountId, fromDate, toDate)

    const results = {
      payments: paymentStatistics.count,
      gross: paymentStatistics.gross_amount,
      success: paymentsByState.success,
      error: paymentsByState.error,
      in_progress: [paymentsByState.created, paymentsByState.started, paymentsByState.submitted, paymentsByState.capturable].reduce(sum, 0)
    }
    res.render('transactions/statistics', {
      account,
      accountId,
      selectedPeriod,
      results
    })
  } catch (error) {
    next(error)
  }
}