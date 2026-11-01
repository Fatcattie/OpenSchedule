/**
 * WsGateway（R6-4 / §3.2 WS 实时刷新）：socket.io 网关，房间=tenantId（+可选 projectId 订阅）。
 * - 握手鉴权：复用 Bearer access token（JWT 校验 + AuthUserLoader 实时加载用户/租户，§3.4 权限即时生效口径）；
 *   鉴权失败/无效一律 disconnect，不进入任何房间（§3.3 安全基线：WS 与 HTTP 同口径鉴权）。
 * - 订阅关键领域事件（Outbox 重放 → 进程内 EventBus）→ 按 tenantId 广播（+projectId 可选房间）：
 *   task.created / task.assigned / task.status_changed / task.completed / task.comment_created / mention.parsed。
 * - 客户端可用 `join-project` / `leave-project` 事件订阅/退订项目房间（看板页多浏览器实时刷新）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { COMMENT_EVENTS, TASK_EVENTS } from '@openschedule/domain-events';
import { Socket, Server } from 'socket.io';
import {
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuthUserLoader } from '../auth/auth-user.loader';
import { AccessTokenPayload, AuthUser } from '../auth/auth-user.interface';
import { buildWsFrame, extractWsToken, projectRoom, tenantRoom } from './ws-auth';

/**
 * WS 握手 CORS：与主应用 CORS_ORIGINS 白名单同口径（§3.3 生产白名单只含正式域）；
 * 读模块加载时环境变量（worker/dispatcher 同模式），避免装饰器静态参数无法经 DI 注入。
 */
const WS_CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

@Injectable()
@WebSocketGateway({
  cors: { origin: WS_CORS_ORIGINS, credentials: true },
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loader: AuthUserLoader,
  ) {}

  /** 握手：校验 Bearer access token → 加载 AuthUser（用户/租户状态校验）→ 加入租户房间；失败即断开 */
  async handleConnection(client: Socket): Promise<void> {
    const token = extractWsToken(client.handshake.auth as Record<string, unknown> | undefined);
    if (!token) {
      this.logger.warn(`WS 握手拒绝（缺 token）：socket=${client.id}`);
      client.disconnect(true);
      return;
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      this.logger.warn(`WS 握手拒绝（token 无效/过期）：socket=${client.id}`);
      client.disconnect(true);
      return;
    }
    if (payload.type !== 'access' || !payload.sub || !payload.tenantId) {
      this.logger.warn(`WS 握手拒绝（token 形态错误）：socket=${client.id}`);
      client.disconnect(true);
      return;
    }

    let user: AuthUser;
    try {
      user = await this.loader.load(payload.sub, payload.tenantId);
    } catch (err) {
      this.logger.warn(`WS 握手拒绝（用户/租户无效）：socket=${client.id} err=${(err as Error).message}`);
      client.disconnect(true);
      return;
    }

    client.data.user = user;
    await client.join(tenantRoom(user.tenantId));
    this.logger.log(`WS 已连接：socket=${client.id} tenant=${user.tenantId} user=${user.userId}`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = client.data.user as AuthUser | undefined;
    if (user) {
      await client.leave(tenantRoom(user.tenantId));
      this.logger.log(`WS 已断开：socket=${client.id} tenant=${user.tenantId}`);
    }
  }

  /** 客户端订阅/退订项目房间（看板页实时刷新；鉴权在握手时已完成，房间归属在广播时按 payload.tenantId 校验） */
  @SubscribeMessage('join-project')
  onJoinProject(@MessageBody() projectId: string, client: Socket): void {
    const user = client.data.user as AuthUser | undefined;
    if (!user || !projectId) return;
    void client.join(projectRoom(user.tenantId, projectId));
  }

  @SubscribeMessage('leave-project')
  onLeaveProject(@MessageBody() projectId: string, client: Socket): void {
    const user = client.data.user as AuthUser | undefined;
    if (!user || !projectId) return;
    void client.leave(projectRoom(user.tenantId, projectId));
  }

  // ===================== 领域事件 → WS 广播（Outbox 重放后接进程内 EventBus，R3/R6） =====================
  // 只广播「租户作用域读模型刷新」类事件；写入类事件（如 automation 副作用）不广播，避免与 HTTP 响应重复。

  @OnEvent(TASK_EVENTS.CREATED, { async: true })
  onTaskCreated(payload: Record<string, unknown>): void {
    this.broadcast(TASK_EVENTS.CREATED, payload);
  }

  @OnEvent(TASK_EVENTS.ASSIGNED, { async: true })
  onTaskAssigned(payload: Record<string, unknown>): void {
    this.broadcast(TASK_EVENTS.ASSIGNED, payload);
  }

  @OnEvent(TASK_EVENTS.STATUS_CHANGED, { async: true })
  onTaskStatusChanged(payload: Record<string, unknown>): void {
    this.broadcast(TASK_EVENTS.STATUS_CHANGED, payload);
  }

  @OnEvent(TASK_EVENTS.COMPLETED, { async: true })
  onTaskCompleted(payload: Record<string, unknown>): void {
    this.broadcast(TASK_EVENTS.COMPLETED, payload);
  }

  @OnEvent(COMMENT_EVENTS.CREATED, { async: true })
  onCommentCreated(payload: Record<string, unknown>): void {
    this.broadcast(COMMENT_EVENTS.CREATED, payload);
  }

  @OnEvent(COMMENT_EVENTS.MENTION_PARSED, { async: true })
  onMentionParsed(payload: Record<string, unknown>): void {
    this.broadcast(COMMENT_EVENTS.MENTION_PARSED, payload);
  }

  /** 广播到租户房间；payload 带 projectId 时同步广播到项目房间（看板页按项目订阅） */
  private broadcast(eventName: string, payload: Record<string, unknown>): void {
    const tenantId = payload.tenantId as string | undefined;
    if (!tenantId) return;
    const frame = buildWsFrame(eventName, payload);
    this.server.to(tenantRoom(tenantId)).emit(eventName, frame);
    const projectId = payload.projectId as string | undefined;
    if (projectId) this.server.to(projectRoom(tenantId, projectId)).emit(eventName, frame);
  }
}