/**
 * 链路 1/4：鉴权链（注册 + 登录）
 *
 * 说明：`/auth/login` 受 §3.3 限流保护（每 IP 5 次/分钟），单机压测**必然**出现 429。
 *      这是**设计行为**：本链路把 429 声明为「预期状态码」并计入 `load_throttled`，
 *      容量结论以 02/03/04 三条链路为准（见 qa-load/k6/README.md「限流与容量口径」）。
 *
 * 运行：k6 run qa-load/k6/01-auth.js -e BASE_URL=http://localhost:3000/api/v1
 */
import { check, sleep } from 'k6';
import { api, THRESHOLDS, VUS, DURATION, PASSWORD, throttledRate, businessLatency } from './lib.js';

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: Object.assign({}, THRESHOLDS, {
    checks: ['rate>0.9'], // 429 仍算通过；本链路校核的是「不出现 5xx / 不出现未知 4xx」
    load_throttled: ['rate<1'],
  }),
  tags: { chain: 'auth' },
};

const EXPECTED = [201, 429];

export default function () {
  const nonce = __VU + '-' + __ITER + '-' + Date.now();
  const email = 'auth-' + nonce + '@load.test';

  const reg = api('POST', '/auth/register', {
    body: { email: email, password: PASSWORD, displayName: '压测', tenantName: '压测租户-' + nonce },
    tags: { op: 'auth.register' },
    expected: EXPECTED,
  });
  check(reg, { 'register 201/429': (r) => r.status === 201 || r.status === 429 });
  throttledRate.add(reg.status === 429);

  const login = api('POST', '/auth/login', {
    body: { email: email, password: PASSWORD },
    tags: { op: 'auth.login' },
    expected: EXPECTED,
  });
  check(login, { 'login 201/429': (r) => r.status === 201 || r.status === 429 });
  throttledRate.add(login.status === 429);
  if (login.status === 201) businessLatency.add(login.timings.duration);

  sleep(1);
}
