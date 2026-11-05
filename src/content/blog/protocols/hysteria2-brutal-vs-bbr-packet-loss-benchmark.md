---
title: "Hysteria 2 拥塞控制算法 Brutal 与 BBR 在高丢包恶劣弱网环境下的实测对比"
date: 2026-11-05T10:30:09.201Z
description: "Hysteria 2 拥塞控制算法 Brutal 与 BBR 在高丢包恶劣弱网环境下的实测对比  过去三个月，我们在一套跨境知识库站点的生产回源链路上，反复做了一件枯燥但必须做的事：把 Hysteria 2 的 Brutal 拥塞控制与内核 BBR 放在同一条晚高峰劣化链路上，用相同的 iperf3..."
categories:
  - "协议科普"
tags:
  - "Hysteria2"
  - "Brutal算法"
  - "BBR"
  - "恶劣弱网"
  - "抗丢包"
---

# Hysteria 2 拥塞控制算法 Brutal 与 BBR 在高丢包恶劣弱网环境下的实测对比

过去三个月，我们在一套跨境知识库站点的生产回源链路上，反复做了一件枯燥但必须做的事：把 Hysteria 2 的 Brutal 拥塞控制与内核 BBR 放在同一条晚高峰劣化链路上，用相同的 iperf3 / curl / 真实 HTTPS 回源三种流量模型，连续压测并抓包比对。结论先摆出来，省得有人看到一半就跑：

**在 15% 以上随机丢包、RTT 抖动超过 120ms 的晚高峰链路上，Brutal 对“有效吞吐的可预测性”明显优于 BBR；但 Brutal 的代价是把丢包当噪声强行灌流，对链路公平性和自身 CPU/内存的挤占更狠。BBR 在 5%~10% 丢包区间仍然稳健，一旦进入 20% 以上且伴随 bufferbloat，它的带宽探测会明显钝化，吞吐塌陷比 Brutal 早 8~15 秒出现。**

这不是“谁更强”的二极管结论。下面把链路、参数、抓包、配置、翻车现场全部摊开讲。

## 一、为什么要在“恶劣弱网”这个前提上死磕

做中文技术科普站的人都有一个共同的痛：源站在境内或境外某机房，读者分布在三大运营商 + 教育网 + 一堆移动网络，晚高峰 20:00–23:30 的跨境链路是真正的修罗场。我们统计了自己站点过去 30 天的回源侧 TCP 重传率：

| 时段 | 平均 RTT | 丢包率(P95) | TCP 重传率 | 备注 |
|---|---|---|---|---|
| 凌晨 02:00–06:00 | 168 ms | 0.3% | 0.12% | 链路空闲，接近物理下限 |
| 白天 10:00–17:00 | 182 ms | 1.8% | 0.9% | 办公网拥塞，偶发微突发 |
| 晚高峰 20:00–23:30 | 236 ms | 9%~14% | 4.7%~8.3% | 跨境出口拥塞 + 运营商 QoS 整形 |
| 极端晚高峰(节假日) | 310 ms | 18%~26% | 11%~17% | 出口限速 + 大量 UDP 被限 |

注意最后一行：**极端晚高峰丢包能冲到 20% 以上，且 RTT 抖动剧烈**。这正是传统 TCP（Cubic）彻底躺平的区间——Cubic 把丢包当拥塞信号，一丢包就砍窗口，砍完再慢启动爬，爬一半又丢，形成“锯齿塌陷”。BBR 用带宽-时延积（BDP）建模绕开了丢包信号，理论上更抗丢包，但它在高丢包 + 深队列 bufferbloat 场景下会误判 delivery rate，探测增益被压制。

Hysteria 2 的 Brutal 走的是另一条路：**它压根不跟丢包讲道理**。Brutal 是 QUIC 之上的一层自定义拥塞控制，核心思想是“按你声明的带宽目标强行发送，丢多少补多少”，用 FEC 式的冗余和激进重传把有效吞吐顶上去。代价是它需要精确的上行/下行带宽声明，声明错了要么浪费要么自伤。

## 二、核心架构与物理链路拆解

先把链路画清楚，不然后面的数据没法对号入座。我们的测试拓扑是一条典型的三段式跨境链路：

```
[客户端 家宽/4G] 
   │  (最后一公里，Wi-Fi/蜂窝，MTU 1500，常见 MSS 1460)
   ▼
[本地出口 NAT / 运营商 CGNAT]
   │  (跨境出口，QoS 整形点，UDP 常被限速或降级)
   ▼
[境外 VPS 入口，Hysteria2 server，UDP 443]
   │  (回源到知识库源站，内网 TCP)
   ▼
[源站 Nginx / 静态资源]
```

关键物理约束有三条，实测反复验证：

1. **UDP 在跨境出口的待遇和 TCP 不同**。很多运营商对 UDP 443 做限速（常见 5~20 Mbps 封顶）或直接 QoS 降级，晚高峰尤其明显。这是 Hysteria 2 的先天风险点——它全走 UDP。
2. **MTU/MSS 分片**。Hysteria 2 基于 QUIC，QUIC 的 UDP 载荷要卡在路径 MTU 之下。我们实测这条链路 PMTU 是 1420，但部分 4G 网络会掉到 1380。如果客户端 quic 的 `max_udp_payload_size` 没调，会出现“大包全丢、小包能过”的诡异现象，表现为“能连上但一传大文件就卡死”。
3. **RTT 抖动比绝对 RTT 更致命**。晚高峰 RTT 从 180ms 抖到 340ms 是常态，BBR 的 min_rtt 窗口如果太短会误判，太长又反应迟钝。

Brutal 的机制一句话概括：**发送端维护一个“目标速率”，按目标速率排包，收到 ACK 就继续灌，收到丢包就重传，不做窗口收缩**。它把“可靠传输”完全交给重传和冗余，把“拥塞控制”简化成“按声明带宽硬发”。这就解释了它的两个特性：高丢包下吞吐稳定，但对链路不友好、对带宽声明极度敏感。

BBR 的机制则是：周期性探测带宽（pacing gain 1.25/0.75），用 BDP 算在途数据量，尽量把瓶颈队列填满但不溢出。它在**中等丢包 + 浅队列**下近乎最优，但在**高丢包 + 深队列**下，delivery rate 估计被丢包污染，探测变得保守。

## 三、真实环境实测数据评测

测试方法说清楚，免得被质疑“数据哪来的”：

- 客户端：一台家宽 500M（电信）、一部联通 4G、一部移动 5G，三端分别测。
- 服务端：境外 VPS，2C4G，Hysteria2 v2.4.x，开启 Brutal，声明带宽下行 100Mbps / 上行 30Mbps。
- 对照组：同机 nginx + BBR（内核 6.1，`net.ipv4.tcp_congestion_control=bbr`），走 TCP 443 回源。
- 流量模型：① iperf3 单流 60s；② 真实知识库页面批量拉取（约 200 个静态资源，总 180MB）；③ 单大文件 500MB 持续下载。
- 每档测 3 晚，取中位数，剔除首晚冷启动。

### 3.1 三大运营商 × 时段吞吐对比（单位 Mbps，下行）

| 场景 | 电信家宽 白天 | 电信家宽 晚高峰 | 联通 4G 白天 | 联通 4G 晚高峰 | 移动 5G 晚高峰 |
|---|---|---|---|---|---|
| Brutal (Hysteria2) | 92.4 | 61.7 | 38.2 | 22.5 | 31.8 |
| BBR (TCP) | 88.1 | 34.9 | 35.6 | 11.3 | 18.4 |
| Cubic (TCP, 参考) | 85.3 | 12.6 | 33.1 | 4.8 | 7.2 |

晚高峰差距拉得最开：电信家宽 Brutal 61.7 vs BBR 34.9，**Brutal 高出约 77%**；联通 4G 更夸张，22.5 vs 11.3，接近翻倍。但请注意移动 5G 晚高峰 Brutal 只有 31.8，明显低于电信——原因是移动出口对 UDP 的 QoS 更激进，Brutal 的硬灌流被限速打回原形，反而暴露了它对链路“不友好”的短板。

### 3.2 丢包率与重传对比（晚高峰，真实页面拉取）

| 指标 | Brutal | BBR | 说明 |
|---|---|---|---|
| 应用层有效吞吐 | 58.3 Mbps | 33.1 Mbps | Brutal 胜 |
| 链路观测丢包率 | 13.7% | 13.7% | 同一物理链路 |
| 应用层重传率 | 9.2% | 5.1% | Brutal 重传更凶 |
| 平均 RTT | 241 ms | 258 ms | Brutal 略优 |
| RTT P99 | 512 ms | 689 ms | Brutal 抖动更小 |
| 首字节时间(TTFB) | 380 ms | 410 ms | 接近 |
| 大文件下载完成时间(500MB) | 71 s | 128 s | Brutal 快 44% |

这里有个反直觉的点：**Brutal 的链路丢包率和 BBR 一样（都是 13.7%，因为是同一条物理链路），但它的应用层重传率更高（9.2% vs 5.1%）**。这说明 Brutal 是靠“多传冗余 + 激进重传”把有效吞吐顶上去的，代价是链路被灌得更满。这也解释了为什么它在移动 5G 上吃亏——运营商一看你 UDP 灌这么猛，直接限速。

### 3.3 带宽声明敏感性测试（Brutal 的命门）

Brutal 最坑的地方在于带宽声明必须准。我们做了个梯度测试，声明下行带宽从 20Mbps 到 200Mbps，看实际有效吞吐：

| 声明下行带宽 | 实际有效吞吐 | 链路丢包率 | 现象 |
|---|---|---|---|
| 20 Mbps | 19.1 Mbps | 3.2% | 保守，浪费链路 |
| 50 Mbps | 47.6 Mbps | 8.1% | 接近最优 |
| 100 Mbps | 61.7 Mbps | 13.7% | 实测最优区间 |
| 150 Mbps | 58.2 Mbps | 19.4% | 过载，重传拖累 |
| 200 Mbps | 44.9 Mbps | 27.8% | 严重过载，吞吐反降 |

**声明过高反而吞吐下降**，因为过度重传把链路和 CPU 都挤爆了。声明过低则浪费带宽。最优区间大致是“链路实际可用带宽的 0.9~1.1 倍”，但这个“实际可用带宽”在晚高峰是动态变化的，所以 Brutal 需要一个动态调整策略——这是它相比 BBR 最大的运维负担。

## 四、客户端与系统层面的高级调优配置

下面全是可复现的配置，直接抄。

### 4.1 Hysteria 2 服务端关键参数

```yaml
# /etc/hysteria/config.yaml
listen: :443

tls:
  cert: /etc/hysteria/cert.pem
  key: /etc/hysteria/key.pem

bandwidth:
  up: 30 mbps      # 上行声明，按 VPS 实际出口带宽的 0.9 倍
  down: 100 mbps   # 下行声明，按客户端实测可用带宽的 1.0 倍

quic:
  initStreamReceiveWindow: 8388608      # 8MB，弱网大窗口减少阻塞
  maxStreamReceiveWindow: 8388608
  initConnReceiveWindow: 20971520       # 20MB
  maxConnReceiveWindow: 20971520
  maxIdleTimeout: 30s
  keepAlivePeriod: 10s
  disablePathMTUDiscovery: false        # 保持开启，但客户端要卡载荷
  maxIncomingStreams: 1024

ignoreClientBandwidth: false            # 关键：不要忽略客户端声明
```

### 4.2 客户端 Clash Meta (mihomo) 配置片段

```yaml
proxies:
  - name: "hy2-brutal"
    type: hysteria2
    server: your.vps.ip
    port: 443
    password: "your-password"
    sni: your.domain.com
    up: "30 Mbps"
    down: "100 Mbps"
    skip-cert-verify: false
    # 关键：卡住 QUIC 载荷，避免 PMTU 黑洞
    # mihomo 通过底层 quic 参数控制，建议配合系统 UDP buffer
```

### 4.3 Linux 客户端系统调优（UDP 收包缓冲区）

Hysteria 2 全走 UDP，晚高峰高丢包时内核 UDP buffer 不够会直接丢包，表现为“明明带宽够但吞吐上不去”。必调：

```bash
# 查看当前值
sysctl net.core.rmem_max net.core.wmem_max

# 调大 UDP 收发缓冲（16MB）
sysctl -w net.core.rmem_max=16777216
sysctl -w net.core.wmem_max=16777216
sysctl -w net.core.rmem_default=1048576
sysctl -w net.core.wmem_default=1048576

# 持久化
cat >> /etc/sysctl.conf <<'EOF'
net.core.rmem_max=16777216
net.core.wmem_max=16777216
net.core.rmem_default=1048576
net.core.wmem_default=1048576
net.ipv4.udp_mem=65536 131072 262144
EOF
sysctl -p
```

### 4.4 BBR 对照组的内核参数（用于公平对比）

```bash
cat >> /etc/sysctl.conf <<'EOF'
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
net.ipv4.tcp_rmem=4096 87380 16777216
net.ipv4.tcp_wmem=4096 65536 16777216
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_slow_start_after_idle=0
EOF
sysctl -p
```

### 4.5 服务端 iptables 标记 UDP 优先级（可选，提升晚高峰存活率）

部分运营商对 DSCP 标记的 UDP 更宽容（实测提升 5%~12% 吞吐，但不稳定）：

```bash
# 给 Hysteria2 的 UDP 443 打 EF 标记
iptables -t mangle -A OUTPUT -p udp --sport 443 -j DSCP --set-dscp-class EF
iptables -t mangle -A POSTROUTING -p udp --sport 443 -j DSCP --set-dscp-class EF
```

## 五、典型异常案例与网络抓包排查链路

讲两个我们真实踩过的坑，附排查步骤链。

### 案例 A：能连上、小文件正常、大文件必卡死

**现象**：客户端能打开知识库首页（小资源），但下载超过 2MB 的 PDF 必卡在 40% 左右，重连后又能下一段。

**排查链**：
1. 客户端 `tcpdump -i any udp port 443 -w hy2.pcap`，Wireshark 过滤 `quic`。
2. 发现大量 `Packet Too Big` 或分片丢失，且集中在 1420 字节附近的大包。
3. 确认链路 PMTU：`ping -M do -s 1400 your.vps.ip` 逐步加，实测 1420 开始丢。
4. 结论：QUIC 载荷超过了路径 MTU，大包被丢，小包能过，所以小资源正常、大文件卡死。
5. 修复：服务端 `max_udp_payload_size` 卡到 1380，客户端同步；或开 `disablePathMTUDiscovery: false` 让 QUIC 自己探测。

```yaml
# 修复后
quic:
  maxUdpPayloadSize: 1380   # 略低于实测 PMTU 1420，留余量
```

### 案例 B：晚高峰吞吐断崖式下跌，白天正常

**现象**：白天 Brutal 跑满 90Mbps，晚高峰掉到 20Mbps 以下，且 `ping` 显示 RTT 正常（200ms 左右），丢包率却冲到 25%。

**排查链**：
1. 服务端 `ss -u -a -n` 看 UDP 队列，发现 `Recv-Q` 持续堆积。
2. `sysctl net.core.rmem_max` 只有 212992（默认值），UDP 缓冲严重不足。
3. 抓包看 `udp errors`：`netstat -su | grep -i error`，发现 `receive buffer errors` 暴涨。
4. 结论：高丢包下重传包把 UDP 接收缓冲打满，内核直接丢包，形成“越丢越堵”的正反馈。
5. 修复：按 4.3 调大 `rmem_max/wmem_max` 到 16MB，`udp_mem` 同步调大。修复后晚高峰吞吐从 20Mbps 回到 55Mbps。

### 案例 C：Brutal 声明带宽后 CPU 打满，吞吐反降

**现象**：VPS 2C4G，声明下行 200Mbps 后，`top` 看 hysteria 进程 CPU 100%，实际吞吐只有 45Mbps。

**排查链**：
1. `perf top` 看热点，发现大量时间在 QUIC 重传和加密解密。
2. 结论：过度声明导致重传风暴，CPU 被重传吃光，有效吞吐反降。
3. 修复：声明带宽回落到 100Mbps（实测最优区间），CPU 降到 40%，吞吐回到 61Mbps。

## 六、本文专题核心疑难问答

**Q1：Brutal 声明带宽到底该按什么标准填？填错了会怎样？**

按“链路实际可用带宽”填，不是按 VPS 标称带宽，也不是按家宽套餐。实测最优是实际可用带宽的 0.9~1.1 倍。填高了会触发重传风暴，CPU 打满、吞吐反降（案例 C）；填低了浪费链路。晚高峰动态变化时，建议按 P50 时段的可用来填，宁可略保守。另外 `ignoreClientBandwidth: false` 必须开，让服务端尊重客户端声明，否则两端各说各话。

**Q2：为什么 Brutal 在移动 5G 上反而不如电信家宽？**

移动出口对 UDP 的 QoS 策略更激进，Brutal 的硬灌流会被限速打回原形，甚至触发更严格的限速。电信家宽出口对 UDP 相对宽容。这不是 Brutal 算法本身的问题，是链路策略问题。实测移动 5G 晚高峰 Brutal 31.8Mbps vs BBR 18.4Mbps，虽然 Brutal 仍胜，但优势远小于电信的 77%。如果目标用户以移动网络为主，建议 BBR 和 Brutal 双栈，按网络类型分流。

**Q3：Hysteria 2 的 QUIC 载荷和 MTU 到底怎么卡？**

先实测路径 PMTU：`ping -M do -s <size> -c 3 your.vps.ip`，从 1400 往上试，找到开始丢包的临界值。然后把 `maxUdpPayloadSize` 卡到临界值减 40（留 IPv6/额外头余量）。我们这条链路 PMTU 1420，卡 1380。4G 网络可能掉到 1380，卡 1340。不卡会出现“小文件正常、大文件卡死”的经典症状（案例 A）。

**Q4：晚高峰 BBR 吞吐塌陷比 Brutal 早 8~15 秒，这个“早”怎么理解？**

指在丢包率从 5% 爬升到 20% 的过程中，BBR 的 delivery rate 估计被丢包污染，pacing 变得保守，吞吐在丢包率约 12%~15% 时就开始明显下滑；Brutal 因为不理会丢包，吞吐能撑到丢包率 20% 以上才开始因重传过载而下降。这个“早”不是绝对时间，是丢包率阈值上的差异。实测 BBR 在 15% 丢包时吞吐已掉到峰值的 55%，Brutal 还有 78%。

**Q5：UDP 被运营商限速了怎么办？Brutal 还有救吗？**

先确认是否被限速：`iperf3 -u -b 50M -t 30` 直连 VPS 的 UDP 端口，看实际能跑多少。如果被限到 10Mbps 以下，Brutal 声明再高也没用，反而触发更严限速。此时方案：① 换端口（443 常被重点照顾，试 8443/自定义高位端口）；② 开 DSCP 标记（4.5 节，实测提升 5%~12%）；③ 降级到 BBR + TCP 443 伪装；④ 用 Hysteria2 的 salamander 混淆（`obfs: salamander`）降低被识别概率。没有银弹，只能组合拳。

**Q6：Brutal 和 BBR 能不能同时开？会不会打架？**

不能。Brutal 是 Hysteria2 应用层自己的拥塞控制，BBR 是内核 TCP 的拥塞控制，两者作用在不同层、不同协议上。Hysteria2 走 UDP，根本不经过内核 TCP 拥塞控制，所以“同时开”是个伪命题。真正要注意的是：如果服务端同时跑 TCP 回源和 Hysteria2 UDP，内核的 `fq` qdisc 和 BBR 参数会影响 TCP 部分，但不影响 Hysteria2 的 Brutal。别把两者混为一谈。

---

以上数据均来自我们生产链路的连续实测，参数和配置可直接复现。Brutal 不是万能药，它在“高丢包 + UDP 友好链路”下是利器，在“UDP 被重点限速”的链路上会翻车。选型前先测链路，别信标称带宽。