# Windows 本地 Nginx 部署

默认仅测试 `http://monitor.cecp.it:8088/` → Nginx → `127.0.0.1:3000`，没有 `/mixer` 子路径。本配置不会监听、重定向或抢占 80。现有 `server.pyw`、Node/VBS 自动启动和 Wi-Fi 自动连接无需改动，不使用 PM2。

## 准备

1. 从 [Nginx 官方下载页](https://nginx.org/en/download.html) 下载 Windows 版本，解压至 `C:\nginx`，确认存在 `C:\nginx\nginx.exe`。仓库不包含二进制文件。
2. 保持本目录四个文件放在一起，可位于项目任意磁盘路径（包括空格）。脚本使用旁边的配置，运行前缀固定 `C:/nginx/`。不要单独双击 `nginx.exe`，其默认配置可能监听 80。
3. 确认 Windows 的 StudioLive 网络网卡仍为 `192.168.50.10`，DNS `monitor.cecp.it` 解析到此地址，调音台为 `192.168.50.102`。另一张网卡 `192.168.5.12` 不在本配置的监听地址中。
4. 检查项目本机 `.env`（不提交到 Git）：`HOST=0.0.0.0`、`PORT=3000`、`MIXER_IP=192.168.50.102`、`ALLOWED_HOSTS=monitor.cecp.it`。保留实际账户、`ALLOWED_MIXES` 和已确认的 Aux 模式配置。这里只核对，不替换现有 Node 启动方式。
5. 确认既有 Node 服务工作：浏览器访问 `http://127.0.0.1:3000/`。Nginx 不负责启动 Node。

## 启动测试与停止

在本目录打开 Windows CMD：

```bat
start-nginx.bat
```

脚本先运行 `nginx -t`，校验测试监听地址，再启动并检查 PID 和监听端口。失败会返回非零退出码，没有重启循环。PID、日志分别在 `C:\nginx\logs\cecp-iem.pid`、`cecp-iem-error.log`、`cecp-iem-access.log`。

本机检查原始 Host（包含端口）转发：

```bat
curl.exe -i -H "Host: monitor.cecp.it:8088" http://127.0.0.1:8088/
```

浏览器打开 `http://monitor.cecp.it:8088/`，使用原账户登录。确认会话、授权监听列表、音量读取正常；未登录访问 `/api/status` 返回 401 是正常的权限保护。实际音量/静音写入请按项目的实机验收步骤测试。

如 Windows 防火墙阻挡手机访问，在确认当前网卡的防火墙配置后，以管理员 PowerShell 添加限定网段、地址和端口的规则（脚本不会自动执行）：

```powershell
New-NetFirewallRule -DisplayName 'CECP IEM Nginx test 8088' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress 192.168.50.10 -LocalPort 8088 -RemoteAddress 192.168.50.0/24 -Profile Private
```

该规则只适用于 Private 配置文件；检查当前网络配置，不要为此关闭整台机器的防火墙。手机须处于 `192.168.50.0/24` 并能解析上述域名。

停止此 Nginx 实例：

```bat
stop-nginx.bat
```

脚本核对专用 PID 对应的是 `C:\nginx\nginx.exe`，使用 `-s quit` 平滑退出，不使用 `taskkill`，不会停止 Node 或 Python。等待专用 PID 文件消失后再启动。修改配置时使用先停止、再启动。

## 将来迁移至正式 80（现阶段不要执行）

最终访问地址为 `http://monitor.cecp.it/`。先完成 8088 验收，再由现场负责人安排现有 Flask 服务迁移到其他端口或停止；**本项目不会自动停止 Flask**。在负责人完成安排、确认 80 已释放之前保持 8088。

1. 停止本项目的测试 Nginx，备份 `nginx.conf`。
2. 手动将配置中两行 `listen 192.168.50.10:8088;` 和 `listen 127.0.0.1:8088;` 改为相同地址的 `:80;`。保持其余代理和访问控制配置不变。
3. 检查 80 没有其他监听者：`netstat -ano | findstr LISTENING | findstr :80`（注意分辨 8088 等其他端口），并在需要时添加同样限定网段/地址的 80 防火墙规则。
4. 执行 `start-nginx.bat 80`。没有显式 `80` 参数时脚本仍要求 8088 配置，不会默默启用 80。
5. 在 `http://monitor.cecp.it/` 重新登录并验收。Cookie 不按端口隔离，多个测试入口共用会话时可能需要重新登录。
6. 失败时停止本项目 Nginx、恢复备份，再运行 `start-nginx.bat` 回到 8088；原 Flask 是否恢复由现场负责人决定。

## 代理行为与排错

- `proxy_set_header Host $http_host` 保留客户端原始 Host（含 `:8088`），现有 `ALLOWED_HOSTS=monitor.cecp.it` 和同源请求继续有效。Cookie、Origin、CSRF 请求头、HTTP 方法和请求体按原请求转发；没有 URL 重写和缓存。
- 禁用上游重试，防止不确定的设备写入被代理重复发送。这里只提供本地 HTTP，不进行公网映射或云部署。
- 代理入口只允许回环与 `192.168.50.0/24`，因为 Node 看见的代理来源是 `127.0.0.1`。现有 Node 登录按来源 IP 的限制会在代理后共享；不改动当前认证机制。
- 502：检查现有 Node 3000 服务。403：检查 DNS、Host、客户端网段、账户授权。连接失败：检查 Windows 地址、端口占用、防火墙和错误日志。
- 已存在 PID：先使用停止脚本。若提示 PID 过期，人工检查 PID 内容、任务管理器及命令行，确定本实例已退出后才删除专用 `cecp-iem.pid`，不要删除其他实例 PID 或停止不明进程。
- IP 变化时，调音台 IP 改本机 `.env` 的 `MIXER_IP` 并按原方式重启 Node；Windows IP 变化还须同步 DNS、Nginx 监听/allow 规则、防火墙和脚本中的地址检查。

## 验证范围

开发机已通过应用类型检查与 12 项测试；Nginx 原配置语法检查通过，但完整检查因开发机没有 192.168.50.10 地址而无法绑定。临时改用回环测试地址和隔离上游后，完整 nginx -t 与 Host/Origin/Cookie/CSRF、PATCH 路径/请求体、Set-Cookie 转发检查通过。**Windows 批处理、双网卡、防火墙、教会 DNS 和真实 StudioLive 32S 均仍需现场验收**，不能以本地测试代替。

官方参考：[Windows 版使用说明](https://nginx.org/en/docs/windows.html)、[命令行参数](https://nginx.org/en/docs/switches.html)、[Host 转发说明](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)。
