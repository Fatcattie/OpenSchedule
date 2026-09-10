/**
 * api-keys.service.ts
 */
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { AuthUser } from '../../common/decorators/current-user.decorator'
import { generateApiKey, hashApiKey, getKeyPrefix } from './api-key'

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async list(user: AuthUser) {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenantId: user.tenantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        expiresAt: true, lastUsedAt: true, createdAt: true,
      },
    })
    return { data: keys }
  }

  async create(user: AuthUser, input: { name: string; scopes?: string[]; expiresAt?: string }) {
    const plainKey = generateApiKey()
    const keyHash = hashApiKey(plainKey)
    const keyPrefix = getKeyPrefix(plainKey)

    const record = await this.prisma.apiKey.create({
      data: {
        tenantId: user.tenantId,
        name: input.name,
        keyHash,
        keyPrefix,
        scopes: input.scopes ?? ['*'],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: user.userId,
      },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        expiresAt: true, createdAt: true,
      },
    })

    // 仅创建时返回一次完整明文 Key
    return {
      data: {
        ...record,
        secret: plainKey, // 完整 Key，仅展示一次
      },
    }
  }

  async revoke(id: string, user: AuthUser) {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, tenantId: user.tenantId, revokedAt: null },
    })
    if (!key) throw new NotFoundException('API Key 不存在')

    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), revokedBy: user.userId },
    })

    return { data: { id, revoked: true } }
  }
}
