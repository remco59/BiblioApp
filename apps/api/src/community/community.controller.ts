import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthedRequest } from '../auth/auth.guard';
import { Public, Roles } from '../auth/decorators';
import { BookDto } from '../catalog/dto';
import {
  BookReviewsDto,
  HandleSuggestionDto,
  ModerateDto,
  ReviewDto,
  ReviewInputDto,
  SuggestionDto,
  SuggestionInputDto,
  WishlistAddDto,
} from './dto';
import { CommunityService } from './community.service';
import { RecommendationsService } from './recommendations.service';

@ApiTags('community')
@Controller()
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Public()
  @Get('books/:id/reviews')
  @ApiOkResponse({ type: BookReviewsDto })
  bookReviews(@Param('id', ParseIntPipe) id: number, @Req() req: AuthedRequest) {
    return this.community.bookReviews(id, req.user?.id);
  }

  @Post('me/reviews')
  @ApiOkResponse({ type: ReviewDto })
  saveReview(@Body() dto: ReviewInputDto, @Req() req: AuthedRequest) {
    return this.community.saveReview(req.user!.id, dto.bookId, dto.rating, dto.body);
  }

  @Get('me/reviews')
  @ApiOkResponse({ type: [ReviewDto] })
  myReviews(@Req() req: AuthedRequest) {
    return this.community.myReviews(req.user!.id);
  }

  @Delete('me/reviews/:bookId')
  @HttpCode(204)
  deleteReview(@Param('bookId', ParseIntPipe) bookId: number, @Req() req: AuthedRequest) {
    return this.community.deleteReview(req.user!.id, bookId);
  }

  @Get('me/wishlist')
  @ApiOkResponse({ type: [BookDto] })
  wishlist(@Req() req: AuthedRequest) {
    return this.community.wishlist(req.user!.id);
  }

  @Get('me/wishlist/ids')
  @ApiOkResponse({ type: [Number] })
  wishlistIds(@Req() req: AuthedRequest) {
    return this.community.wishlistIds(req.user!.id);
  }

  @Post('me/wishlist')
  @HttpCode(204)
  addWish(@Body() dto: WishlistAddDto, @Req() req: AuthedRequest) {
    return this.community.addToWishlist(req.user!.id, dto.bookId);
  }

  @Delete('me/wishlist/:bookId')
  @HttpCode(204)
  removeWish(@Param('bookId', ParseIntPipe) bookId: number, @Req() req: AuthedRequest) {
    return this.community.removeFromWishlist(req.user!.id, bookId);
  }

  @Post('me/suggestions')
  @ApiOkResponse({ type: SuggestionDto })
  suggest(@Body() dto: SuggestionInputDto, @Req() req: AuthedRequest) {
    return this.community.suggest(req.user!.id, dto);
  }

  @Get('me/suggestions')
  @ApiOkResponse({ type: [SuggestionDto] })
  mySuggestions(@Req() req: AuthedRequest) {
    return this.community.mySuggestions(req.user!.id);
  }

  @Get('me/recommendations')
  @ApiOkResponse({ type: [BookDto] })
  recommendationsForMe(@Req() req: AuthedRequest) {
    return this.recommendations.forUser(req.user!.id);
  }

  // ---- medewerkers ----

  @Get('staff/reviews')
  @Roles('LIBRARIAN', 'ADMIN')
  @ApiQuery({ name: 'status', enum: ['PENDING', 'APPROVED', 'REJECTED'], required: false })
  @ApiOkResponse({ type: [ReviewDto] })
  queue(@Query('status') status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.community.moderationQueue(status);
  }

  @Post('staff/reviews/:id/moderate')
  @Roles('LIBRARIAN', 'ADMIN')
  @HttpCode(200)
  @ApiOkResponse({ type: ReviewDto })
  moderate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerateDto,
    @Req() req: AuthedRequest,
  ) {
    return this.community.moderate(id, dto.status, dto.note, req.user!.id);
  }

  @Get('staff/suggestions')
  @Roles('LIBRARIAN', 'ADMIN')
  @ApiQuery({ name: 'status', required: false })
  @ApiOkResponse({ type: [SuggestionDto] })
  allSuggestions(@Query('status') status?: string) {
    return this.community.allSuggestions(status);
  }

  @Patch('staff/suggestions/:id')
  @Roles('LIBRARIAN', 'ADMIN')
  @ApiOkResponse({ type: SuggestionDto })
  handle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleSuggestionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.community.handleSuggestion(id, dto.status, dto.note, req.user!.id);
  }
}
