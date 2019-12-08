/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response, NextFunction } from 'express'

import { Transaction } from 'ledger'

import { Ledger, Connector, AdminUsers } from '../../../lib/pay-request'

const moment = require('moment')

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
    const relatedTransactions = []

    const transactionEvents = await Ledger.events(
      transaction.transaction_id,
      transaction.gateway_account_id
    )
    const events = transactionEvents.events
      .map((event: any) => {
        event.data = Object.keys(event.data).length ? event.data : null
        return event
      })

    if (transaction.refund_summary && transaction.refund_summary.amount_submitted !== 0) {
      const relatedResult = await Ledger.relatedTransactions(
        transaction.transaction_id,
        transaction.gateway_account_id
      )
      relatedTransactions.push(...relatedResult.transactions)
    }

    res.render('transactions/payment', {
      transaction,
      relatedTransactions,
      account,
      service,
      events
    })
  } catch (error) {
    next(error)
  }
}

const sum = (a: number, b: number): number => a + b

export async function statistics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let account
    const accountId = req.query.account

    if (req.query.account) {
      account = await AdminUsers.gatewayAccountServices(accountId)
    } else {
      // @TODO(sfount) temporarily disable platform level queries - not supported by Ledger
      throw new Error('Platform statistics not supported by Ledger')
    }

    const periodKeyMap: {[key: string]: string} = {
      today: 'day',
      week: 'week',
      month: 'month'
    }
    const selectedPeriod: any = req.query.period || 'today'
    const momentKey = periodKeyMap[selectedPeriod]

    const fromDate: string = moment().utc().startOf(momentKey).format()
    const toDate: string = moment().utc().endOf(momentKey).format()

    const paymentsByState = await Ledger.getPaymentsByState(accountId, fromDate, toDate)
    const paymentStatistics = await Ledger.paymentStatistics(accountId, fromDate, toDate)

    const results = {
      payments: paymentStatistics.payments.count,
      gross: paymentStatistics.payments.gross_amount,
      success: paymentsByState.success,
      error: paymentsByState.error,
      in_progress: [
        paymentsByState.created,
        paymentsByState.started,
        paymentsByState.submitted,
        paymentsByState.capturable
      ].reduce(sum, 0)
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
