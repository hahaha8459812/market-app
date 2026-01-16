import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WsService } from '../../ws/ws.service';
import { CreateStallDto } from '../dto/create-stall.dto';
import { ShopContextService } from './shop-context.service';
import { ShopRole } from '@prisma/client';

@Injectable()
export class ShopStallService {
  constructor(
    private prisma: PrismaService,
    private ws: WsService,
    private ctx: ShopContextService,
  ) {}

  async listStalls(shopId: number, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    const productsOrderBy: Prisma.ProductOrderByWithRelationInput[] = [
      { sortOrder: Prisma.SortOrder.asc },
      { id: Prisma.SortOrder.asc },
    ];
    const productsInclude: Prisma.Stall$productsArgs =
      member.role === ShopRole.CUSTOMER
        ? { where: { isActive: true }, orderBy: productsOrderBy }
        : { orderBy: productsOrderBy };
    return this.prisma.stall.findMany({
      where: member.role === ShopRole.CUSTOMER ? { shopId, isActive: true } : { shopId },
      include: { products: productsInclude },
      orderBy: { id: 'asc' },
    });
  }

  async createStall(shopId: number, dto: CreateStallDto, userId: number) {
    const member = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(member.role);
    await this.ctx.ensureShop(shopId);
    const stall = await this.prisma.stall.create({ data: { shopId, name: dto.name, description: dto.description } });
    this.ws.emitToShop(shopId, { type: 'stall_created', shopId, stallId: stall.id });
    return stall;
  }

  async updateStall(shopId: number, stallId: number, userId: number, dto: { name?: string; description?: string; isActive?: boolean }) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const stall = await this.prisma.stall.findFirst({ where: { id: stallId, shopId } });
    if (!stall) throw new NotFoundException('铺子不存在');
    const updated = await this.prisma.stall.update({ where: { id: stallId }, data: dto });
    await this.prisma.log.create({
      data: { shopId, actorId: actor.id, type: 'stall_update', content: `修改摊位 ${stallId}`, amount: 0 },
    });
    this.ws.emitToShop(shopId, { type: 'stall_updated', shopId, stallId });
    return updated;
  }

  async deleteStall(shopId: number, stallId: number, userId: number) {
    const actor = await this.ctx.requireMember(shopId, userId);
    this.ctx.ensureShopManager(actor.role);
    const stall = await this.prisma.stall.findFirst({ where: { id: stallId, shopId } });
    if (!stall) throw new NotFoundException('摊位不存在');

    await this.prisma.$transaction(async (tx) => {
      await tx.product.deleteMany({ where: { stallId } });
      await tx.stall.delete({ where: { id: stallId } });
      await tx.log.create({
        data: { shopId, actorId: actor.id, type: 'stall_delete', content: `删除摊位 ${stallId}（${stall.name}）`, amount: 0 },
      });
    });

    this.ws.emitToShop(shopId, { type: 'stall_deleted', shopId, stallId });
    return { ok: true };
  }
}

