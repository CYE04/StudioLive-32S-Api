# Aux 总静音与内置对讲

## 源码确认

依赖固定为 `@featherbear/presonus-studiolive-api@1.9.1`。下列路径直接来自安装包 `dist/_internal.mjs`，没有新增 UCNET 编码、逆向地址或任意命令接口：

| 功能 | 库 API / selector | 实际参数（Mix 13 示例） |
| --- | --- | --- |
| Aux Master Mute 读取 | `getMute({ type: 'AUX', channel: 13 })` | `aux/ch13/mute` |
| Aux Master Mute 写入 | `setMute({ type: 'AUX', channel: 13 }, true/false)` | `aux/ch13/mute` |
| 内置对讲送到 Aux 读取 | `getLevel({ type: 'TALKBACK', mixType: 'AUX', mixNumber: 13 })` | `talkback/ch1/aux13` |
| 内置对讲送到 Aux 写入 | `setChannelVolumeLinear({ type: 'TALKBACK', mixType: 'AUX', mixNumber: 13 }, percent)` | `talkback/ch1/aux13` |

`parseChannelString` 将 TALKBACK 明确映射到 `talkback/ch1`；这里的 ch1 是 talkback 对象内部编号，不是普通 Input CH1。`_getLevelString` 拼出 `/auxN`。`_getMuteTargetString` 在没有 mixType 时使用 `/mute`；带 mixType 会成为 `/assign_auxN`，所以总静音绝不传 mixType。

包内参数解码表包含 `**.mute` 布尔值及 `talkback.*.aux*` 浮点值。类型定义 `dist/types/lib/definitions/ChannelSelector.d.ts` 明确包含 TALKBACK；`ZlibPayload.d.ts` 的 Talkback → ch1 → FluffyValues 包含 aux1–aux32。安装包 API 映射在测试中直接验证。

应用读取 **ReceivedState 中的设备快照/事件**，不直接把库 getLevel 的乐观缓存当成设备确认。写入只调用上述公开方法，等待对应设备事件；没有回显时另开有超时的只读快照连接确认。写入结果不明会断开并要求重连读取，不自动重试。

## API 与权限

- `GET /api/mixes/:mix/mute` → `{mix, muted, writable, source, readAt}`
- `PATCH /api/mixes/:mix/mute` 请求体严格为 `{"muted":true}` 或 `{"muted":false}`，不支持 toggle、Input/Send Mute。
- `GET /api/mixes/:mix/talkback` → `{mix, input:"talkback", level, unit:"percent", writable, source, readAt}`
- `PATCH /api/mixes/:mix/talkback` 请求体严格为 `{"level":25}`，范围 0–100，与既有 send 一致；并非 dB、Gain、Talk 按钮或 Main。

所有读取与写入均要求有效登录会话，同时通过账户 Mix 授权和服务 `ALLOWED_MIXES`。写入还要求原有 CSRF、每账户写入限速、经过确认的 Aux 模式以及未链接的 Aux 总线。链接总线不尝试扩展到可能属于其他用户的 partner。不存在或不可解码的设备参数返回不可用，绝不补默认值。

页面沿用原有同步轮询。静音状态未知时禁用；对讲状态未知时保留“对讲”行并禁用推子，显示未同步原因，不填入假设备值。演示模式不生成这两项的假设备反馈。普通输入、通道锁定、账户与 StudioLive 连接流程保持原逻辑。页面输入列表只展示 CH5–30（立体声输入仍按原方式合并），Coro 1–4 的前端默认外观和显示已移除；旧外观数据中的 CH1–4 在加载时忽略，未修改其持久化数据、后端通道映射或设备输入。

对讲使用连续 range 推子（步长 0.01%），拖动显示预览，松手后 PATCH 当前 Mix 的 `/talkback` 并等待设备确认，与普通输入的提交时机一致。独立的总静音按钮仍使用 `/mute`。对讲可用“对讲”或“talkback”搜索，在全部/话筒人声中显示。

## 验证与现场验收

代码测试包括真实 AuthService 登录、Cookie、CSRF、账户权限与全局 allowlist 的交集、非法字段、共享限速、退出失效、收到设备事件的 reducer、缺失参数拒绝、链接/非 Aux 拒写及安装库真实映射。测试中的 adapter sentinel 只记录调用后报“无设备”，不会绕过权限，也不构造成功的设备回复。

**这些是代码测试，不代表 Windows 或真实 StudioLive 32S 已验收。** 库能寻址不保证每版固件都返回这些参数，现场发现缺失状态应保留禁用并收集只读快照，不能强行开启。

现场使用已授权且不影响演出的测试 Aux（例如 Aux 13）：

1. 以其专属账户登录，确认调音台连接、Aux 模式和原有普通输入音量控制正常。记下测试前 Aux Mute 和对讲 send 数值。
2. 在调音台手动改变 **Aux 13 Master Mute**，观察网页轮询后“静音/已静音”变化。网页再设置一次并确认调音台对应总静音变化、刷新状态一致。检查没有改变 Input Mute 或其他 Aux。
3. 检查对讲推子出现，先比较读数；在测试 Aux 上小幅调整对讲 send，确认调音台/UC Surface 对应值变化并回读一致。需要在安全监听条件下由现场人员检查对讲声音，不修改对讲全局 Gain、分配或 Talk 开关。
4. 修改请求中的 Mix 为其他账户的 Mix 和 allowlist 之外的 Mix，GET/PATCH 都应返回 403 且调音台没有变化。
5. 在调音台再次改变对讲发送量，确认网页同步。断网后控件应禁用，重连读取后才可继续。写入不明时先读取，不连点重试。
6. 恢复测试前的 Aux Mute 和对讲发送量。由现场人员记录固件版本、实际变化和回读结果。

Nginx 部署步骤见 [Windows 部署文档](../deploy/windows/README.md)。不修改任何既有 Wi-Fi/Node 自动启动或 Python 服务。
