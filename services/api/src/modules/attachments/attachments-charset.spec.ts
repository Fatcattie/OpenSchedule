/**
 * 控制器级回归：multipart 中文文件名不被 latin1 解码破坏（增量 11 缺陷修复）。
 *
 * 背景：`FileInterceptor` 未设 `defParamCharset` 时，multer 2.x 会把该选项以 undefined
 * 透传给 busboy，busboy 默认用 latin1 解码 part header 的 `filename` ⇒ 中文文件名乱码
 * （「现场照.heic」→「ç°åºç§.heic」）。修复：显式 `defParamCharset: 'utf8'`。
 *
 * 本 spec 用 Nest 测试模块起真实 `AttachmentsController`（`AttachmentsService` 以 mock 覆盖，
 * 不触 DB），发一个真实 multipart 请求，断言处理器收到的 `file.originalname` 逐字等于中文名。
 * 依赖仅 `@nestjs/testing`（已在 devDependencies）+ Node 内置 `http`（无 supertest，不新增依赖）。
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import type { UploadedAttachmentFile } from './dto/upload-attachment.dto';

/** 发一个 multipart POST（Node 内置 http，不引 supertest） */
function postMultipart(
  port: number,
  path: string,
  boundary: string,
  body: Buffer,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** 构造含中文文件名的 multipart 请求体（UTF-8 编码，符合 RFC 7578） */
function buildMultipartBody(boundary: string, fileName: string): Buffer {
  const parts: Buffer[] = [];
  const field = (name: string, value: string) =>
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'),
    );

  field('resource_type', 'task');
  field('resource_id', '11111111-1111-1111-1111-111111111111');
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/heic\r\n\r\n`,
      'utf8',
    ),
  );
  parts.push(Buffer.from([0x00, 0x01, 0x02, 0x03])); // 伪文件字节
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return Buffer.concat(parts);
}

describe('AttachmentsController —— multipart 中文文件名（defParamCharset=utf8）', () => {
  let app: INestApplication;
  let port = 0;
  let receivedFile: UploadedAttachmentFile | undefined = undefined;

  beforeAll(async () => {
    receivedFile = undefined;
    // vitest(esbuild) 不发射 emitDecoratorMetadata ⇒ 手动补构造参数类型，供 Nest DI 解析（见 vitest.config.ts 说明）
    Reflect.defineMetadata('design:paramtypes', [AttachmentsService], AttachmentsController);
    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentsController],
      providers: [
        {
          provide: AttachmentsService,
          useValue: {
            upload: async (_user: unknown, _dto: unknown, file: UploadedAttachmentFile | undefined) => {
              receivedFile = file;
              return { id: 'att-1' };
            },
            getDownloadUrl: async () => ({ url: 'https://example.invalid/signed' }),
            listByResource: async () => ({ data: [], meta: { total: 0 } }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
  });

  afterAll(async () => {
    await app.close();
  });

  it('处理器收到的 originalname 逐字等于中文文件名（无 latin1 乱码）', async () => {
    const fileName = '现场照.heic';
    const boundary = '----OpenScheduleBoundary7a1b2c3d';
    const body = buildMultipartBody(boundary, fileName);

    const res = await postMultipart(port, '/attachments', boundary, body);

    expect(res.status).toBe(201);
    expect(receivedFile).toBeDefined();
    expect(receivedFile?.originalname).toBe(fileName);
    // 反向断言：锁死修复依据 —— 默认 latin1 解码会得到的乱码，绝不能出现。
    expect(receivedFile?.originalname).not.toBe(Buffer.from(fileName, 'utf8').toString('latin1'));
    expect(receivedFile?.mimetype).toBe('image/heic');
  });
});
