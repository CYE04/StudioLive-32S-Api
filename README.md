# CECP Monitor — Phase 2

局域网耳返控制：账号 + 8 位 PIN 登录，后端强制限定账号可控制的 FlexMix/AUX，手机网页调节 Channel Send。只使用开源 `@featherbear/presonus-studiolive-api@1.9.1`，没有自行编写 UCNET 协议。

Phase 1 真实 StudioLive 32S 连接、Aux 13 / Channel 1 写入与读回已通过；原始研究与验收记录保存在 [PHASE1.md](PHASE1.md)。Phase 2 已完成浏览器登录和真实 32 通道读取，观察到经登录请求的 44% Send 获得 `device-event` 确认。还需用户用实际手机验证 Wi-Fi 访问和触摸操作；没有声称已完成手机实测或长时间稳定性测试。

新增：获授权 Aux 总静音及内置对讲发送量已接入，**尚未进行真实 32S 验收**。准确库 API、参数路径与现场步骤见 [Aux 总静音与对讲](docs/aux-mute-talkback.md)。Windows Nginx 默认使用 8088，正式 80 仅提供手动迁移步骤，见 [部署说明](deploy/windows/README.md)。

## 启动和使用

Node.js 24+：

```sh
npm ci --ignore-scripts
# 首次安装才复制；已有 .env 不要覆盖
cp .env.example .env
# 编辑 .env 配置设备 IP、允许的 Mix、监听地址
npm run account -- --id aux13 --name 'Aux 13 测试' --mixes 13
npm run dev
```

已有测试账号 `aux13` 时不必再创建；PIN 仅在创建/重置时显示一次，代码和账户文件不保存明文。

本机打开 `http://127.0.0.1:3000/`，手机连接与服务电脑可互通的教会 Wi-Fi，打开终端打印的 `Phone / LAN` 地址。手机使用的是**电脑的 IP**，不是调音台 IP。如果 macOS 提示 Node 的局域网/防火墙访问，需要允许；访客 Wi-Fi 客户端隔离可能阻止访问。

登录后只显示获配 Mix；可搜索真实通道名称，拖动推子松手后发送，或使用 ±1% 按钮。值的单位是 0–100 推子百分比，**不是 dB、声压或线性振幅**。发送中禁用重复提交；设备事件或独立快照确认后才显示成功。失败不会自动重试写入或恢复旧值。

页面推子刻度按本机 StudioLive 32S 实测校准：现场把 Aux 13 的 Channel 1–11 分别摆在 −∞、−60、−50、−40、−30、−20、−10、−5、U、+5、+10，随后用独立只读设备快照一次读回全部 Send。测得 U 为 73.633%，−5 为 60.352%，+5 为 86.035%。各点的完整记录见下表。点击刻度会发送对应的 AUX Send 位置；两点之间的 dB 读数仅为线性插值估计，实际确认仍以设备回读的推子百分比为准。0% 显示为 −∞。实体推子是人工对准刻线，存在轻微定位误差；换设备时需重新校准。

| Aux 13 Channel | 实体刻度 | 设备回读推子位置 |
| ---: | ---: | ---: |
| 1 | −∞ | 0% |
| 2 | −60 dB | 5.946% |
| 3 | −50 dB | 10.270% |
| 4 | −40 dB | 14.595% |
| 5 | −30 dB | 25.946% |
| 6 | −20 dB | 37.297% |
| 7 | −10 dB | 49.189% |
| 8 | −5 dB | 60.352% |
| 9 | U / 0 dB | 73.633% |
| 10 | +5 dB | 86.035% |
| 11 | +10 dB | 99.902% |

断线后保持 HTTP 服务和登录可用，但推子禁用。页面可点击“重新连接”，最短 10 秒一次尝试，没有无穷自动重启。重启服务会使全部登录失效。退出登录立即撤销该会话。

## 配置和账号

`.env`（已忽略，不提交）：

```dotenv
MIXER_IP=
PORT=3000
HOST=127.0.0.1
ALLOWED_MIXES=13
VERIFIED_AUX_MODE_VALUE=
ACCOUNTS_FILE=data/accounts.json
```

- `HOST=0.0.0.0` 开放给局域网手机；当前现场已使用此配置。默认模板保持本机访问。
- `ALLOWED_MIXES` 是全局硬限制，账户权限只能取其交集。当前 `.env` 列出 5、6、7、8、9、10、11、13。
- `VERIFIED_AUX_MODE_VALUE` 默认空值。当前这台 32S 的 `0` 已由真实快照和用户 UC Aux 模式截图核实。库返回 `busmode.strings:9`，不是标签数组，因此通过本地校准识别。更换设备或升级固件后清空并重新核实，不能照抄来解锁未知设备。
- 纯局域网模式运行：日常启动直接执行 `npm start`（或 `./start.sh`）。乐手与歌手连接教会同一个 Wi-Fi 后，在手机浏览器打开电脑的局域网地址（如 `http://192.168.50.103:3000` 或苹果设备访问 `http://yuendemacbook-air.local:3000`），电脑本机可直接访问 `http://localhost:3000`。

以后调音台 IP 再变：在项目文件夹运行 `open -e .env` 打开配置，只把 `MIXER_IP=` 后面的地址改为新地址并保存；在运行服务的终端按 `Ctrl+C`，再执行 `npm run dev`。看到 `StudioLive connected` 才表示新地址已连通。若显示连接超时，先检查 Mac 是否连接新路由器及调音台当前 IP；服务不会在后台无限重试。

添加其他乐手（先由现场人员确认该 Mix 的用途，再在全局白名单开放）：

```sh
npm run account -- --id piano --name '钢琴' --mixes 3
```

重新生成 PIN 或修改分配（须完整提供新的分配）：

```sh
npm run account -- --id aux13 --name 'Aux 13 测试' --mixes 13 --reset
```

然后重启服务。账号文件 `data/accounts.json` 只保存 scrypt 加盐哈希和 Mix 分配，权限 0600；整个 `data/` 已忽略。删除账号可从该本地文件移除对应条目并重启。没有网页管理员系统或公开注册入口。

## API 与权限

| 路径 | 权限 / 行为 |
| --- | --- |
| `POST /api/login` | JSON `{account,pin}`；返回 HttpOnly、SameSite=Strict 会话 cookie 和 CSRF token |
| `GET /api/session` | 需登录；返回本人显示名、有效 Mix 分配、CSRF token |
| `POST /api/logout` | 需登录及 `X-CSRF-Token`，撤销会话 |
| `GET /api/status` | 需登录；真实持续连接状态 |
| `POST /api/reconnect` | 需登录及 CSRF；有冷却时间；不写入设备参数 |
| `GET /api/mixes` | 只返回本人被分配且在全局白名单内的 Mix |
| `GET /api/mixes/:mix/channels` | 只返回获配 Mix 的真实输入通道名称、Send 与可写状态 |
| `GET /api/mixes/:mix/channels/:channel` | 同上；单通道 |
| `PATCH /api/mixes/:mix/channels/:channel` | 需登录、CSRF、双重 Mix 权限；仅接受 `{level:number}`，0–100 |
| `GET /api/mixes/:mix/mute` | 读取本人 Aux Master Mute |
| `PATCH /api/mixes/:mix/mute` | 需登录、CSRF、双重 Mix 权限；仅接受 `{muted:boolean}` |
| `GET /api/mixes/:mix/talkback` | 读取内置对讲到本人 Aux 的发送量 |
| `PATCH /api/mixes/:mix/talkback` | 需登录、CSRF、双重 Mix 权限；仅接受 `{level:number}`，0–100 |

旧 Phase 1 无登录的 curl 调用现在会返回 401，这是预期行为。获配 Aux 13 的账号即使手工请求 Mix 1，GET 和 PATCH 都返回 403，且在调用 adapter 前拒绝。

安全边界：

- PIN 是随机 8 位数字，scrypt 加盐哈希；登录最多每 IP 20 次/15 分钟、每账号 10 次/15 分钟（含成功尝试）。错误不泄露账号是否存在。重启会清空内存限流记录。
- 会话随机 256 位，固定 8 小时；cookie HttpOnly、SameSite=Strict；写操作必须附带独立随机 CSRF token。无 CORS，校验同源 Origin 和本机/LAN Host，忽略代理转发 IP。
- API 只接受直接来自 loopback/私有 LAN 的连接。此版本是可信局域网 HTTP，PIN 和 cookie **没有传输加密**；不用于共享不可信网络、端口转发或 Internet。未提供公网访问、PWA 或云部署；本地 Nginx 配置另在代理入口限制允许网段。
- 仅提供 `LINE` / 内置 `TALKBACK` → `AUX` Send 与获授权 Aux Master Mute 写入口。Main LR、Input/Send Mute、Gain、48V、Routing、Scenes、Preamp 等均未开放。
- 未知模式、未知链接状态或立体声链接的输入/总线保持只读，包括相邻配对通道检查。UI 会明确标注；不自动解除链接或更改模式。当前 Piano 等已链接输入因此只读，这是有意保留的限制。
- 同时只确认一次设备写入；页面请求限速且无自动写入重试。断线期间没有可提交的推子操作。

## 架构和设备确认

```text
Browser → HTTP API + AuthService → MixerAdapter → StudioLiveAdapter
                                               ↓
                                   isolated device-worker
                                               ↓
                        @featherbear/presonus-studiolive-api → StudioLive
```

`ReceivedState` 保存的值只来自库解码的设备同步快照和接收事件。库的 `getLevel/state` 会被 `_setLevel` 乐观写入，所以页面与确认逻辑绝不以该缓存作为成功依据。

持续 worker 建立一次订阅，接收 PV/PS/PC 参数事件；不订阅音频电平表。前端约每 1.8 秒读取收到的状态，推子松开时才 PATCH。正常写入等待同一目标匹配的设备事件（最大 1.2 秒）；如果固件未回送给写入客户端，另开最长 8 秒的只读快照进程确认。不能确认时返回 `WRITE_UNCONFIRMED` 并断开，要求重新连接读取，**电平可能已改变**。

初始连接最多 8 秒，worker 崩溃不带崩 API。沿用上游 keepalive 检测断线：心跳响应由库内部消费，不能把“没有公开参数事件”误当作掉线。模式/链接事件若库仍返回未解码 Buffer，则按未知值禁用写入，重新同步后才能恢复。

读数 `source` 为 `device-snapshot` 或 `device-event`；`readAt` 是该参数的接收时间，不是假装每次 HTTP GET 都向设备重新查询。持续连接失效后不返回可操作的旧状态。

## 验证记录

### 页面演示与通道显示

服务端始终使用真实 `StudioLiveAdapter`，不再通过 `DEMO_MODE` 切换到模拟调音台。页面每次加载或登录默认关闭演示；只有手动点击“开启演示模式”才使用页面内的演示电平，且不会发送 AUX 写入请求。刷新、重新登录或点击“退出演示，返回实机”后恢复真实设备读取。演示不是连接成功或实机测试的证据。

页面仅显示普通输入 5–30，隐藏 Coro 1–4 及 31、32；另有独立的内置“对讲”推子。名称和图标为本地显示配置，不会修改调音台名称或路由。默认名称按现场清单设置，其中 Mixer2 按 25–26 处理，MP3 为 27–28，PCPodio 为 29–30。图标采用本机 Universal Control 的原版 SVG，来源记录见 [docs/uc-icons.md](docs/uc-icons.md)。

```sh
npm run check
npm test
```

16 项测试覆盖 PIN 哈希/错误密码/限流/会话撤销、白名单和账号权限交集、CSRF、未登录与越权 HTTP 请求、严格 JSON/数值、未知模式与配对链接保护。测试中的状态结构只用于 reducer 单元测试，不是设备模拟器，也不作为实机成功证据。

现场 Phase 2 检查：

- 浏览器登录成功，仅显示 Aux 13，读取 32 个真实输入通道及名称。
- 保持连接数分钟后仍可读取；一次测量的本机状态/通道 HTTP 读取约 2 ms（不是端到端推子延迟承诺）。
- 已登录账号访问 Mix 1 的 GET 和 PATCH 返回 403；注销后失效。
- 观察到账号 aux13 对 Aux 13 / Channel 1 的 44% 请求，收到设备事件确认 44.00000274181366%，后续新连接读回同值。未擅自恢复此值。
- 手机宽度 390 px 和桌面宽度 1280 px 布局检查无横向溢出；实际手机 Wi-Fi 访问尚待现场验证。

现场下一步：用手机打开电脑的 LAN 地址，登录测试账号，只测试 Aux 13，确认页面改动和 UC 相符。不要扩展其他乐手的白名单，直到确认每一路分配。
