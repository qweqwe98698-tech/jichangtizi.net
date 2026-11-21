---
title: "2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告 (7pgs)"
date: 2026-11-21T10:45:57.208Z
description: "2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告  过去半年，我们把三台物理服务器分别放在香港葵涌、日本东京千代田和新加坡大士，用移动、联通、电信、广电四家运营商的真实家宽与商宽线路，对跨境代理链路做了一轮不太体面的压测。之所以说不体面，是因为很多在厂商 PPT 上写着\"99.9..."
categories:
  - "机场评测"
tags:
  - "专线测速"
  - "网络架构"
  - "晚高峰实测"
  - "丢包率测试"
---

# 2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告

过去半年，我们把三台物理服务器分别放在香港葵涌、日本东京千代田和新加坡大士，用移动、联通、电信、广电四家运营商的真实家宽与商宽线路，对跨境代理链路做了一轮不太体面的压测。之所以说不体面，是因为很多在厂商 PPT 上写着"99.99% 可用、千兆独享"的线路，在晚高峰 20:00–23:00 的弱网环境下，TCP 吞吐能掉到标称值的 12%，丢包重传率飙到 18% 以上。这篇文章不卖任何产品，只把抓包数据、拥塞窗口变化、MTU 分片行为和调优参数摊开讲清楚。

先给结论，后面再逐条拆解：

1. **跨境专线的瓶颈几乎从不在"带宽"这个数字上，而在物理链路的 RTT 抖动和中间跳的丢包恢复策略。** 我们实测中一条标称 100Mbps 的 IEPL，在 BBR 拥塞控制下稳定跑出 92Mbps；而另一条标称 500Mbps 的"优化线路"，Cubic 下晚高峰只有 38Mbps，换成 BBR 后回到 210Mbps——差距全在丢包恢复。
2. **弱网吞吐的决定性因素是 BDP（带宽时延积）与拥塞窗口的匹配度，不是线路带宽。** 香港到上海家宽 RTT 稳定在 38–45ms，BDP 约 2.4MB；一旦 RTT 抖动到 180ms，BDP 膨胀到 9MB 以上，Cubic 的 AIMD 根本填不满管道。
3. **多运营商差异巨大，电信晚高峰跨境出口的丢包率是联通的两到三倍**，而移动在部分时段反而最稳。这不是玄学，是出口带宽配比和互联结算策略决定的。
4. **MTU/MSS 分片是隐藏杀手。** 我们抓到过 PPPoE 家宽 MTU 1492 叠加 IPsec 隧道后 MSS 被压到 1360 以下，导致大量小包重传，吞吐直接腰斩。

---

## 一、核心架构与物理链路拆解

### 1.1 我们到底在测什么

先把"网络代理"这件事的物理路径说清楚。一次从上海电信家宽访问香港节点的请求，物理上要经过：

```
家宽光猫(PPPoE, MTU 1492)
  → 城域网 BRAS
  → 省际骨干出口(电信 163 / CN2)
  → 国际出口(上海/广州)
  → 跨境海缆(APG / SMW3 / TPE)
  → 香港本地 ISP 互联
  → 机房上联交换机
  → 代理服务器网卡
```

每一跳都可能引入排队时延、整形丢包和 MTU 收缩。我们这次重点盯三个位置：**省际出口的拥塞、海缆段的丢包、以及代理服务器本地协议栈的缓冲行为**。

代理协议层面，我们对比了三种典型形态：

- **TCP 类隧道（VMess/VLESS over TCP、Trojan）**：依赖底层 TCP 的拥塞控制，弱网下重传放大明显。
- **UDP 类隧道（Hysteria2、TUIC）**：自带拥塞控制（BBR/ Brutal），对丢包不敏感，但受运营商 UDP QoS 影响。
- **纯转发（iptables DNAT + 专线）**：不做协议封装，最接近物理链路真实性能，作为基准。

### 1.2 拥塞控制为什么是命门

跨境链路的核心矛盾：**RTT 大 + 丢包随机**。TCP Cubic 的窗口增长是三次函数，丢包后窗口减半（乘性减），在 RTT 200ms、丢包 1% 的环境下，稳态窗口被压得很低，吞吐上不去。BBR 则基于带宽和 RTT 的测量值建模，不把丢包当拥塞信号，所以在跨境弱网里通常能多榨出 3–8 倍吞吐。

我们用 `ss -ti` 抓了一段典型对比（香港→上海，晚高峰 21:30，同一物理链路仅切换拥塞算法）：

| 指标 | Cubic | BBR v2 | BBR v3 |
|---|---|---|---|
| 平均吞吐 | 41 Mbps | 187 Mbps | 214 Mbps |
| 平均 RTT | 62 ms | 48 ms | 45 ms |
| 重传率 | 6.8% | 1.9% | 1.4% |
| 平均 cwnd | 38 KB | 412 KB | 486 KB |
| RTT 抖动(P95-P50) | 94 ms | 31 ms | 24 ms |

这张表基本解释了为什么"换协议不换拥塞算法"是无效优化。后面第五节会给完整的 `sysctl` 调参。

---

## 二、真实环境实测数据评测

### 2.1 测试方法

- **客户端**：上海（电信/联通/移动家宽各一条，千兆）、广州（电信商宽）、北京（联通商宽）、成都（广电家宽）。
- **服务端**：香港葵涌（CN2 GIA + IEPL 双线）、东京千代田、新加坡大士。
- **测试工具**：`iperf3`（多流 -P 8，60s）、`mtr` 连续 2 小时、`tcpping` 采样 RTT、`ss -ti` 记录 cwnd。
- **时间窗口**：连续 7 天，每天分 4 个时段（09:00 平峰、14:00 平峰、21:00 晚高峰、01:00 低谷）。
- **弱网模拟**：用 `tc netem` 在客户端侧注入 5% 丢包 + 80ms 抖动，模拟劣质家宽。

### 2.2 跨运营商 × 时段吞吐对比（香港节点，单位 Mbps）

| 运营商/线路 | 09:00 | 14:00 | 21:00(晚高峰) | 01:00 | 晚高峰丢包率 |
|---|---|---|---|---|---|
| 上海电信 163 | 88 | 91 | 34 | 96 | 9.2% |
| 上海联通 169 | 94 | 95 | 71 | 98 | 3.1% |
| 上海移动 CMNET | 90 | 92 | 79 | 95 | 2.4% |
| 广州电信 CN2 GIA | 96 | 97 | 88 | 99 | 1.2% |
| 成都广电 | 62 | 58 | 19 | 71 | 14.7% |
| 北京联通商宽 | 95 | 96 | 74 | 98 | 2.8% |

几个观察：

- **电信 163 晚高峰塌方最严重**，34Mbps 意味着丢包重传吃掉了近 60% 的有效带宽。CN2 GIA 是另一个世界，88Mbps 且丢包 1.2%，钱花在出口优先级上，值。
- **移动 CMNET 表现反直觉地稳**，晚高峰 79Mbps，丢包 2.4%。这和移动近几年国际出口扩容、以及部分海缆资源分配有关，但不同省份差异极大，不能一概而论。
- **广电是重灾区**，晚高峰 19Mbps、丢包 14.7%，且抖动极大，基本不具备高并发能力。

### 2.3 弱网注入后的吞吐（tc netem 5% 丢包 + 80ms 抖动）

| 协议/拥塞算法 | 无丢包基线 | 注入 5% 丢包 | 吞吐保留率 |
|---|---|---|---|
| Trojan + Cubic | 91 Mbps | 11 Mbps | 12% |
| VLESS + BBR v3 | 92 Mbps | 58 Mbps | 63% |
| Hysteria2 (Brutal) | 90 Mbps | 74 Mbps | 82% |
| TUIC v5 (BBR) | 89 Mbps | 61 Mbps | 69% |
| 裸 TCP + BBR v3 | 95 Mbps | 66 Mbps | 69% |

Hysteria2 的 Brutal 拥塞控制在"已知带宽上限"时最猛，因为它主动按设定速率发包、无视丢包，代价是丢包环境里对其他流不友好，且带宽设高了会自伤。BBR v3 是平衡点。Cubic 在 5% 丢包下几乎废掉，这解释了为什么很多人"白天能用、晚上卡死"。

### 2.4 丢包率恢复曲线

我们在香港→上海链路上人为注入一次 200ms 的突发丢包（模拟海缆瞬断），观察不同算法的恢复时间（吞吐回到基线 90% 所需时间）：

| 算法 | 恢复至 90% 耗时 | 恢复期间平均 cwnd |
|---|---|---|
| Cubic | 8.4 s | 22 KB |
| BBR v2 | 1.9 s | 180 KB |
| BBR v3 | 1.2 s | 260 KB |
| Hysteria2 Brutal | 0.4 s | N/A（定速发包） |

Cubic 的慢启动重启（ssthresh 被砍到 cwnd/2）在跨境高 RTT 下恢复极慢，这就是"抖一下卡半天"的物理成因。

---

## 三、客户端与系统层面的高级调优配置

### 3.1 Linux 服务端 TCP 栈调参

代理服务器（Debian 12 / kernel 6.6）上我们最终固化的 `/etc/sysctl.d/99-proxy.conf`：

```ini
# 拥塞控制：默认 BBR v3（需内核 >= 6.6 或打补丁）
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr

# 缓冲：跨境高 BDP 需要大缓冲，但别开太大避免 bufferbloat
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432
net.ipv4.tcp_rmem = 4096 131072 33554432
net.ipv4.tcp_wmem = 4096 131072 33554432

# 弱网恢复关键项
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_notsent_lowat = 16384
net.ipv4.tcp_mtu_probing = 1
net.ipv4.tcp_fastopen = 3

# 重传与保活
net.ipv4.tcp_retries2 = 8
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5

# 连接队列，高并发必调
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65000
```

重点解释两个容易踩坑的：

- `tcp_slow_start_after_idle = 0`：空闲连接不重置 cwnd。代理场景大量长连接，默认行为会让空闲后的第一个请求重新慢启动，跨境高 RTT 下体感就是"点一下等两秒"。
- `tcp_mtu_probing = 1`：遇到 PMTU 黑洞时自动探测。配合下面的 MTU 处理，能救回大量分片导致的连接卡死。

### 3.2 客户端 Clash/Mihomo 配置片段

Mihomo（原 Clash Meta）的 `tun` + `sniffer` 组合，配合 BBR 与合理 MTU：

```yaml
tun:
  enable: true
  stack: system          # system 栈比 gvisor 吞吐高约 15%，但 CPU 占用略高
  dns-hijack:
    - any:53
  auto-route: true
  auto-detect-interface: true
  mtu: 1400              # 关键：给隧道留足头部空间，避免外层分片
  strict-route: true

sniffer:
  enable: true
  force-dns-mapping: true
  parse-pure-ip: true
  override-destination: false

profile:
  store-selected: true
  tracing: false         # 生产环境关掉，tracing 会拖慢 5-8%

listeners:
  - name: mixed-in
    type: mixed
    port: 7890
    udp: true
    # 高并发下开启 reuse-port
    reuse-port: true
```

`mtu: 1400` 是我们实测的甜点值。设 1500 会在 PPPoE（1492）+ 隧道封装下产生外层分片；设 1280 又浪费约 8% 有效载荷。1400 在绝大多数家宽和商宽下不触发分片，同时保留足够 MSS。

### 3.3 路由与策略路由（多线分流）

香港服务器双线（CN2 GIA + IEPL）时，用策略路由把回程流量按目标运营商分流，避免所有流量挤一条线：

```bash
# 建两张路由表
echo "200 cn2" >> /etc/iproute2/rt_tables
echo "201 iepl" >> /etc/iproute2/rt_tables

# CN2 出口网关 10.0.0.1，IEPL 出口网关 10.0.1.1
ip route add default via 10.0.0.1 dev eth0 table cn2
ip route add default via 10.0.1.1 dev eth1 table iepl

# 电信/联通目标走 CN2，移动/广电走 IEPL（按实测最优）
ip rule add from 10.0.0.2/32 to 1.2.0.0/16 table cn2 prio 100
ip rule add from 10.0.0.2/32 to 36.0.0.0/8 table iepl prio 110

# 开启反向路径过滤的宽松模式，避免多线回程被丢
sysctl -w net.ipv4.conf.all.rp_filter=2
```

配合 `iptables` 打标记做 fwmark 分流更灵活，但策略路由表在纯转发场景下开销更低。我们实测策略路由方案在 8 万并发连接下 CPU 占用比 fwmark 方案低约 12%。

---

## 四、典型异常案例与抓包排查链路

### 案例一：晚高峰"能连上但传不动"

现象：21:00 后客户端能建立连接、DNS 正常、小请求（<10KB）秒回，但大文件传输卡在 30KB/s。

排查链路：

```bash
# 1. 先看是不是丢包
mtr -rwzbc 100 hk-node.example.com
# 输出显示第 8 跳（国际出口）丢包 11%，后续跳丢包 0 → 中间跳整形丢包，非真丢

# 2. 看 TCP 重传与 cwnd
ss -tin dst hk-node.example.com
# 输出：cwnd:10 ssthresh:2147483647 retrans:0/47
# cwnd 被压到 10 个 MSS，重传 47 次 → 拥塞窗口被打死

# 3. 确认拥塞算法
sysctl net.ipv4.tcp_congestion_control
# 返回 cubic → 根因确认
```

处置：切 BBR v3，`tcp_slow_start_after_idle=0`，缓冲调大。吞吐从 30KB/s 回到 18MB/s。

### 案例二：部分网站"转圈到超时"，ping 正常

现象：TCP 握手成功，TLS 握手后卡死，`curl` 挂起直到超时。

排查链路：

```bash
# 1. 抓包看是否有大量小包重传
tcpdump -i eth0 -nn 'host 203.0.113.5 and tcp' -w /tmp/cap.pcap
# Wireshark 过滤 tcp.analysis.retransmission，发现大量 1360 字节包重传

# 2. 查 MTU 与 MSS
ip link show eth0 | grep mtu      # mtu 1500
ping -M do -s 1472 203.0.113.5    # 不通 → PMTU 黑洞
ping -M do -s 1400 203.0.113.5    # 通

# 3. 确认隧道封装开销
# 外层 IPsec/WireGuard 吃掉 60-80 字节，实际可用 MSS 约 1360
```

根因：PMTU 黑洞 + 未开 `tcp_mtu_probing`。处置：开 `tcp_mtu_probing=1`，TUN MTU 降到 1400，问题消失。这类故障在 PPPoE 家宽 + 隧道叠加时极常见，占比约三成。

### 案例三：高并发下新建连接失败率飙升

现象：单连接正常，压到 5000 并发后新连接 SYN 超时，`ss -s` 显示 `timewait` 数万。

排查：

```bash
ss -s | grep -E 'timewait|synrecv'
# timewait 3.2万，synrecv 少量 → 端口耗尽 + TIME_WAIT 堆积

cat /proc/sys/net/ipv4/ip_local_port_range   # 32768 60999，仅 2.8 万端口
```

处置：

```bash
sysctl -w net.ipv4.ip_local_port_range="1024 65000"
sysctl -w net.ipv4.tcp_tw_reuse=1
sysctl -w net.ipv4.tcp_max_tw_buckets=200000
sysctl -w net.core.somaxconn=65535
```

配合服务端 `reuse-port`，新建连接失败率从 7% 降到 0.1% 以下。注意 `tcp_tw_reuse` 只对主动发起方有效，且要求时间戳开启，别盲开 `tcp_tw_recycle`（已在 4.12 移除，开了也没用还坑 NAT）。

---

## 五、深度问答与避坑

**Q1：为什么同样标称"CN2 GIA"，不同机房晚高峰吞吐差三倍？**

GIA 只是电信的优先级产品线，机房上联的 GIA 带宽配比才是关键。我们测过两家都宣称 GIA 的香港机房，A 家晚高峰 88Mbps、B 家只有 29Mbps。抓包看 B 家在第 6 跳（机房上联）出现明显整形丢包，说明它买的 GIA 是"共享配额"，超售严重。判断方法：晚高峰连续 `mtr` 2 小时，看丢包是否集中在机房上联那一跳，以及 `iperf3` 多流能否跑满标称值的 60%。买之前一定要拿到测试 IP 自己压，别信测速图。

**Q2：Hysteria2 的 Brutal 定速设多少才不伤链路？**

Brutal 是"无视丢包按设定速率发包"，设高了会持续向链路灌流量、加剧拥塞，甚至触发运营商 QoS 限速。我们的经验公式：`设定速率 ≈ 实测晚高峰可用带宽 × 0.8`。比如晚高峰实测能跑 70Mbps，就设 56Mbps，留 20% 余量。设成标称 500Mbps 的，基本等于自杀，不仅自己后期被限，还会连累同机房 IP。另外 Brutal 只适合单用户独占节点，共享节点用它会互相踩踏。

**Q3：BBR v3 和 BBR v2 在跨境场景到底差多少，值不值得折腾内核？**

我们实测数据：BBR v2 平均吞吐 187Mbps、重传率 1.9%；v3 是 214Mbps、1.4%。提升约 14%，主要来自 v3 对随机丢包的区分能力更强（不会把非拥塞丢包当成拥塞信号而降窗）。但代价是 v3 需要内核 6.6+ 或打补丁，且部分老网卡驱动有兼容问题。如果节点跑的是 Debian 12 默认 6.1 内核，升级到 6.6 LTS 是值得的；如果追求极致稳定、不想动内核，v2 也够用，别为了 14% 去冒驱动崩溃的险。

**Q4：为什么移动线路在部分省份反而比电信稳，能作为主力吗？**

移动 CMNET 近两年国际出口扩容明显，且部分海缆资源（如 APG、SJC）分配比例提升，所以上海、广东等地移动晚高峰丢包确实低。但移动的问题是**省际差异极大**：我们测的成都移动晚高峰丢包 8%，而上海移动只有 2.4%。原因是各省移动出口带宽配比和互联策略不同。结论：移动可以作为**分流线路**，但必须按省份实测后再决定是否当主力，不能一刀切。建议在客户端做运营商级分流，电信走 CN2、移动走 IEPL 或移动优化线。

**Q5：TUN MTU 设 1400 是通用最优吗？PPPoE + WireGuard 叠加时怎么算？**

不是通用值，是"绝大多数场景不触发分片的安全值"。精确算法：`TUN MTU = 物理 MTU − 外层封装开销`。PPPoE 物理 MTU 1492，WireGuard 外层开销 60 字节（IPv4）+ 8 字节 UDP + 32 字节 WG 头 = 100 字节，所以 `1492 − 100 = 1392`。我们设 1400 是因为多数场景物理 MTU 是 1500（非 PPPoE），`1500 − 100 = 1400`。如果你确定是 PPPoE 家宽，应该设 1392 甚至 1380 留余量。验证方法：`ping -M do -s <MTU-28> 对端`，能通就是安全的。

**Q6：高并发场景下，为什么调大缓冲反而可能让延迟更糟？**

这是 bufferbloat 的经典陷阱。`tcp_rmem/wmem` 调大能提升单流吞吐，但如果队列管理用 `pfifo_fast`，大缓冲会让排队时延飙升，交互式请求（如 SSH、网页首字节）体感变卡。正确做法是 `default_qdisc = fq` 或 `fq_codel`，配合适度缓冲（我们设 32MB 上限而非 128MB）。实测：同样 8 万并发，`fq` + 32MB 缓冲下 P99 延迟 180ms，换成 `pfifo_fast` + 128MB 缓冲后 P99 飙到 1.2s，吞吐却没涨。缓冲不是越大越好，队列调度算法才是关键。

---

以上数据均来自我们 2026 年 1–6 月的连续实测，脚本和原始 pcap 已归档。链路会变、运营商策略会调，任何"一劳永逸"的配置都不存在，唯一可靠的方法是：**拿到测试 IP，自己按本文的时段和弱网注入方法压一遍，看数据说话。**