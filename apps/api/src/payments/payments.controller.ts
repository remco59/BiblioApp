import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import type { AuthedRequest } from '../auth/auth.guard';
import { Public } from '../auth/decorators';
import { PaymentsService } from './payments.service';

class OnlineCheckoutDto {
  @ApiProperty({ type: Number }) paymentId: number;
  @ApiProperty({ type: String, description: 'Stuur de gebruiker hierheen om te betalen' })
  checkoutUrl: string;
}
class PaymentInfoDto {
  @ApiProperty({ type: String }) providerRef: string;
  @ApiProperty({ type: Number }) amountCents: number;
  @ApiProperty({ enum: ['PENDING', 'PAID', 'FAILED'] }) status: string;
  @ApiProperty({ type: String }) description: string;
}
class CompleteDto {
  @ApiProperty({ enum: ['PAID', 'FAILED'] }) @IsIn(['PAID', 'FAILED']) outcome: 'PAID' | 'FAILED';
}
class WebhookDto {
  @ApiProperty({ type: String }) @IsString() @MaxLength(100) providerRef: string;
}

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('me/fines/:id/pay-online')
  @HttpCode(200)
  @ApiOkResponse({ type: OnlineCheckoutDto })
  start(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.payments.start(req.user!.id, id);
  }

  /** Webhook voor providers: de status wordt altijd bij de provider zelf opgevraagd. */
  @Public()
  @Post('payments/webhook')
  @HttpCode(204)
  async webhook(@Body() dto: WebhookDto) {
    await this.payments.settle(dto.providerRef);
  }

  /** Status voor de terugkeer-pagina; de onraadbare referentie fungeert als token. */
  @Public()
  @Get('payments/:ref')
  @ApiOkResponse({ type: PaymentInfoDto })
  info(@Param('ref') ref: string) {
    return this.payments.get(ref);
  }

  /** Alleen met de mock-provider: simuleert de betaalpagina van een provider. */
  @Public()
  @Post('payments/mock/:ref/complete')
  @HttpCode(200)
  async mockComplete(@Param('ref') ref: string, @Body() dto: CompleteDto) {
    this.payments.mock.complete(ref, dto.outcome);
    return { status: await this.payments.settle(ref) };
  }
}
