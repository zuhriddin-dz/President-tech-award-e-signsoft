import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import {
  API_PATHS,
  CheckoutRequestSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  type PaymentList,
} from '@docflow/contracts';
import { AllowWhenLocked, Policy } from '../../common/policy.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';

/**
 * Buying the product, from inside the product.
 *
 * Both routes are @AllowWhenLocked, and that is the whole point: the workspace
 * that most needs to pay is the one whose trial has run out, and a paywall
 * that refuses to take money is just a wall. These join the two downloads as
 * the only things a locked workspace may still do.
 *
 * 'admin' rather than 'member': spending money on the workspace's behalf is
 * not something a member who was invited to sign documents should be able to
 * start.
 */
@Controller(API_PATHS.billing.slice(1))
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /**
   * Open a purchase and hand back where to pay. The pending row is written
   * before the URL exists, because the provider may call back about it the
   * moment the customer lands there.
   */
  @Post('checkout')
  @Policy('admin')
  @AllowWhenLocked()
  @Header('Cache-Control', 'no-store')
  async checkout(
    @Body(new ZodValidationPipe(CheckoutRequestSchema)) body: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    return this.billing.checkout(body);
  }

  /** What this workspace has paid, newest first. */
  @Get('payments')
  @Policy('admin')
  @AllowWhenLocked()
  @Header('Cache-Control', 'no-store')
  async payments(): Promise<PaymentList> {
    return this.billing.history();
  }
}
