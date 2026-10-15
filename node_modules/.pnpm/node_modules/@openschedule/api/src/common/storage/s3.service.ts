/**
 * S3Service：S3 兼容存储客户端（MinIO / AWS S3 / 腾讯云 COS 等）。
 * 使用 node:crypto SigV4 签名 + 全局 fetch 实现（零外部 SDK 依赖），懒初始化。
 * 环境变量：STORAGE_ENDPOINT / STORAGE_BUCKET / STORAGE_REGION / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_USE_SSL / STORAGE_PATH_STYLE
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** S3 / MinIO 客户端配置 */
interface S3Config {
  endpoint: string; // host[:port]，不含协议
  scheme: string; // http | https
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  pathStyle: boolean; // MinIO 一般 true
  presignExpires: number; // 预签名 URL 有效期（秒），默认 300
}

/** PUT 结果 */
export interface S3PutResult {
  objectKey: string;
  etag: string;
  location: string;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private config: S3Config | null = null;
  private configured: boolean | null = null;

  constructor(private readonly configService: ConfigService) {}

  /** 是否已配置存储（env 变量齐全） */
  isConfigured(): boolean {
    if (this.configured === null) {
      const endpoint = this.configService.get<string>('STORAGE_ENDPOINT');
      const bucket = this.configService.get<string>('STORAGE_BUCKET');
      const accessKey = this.configService.get<string>('STORAGE_ACCESS_KEY');
      const secretKey = this.configService.get<string>('STORAGE_SECRET_KEY');
      this.configured = !!(endpoint && bucket && accessKey && secretKey);
      if (!this.configured) {
        this.logger.warn('S3 存储未配置（STORAGE_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY 缺失），附件功能不可用');
      }
    }
    return this.configured;
  }

  /** 懒加载配置 */
  private getConfig(): S3Config {
    if (!this.config) {
      if (!this.isConfigured()) {
        throw new ServiceUnavailableException({ code: 503, message: '对象存储未配置，附件功能暂不可用' });
      }
      const endpoint = this.configService.get<string>('STORAGE_ENDPOINT')!;
      this.config = {
        endpoint,
        scheme: this.configService.get<string>('STORAGE_USE_SSL') === 'true' ? 'https' : 'http',
        bucket: this.configService.get<string>('STORAGE_BUCKET')!,
        region: this.configService.get<string>('STORAGE_REGION') ?? 'us-east-1',
        accessKey: this.configService.get<string>('STORAGE_ACCESS_KEY')!,
        secretKey: this.configService.get<string>('STORAGE_SECRET_KEY')!,
        pathStyle: this.configService.get<string>('STORAGE_PATH_STYLE') !== 'false', // 默认 true（MinIO）
        presignExpires: this.configService.get<number>('STORAGE_PRESIGN_EXPIRES') ?? 300,
      };
    }
    return this.config;
  }

  /** 构建对象 URL */
  private buildUrl(key: string): string {
    const c = this.getConfig();
    if (c.pathStyle) {
      return `${c.scheme}://${c.endpoint}/${c.bucket}/${key}`;
    }
    return `${c.scheme}://${c.bucket}.${c.endpoint}/${key}`;
  }

  /** 上传文件到 S3 兼容存储 */
  async putObject(key: string, body: Buffer, contentType: string): Promise<S3PutResult> {
    const c = this.getConfig();
    const url = this.buildUrl(key);
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.substring(0, 8);

    const headers: Record<string, string> = {
      'Host': c.pathStyle ? c.endpoint : `${c.bucket}.${c.endpoint}`,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };

    const authorization = this.signRequest(
      'PUT', `/${c.bucket}/${key}`, '', headers, payloadHash, c.region, c.accessKey, c.secretKey, dateStamp, amzDate,
    );

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, Authorization: authorization },
      body: new Uint8Array(body), // Buffer 不可直接赋给 BodyInit（Node fetch 类型），转 Uint8Array
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`S3 PUT 失败 (${res.status}): ${text.substring(0, 500)}`);
      throw new ServiceUnavailableException({ code: 503, message: '文件上传失败（对象存储不可用）' });
    }

    const etag = res.headers.get('etag')?.replace(/^"|"$/g, '') ?? '';
    return { objectKey: key, etag, location: url };
  }

  /** 生成预签名 GET URL（临时下载链接） */
  presignGetUrl(key: string, expiresSeconds?: number): string {
    const c = this.getConfig();
    const expires = expiresSeconds ?? c.presignExpires;
    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = amzDate.substring(0, 8);

    const credential = `${c.accessKey}/${dateStamp}/${c.region}/s3/aws4_request`;
    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expires),
      'X-Amz-SignedHeaders': 'host',
    };

    // 构建规范查询串（按 key 排序）
    const canonicalQuery = Object.keys(queryParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const host = c.pathStyle ? c.endpoint : `${c.bucket}.${c.endpoint}`;
    const canonicalHeaders = `host:${host}`;
    const signedHeaders = 'host';
    const canonicalRequest = ['GET', `/${c.bucket}/${key}`, canonicalQuery, `${canonicalHeaders}\n`, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');

    const scope = `${dateStamp}/${c.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const signature = this.computeSignature(c.secretKey, dateStamp, c.region, stringToSign);

    const url = this.buildUrl(key);
    return url + '?' + canonicalQuery + '&X-Amz-Signature=' + signature;
  }

  // ===================== SigV4 签名工具 =====================

  private signRequest(
    method: string, canonicalUri: string, canonicalQuery: string,
    headers: Record<string, string>, payloadHash: string,
    region: string, accessKey: string, secretKey: string,
    dateStamp: string, amzDate: string,
  ): string {
    const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(k => `${k.toLowerCase()}:${headers[k]}`)
      .join('\n');

    const canonicalRequest = [method, canonicalUri, canonicalQuery, `${canonicalHeaders}\n`, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signature = this.computeSignature(secretKey, dateStamp, region, stringToSign);

    return 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  }

  private computeSignature(secretKey: string, dateStamp: string, region: string, stringToSign: string): string {
    const kDate = createHmac('sha256', `AWS4${secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    return createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  }

  private formatAmzDate(d: Date): string {
    return d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  /** 生成安全的 object key（含租户前缀） */
  static buildObjectKey(tenantId: string, resourceType: string, resourceId: string, fileName: string): string {
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_').substring(0, 100);
    return `${tenantId}/${resourceType}/${resourceId}/${randomUUID()}-${safeName}`;
  }
}