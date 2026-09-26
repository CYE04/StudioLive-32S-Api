# CECP Monitor — Phase 1

状态：**Phase 1 核心实机验收已通过（2026-09-26，StudioLive 32S，Aux 13 / Channel 1）**。用户确认对应 Send 推子真实变化；已验证写入后设备快照及独立 GET 读回。停在 Phase 1，没有开始 Phase 2。没有模拟设备响应、UI、登录/PIN、PWA 或云服务。

## 运行

需要 Node.js 24+。

```sh
npm ci --ignore-scripts
cp .env.example .env
# 编辑 .env，填写现场确认过的 MIXER_IP
npm run dev
```

若已有 `.env`，不要用模板覆盖。配置：

```dotenv
MIXER_IP=
PORT=3000
ALLOWED_MIXES=1,2
```

用户已确认设备 IP，并已写入本地 `.env`。网络/路由器更换后只需修改 `.env` 并重启。IP 仅接受私有 LAN IPv4。`.env` 已被忽略，不提交设备地址。

API 仅绑定 `127.0.0.1`，在连接调音台 LAN 的电脑上调用。尚无身份认证，Phase 1 不开放给其他电脑/手机；未来浏览器访问另行设计。拒绝跨站 Origin 和非本地 Host。

## API

- `GET /api/status`：进行真实订阅握手和初始状态同步，返回 `connected`、设备提供的 `mixer` 名称、`checkedAt`；失败返回 `connected:false` 和明确错误。设备没提供名称时为 `null`，不会填入假型号。
- `GET /api/mixes`：仅列出 allowlist 内、实际快照中存在的 FlexMix，返回名称、设备模式标签、原始模式值和 `writable`。
- `GET /api/mixes/:mix/channels/:channel`：读取设备新连接的同步快照中的 AUX Send。
- `PATCH /api/mixes/:mix/channels/:channel`：只接受 `{"level":50}`，写入后使用另一个新连接读回；误差不超过 0.01 个百分点才返回成功。

**level 单位是推子百分比（0–100），不是 dB，也不是声压或线性振幅。** `-12.5` 将返回 400。读写均带 `unit:"percent"`，成功读回带 `source:"device-snapshot"` 和 `readAt`。上游 dB 换算为近似多项式并取整，未提供可靠精确 dB 读回，所以本阶段不提供 dB 字段。

每次操作采用短连接，`connected:true` 表示在 `checkedAt` 完成真实握手与状态同步，并非永久 TCP 会话。这样每次 GET 都从设备重新同步，不返回旧缓存；代价是延迟较大。本阶段不适合高频推子拖动。

错误：白名单外 403（包括 POST 到已知 channel 路径），非法字段/数值 400，不存在的设备目标 404，不支持的方法 405，非 JSON 415，过大请求 413，设备忙/不安全模式/读回不匹配 409，连接或设备故障 503/504。没有任意 command/property 入口。未知路径返回 404。

写入超时或读回失败**可能已改变 Send**，不会声称成功，也不会自动重试或恢复。先 GET 并在设备上核对。启动只读状态，绝不自动执行测试写入。

## 开源实现审查与已知问题

选用 MIT 的 [featherbear/presonus-studiolive-api](https://github.com/featherbear/presonus-studiolive-api)，npm 固定版本 **1.9.1**，lockfile 固定依赖。已阅读 README、[API 文档及示例](https://featherbear.cc/presonus-studiolive-api/)、`run.ts`、`src/simple/README.md` 和以下源码，并核对安装包构建产物的相关逻辑。审查源码提交：`3e02b29a4a5b28695b6e1fad057ec4b4508f915a`。

- README 明确面向 Series III；作者列出的实测型号有 16、16R、24R、32SC，**不含 32S**。32S 兼容性必须现场验证。
- [`Client.ts`](https://github.com/featherbear/presonus-studiolive-api/blob/3e02b29a4a5b28695b6e1fad057ec4b4508f915a/src/lib/Client.ts)：`_getLevelString` 将 `{type:'LINE',channel:1,mixType:'AUX',mixNumber:1}` 映射为 `line/ch1/aux1`；`setChannelVolumeLinear` 接收百分比，写入时除以 100。全部协议编码、订阅、解析由第三方库负责。
- [`transformers.ts`](https://github.com/featherbear/presonus-studiolive-api/blob/3e02b29a4a5b28695b6e1fad057ec4b4508f915a/src/lib/util/transformers.ts)：AUX 的设备值为未乘 100 的浮点数；主推子 volume 有不同变换。不能把二者混用。
- `_setLevel` 不等待设备确认，会把请求的百分比直接写入缓存。因此写后调用 `getLevel()` **不构成真实读回**，而且缓存单位可能与接收值不一致。本项目从 `dumpState().internal` 读取设备 Synchronize 快照，写后另外建立全新会话验证，不使用乐观缓存判断成功。
- [`zlibNodeParser.ts`](https://github.com/featherbear/presonus-studiolive-api/blob/3e02b29a4a5b28695b6e1fad057ec4b4508f915a/src/lib/util/zlib/zlibNodeParser.ts) 的 `dumpNode` 保留 `value`/`strings`。优先按设备提供的 `busmode.strings` 标签数组解析。现场发现 32S 实际返回 `{strings:9,value:0}`，库没有把数字元数据解析成标签数组。2026-09-26 用户 UC 截图明确显示 Aux 13 的 Aux 模式，配合实时只读快照确认该设备 Aux 模式值为 0，link=0，Channel 1 link=false。因此本地 `.env` 配置 `VERIFIED_AUX_MODE_VALUE=0`，不在代码中假定全型号通用映射。空值默认拒绝未知模式；不匹配的值仍拒绝，明确的设备标签优先。更换设备或升级固件后应清空此校准并重新核实。每次写入仍重新读取当前模式和链接状态。
- 仅允许明确 Aux 模式、未链接总线、未链接输入的 Send 写入；不支持 Subgroup/Matrix 或未知链接状态。不会替用户更改模式或解除链接。
- `connect()` 初始连接有无条件 2 秒重试，即使 `autoreconnect:false` 仍会发生；`close()` 也不能可靠取消全部上游定时器。adapter 使用隔离子进程，单个会话最多 8 秒，然后终止；不会无限重启。一次 PATCH 最多两个会话，操作串行，忙时直接返回 409。
- 上游 TCP 分片解析等异常可能终止设备进程；父 API 保持运行并报告故障。尚无真实网络稳定性验证。
- 仅使用基础 `Client`，未使用 SimpleClient、meter 订阅或附带示例中的其他控制操作。唯一电平写调用强制 `LINE` + `AUX`。不修改 Main LR、Gain、48V、Routing、Scenes、Mutes、Preamp 或其他 FOH 参数。

所有第三方耦合在 `src/mixer` 中，API 只依赖 `MixerAdapter`，更换库不需要修改未来用户系统。

## 现场验收（待执行）

1. 电脑和 StudioLive 32S 接到同一控制 LAN，确认 IP，填入 `.env`。现场人工确认 Mix 1 是可测试的 Aux，且输入/总线不处于立体声链接；本服务不会变更这些设置。
2. `npm run dev`，必须看到真实 `StudioLive connected`；核对 `Mixer:` 与设备。
3. 使用以下只读请求检查：

```sh
curl http://127.0.0.1:3000/api/status
curl http://127.0.0.1:3000/api/mixes
curl http://127.0.0.1:3000/api/mixes/1/channels/1
```

4. 记录原始读数。在现场选择合适的测试百分比，把下面的 `50` 替换成该值；此数值仅是 API 格式示例，不是推荐耳返音量。

```sh
curl -X PATCH http://127.0.0.1:3000/api/mixes/1/channels/1 \
  -H 'Content-Type: application/json' -d '{"level":50}'
curl http://127.0.0.1:3000/api/mixes/1/channels/1
```

5. 确认 StudioLive 32S 上 **Mix 1 / Channel 1 AUX Send** 真实变化，PATCH 和随后的 GET 返回设备新值。记录设备固件、时间、原读数、请求值、实际读回及面板观察。服务不自动还原；如需恢复，只对同一 Send 使用记录的原值。
6. 保持 `ALLOWED_MIXES=1,2`，请求 Mix 10 应 403，调音台无变化。
7. 完成后停止 Phase 1，不自动开始 Phase 2。

现场验收记录（2026-09-26）：已真实连接并识别 StudioLive 32S；用户选择 Aux 13 替代 Mix 1，本地白名单仅为 13。初始 Channel 1 Send=0%，UC 截图与设备元数据确认 Aux 模式和未链接状态。请求写入 5%，截图显示写后新会话快照返回 4.999999701976776%（07:55:42 UTC），随后独立 GET 返回相同值（07:55:53 UTC）。用户确认推子移动，随后按 20% 测试步骤再次确认“有用动起来了”；20% 的 API 返回未另行提供，不作为已记录数值。原值 0% 的恢复命令已提供，是否恢复尚未确认。固件版本未记录。白名单拒绝已通过本地 HTTP 测试；现场 Mix 1 非 Aux 写入也被安全检查拒绝。以下测试步骤中的 Mix 1 路径需改为 Mix 13；白名单测试按当前 `.env` 执行。

## 本地验证

```sh
npm run check
npm test
```

已通过 TypeScript 检查和 5 项安全测试：配置/白名单校验、目标与电平校验、adapter 拒绝越权、HTTP 安全边界。HTTP 测试使用“一旦调用便抛错”的哨兵来证明拒绝请求不触达设备，**没有伪造 mixer response**。这些测试不等于实机验收。
