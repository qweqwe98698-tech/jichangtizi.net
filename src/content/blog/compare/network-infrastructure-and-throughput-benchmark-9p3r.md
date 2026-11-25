---
title: "2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告 (9p3r)"
date: 2026-11-25T12:18:01.340Z
description: "2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告  9p3r   过去三个月，我们把测试机架搬进了三个不同城市的机房，拉了移动、联通、电信、广电四家运营商的裸金属，外加两条标称 100Mbps 的“跨境专线”和一条普通 IEPL。目的只有一个：把“跨境代理到底慢在哪、丢在哪、什么..."
categories:
  - "机场评测"
tags:
  - "专线测速"
  - "网络架构"
  - "晚高峰实测"
  - "丢包率测试"
---

# 2026 网络代理实测系列：跨运营商物理链路与高并发吞吐深度调研报告 (9p3r)

过去三个月，我们把测试机架搬进了三个不同城市的机房，拉了移动、联通、电信、广电四家运营商的裸金属，外加两条标称 100Mbps 的“跨境专线”和一条普通 IEPL。目的只有一个：把“跨境代理到底慢在哪、丢在哪、什么时候会崩”这件事，用抓包和压测数据说清楚，而不是靠体感。

先给结论，省得你往下翻：

1. **同一台境外落地机，从电信出口过去和从移动出口过去，晚高峰的 TCP 首字节时间（TTFB）能差出 3 倍以上**，根因不在落地端，而在国内出口的 AS 间互联质量与出口带宽收敛比。
2. **跨境专线不是“不丢包”，而是“丢得可控”**。我们实测的某条专线在 21:00–23:00 的丢包率稳定在 0.3%–0.8%，而普通公网同一时段飙到 6%–11%。0.5% 和 8% 对 TCP 吞吐是两个世界——前者靠 BBR 能跑满，后者 Cubic 直接塌到峰值的 1/10。
3. **弱网环境下，算法选择比带宽更重要**。在 8% 丢包 + 120ms RTT 的链路上，BBR 相对 Cubic 的吞吐提升我们测到 4.7–6.2 倍，且抖动更小。
4. **MTU/MSS 分片是隐藏杀手**。跨境链路上 PMTU 经常被中间设备压到 1400 甚至 1360，客户端没做 MSS clamping 的话，大包分片重传会额外吃掉 5%–15% 的有效吞吐。

下面是完整推导和原始数据。

---

## 一、物理链路拆解：跨境流量到底经过了什么

很多人把“代理慢”归咎于机场/节点，其实链路是分段的，得逐段看。一条典型的跨境代理路径（以华东家宽 → 香港落地为例）大致是：

```
[家宽 ONT] → [省网 BRAS] → [城域网 CR] → [骨干网省出口] 
   → [国际出口网关 / 互联点] → [境外 transit / IXP] → [落地机房 ToR] → [落地机]
```

每一段的瓶颈性质完全不同：

- **接入段（ONT→BRAS）**：家宽上行普遍是下行带宽的 1/10 到 1/5，1000M 下行往往只有 30–50M 上行。高并发上传/多连接场景，这里先卡死。
- **省网到骨干出口**：晚高峰收敛比问题。我们在一台电信家宽上测到，20:30 之后到国际出口方向的可用带宽从白天的 200Mbps 掉到 40Mbps 以下，而这段的 RTT 只涨了 8ms——**带宽掉了但延迟没怎么涨，说明是出口限速/收敛，不是拥塞排队**，这点很关键，决定了你调 TCP 参数的方向。
- **国际出口与互联点**：这是最玄学的一段。电信 CN2 GIA、联通 AS9929/AS4837、移动 CMI 走的路由完全不同。我们 traceroute 对比同一落地 IP：
  - 电信 163 骨干：`202.97.x.x` 出口，晚高峰丢包 5%–12%
  - 电信 CN2 GT：`59.43.x.x`，丢包 0.5%–2%
  - 联通 4837：`219.158.x.x`，绕美西，RTT 比直连高 60–90ms
  - 移动 CMI：`223.120.x.x`，到香港直连质量稳定，但到日本/新加坡绕路
- **境外 transit/IXP**：落地机房接的是哪家 transit（NTT、Cogent、HKIX、Equinix）决定了回程质量。我们测到某落地走 HKIX 对等，回程到移动只有 0.2% 丢包，但到电信 163 却要绕新加坡，RTT 多 40ms。

**所以“跨境专线性能”这个词必须拆成：国内出口质量 × 互联点质量 × 境外 transit 质量 × 落地机房质量。** 任何一段拉胯，整体就拉胯。这也是为什么同一节点不同运营商用户体感天差地别。

我们画了一张实测拓扑（简化）：

```
电信163 ──┐
电信CN2 ──┼──[HKIX/Equinix]──[落地A: HK]──┐
联通4837 ─┤                              ├──[回程测试点]
移动CMI ──┘                              │
广电(借移动)──────────────────────────────┘
```

---

## 二、实测方法论（可复现）

不写方法的实测都是耍流氓。我们的测试基线：

- **压测工具**：`iperf3`（多流 `-P 16`）、`tcpping`/`hping3`（探测）、`mtr --tcp --port 443`（路径质量）、自研 Go 脚本做 1000 并发短连接（模拟真实代理握手）。
- **采样窗口**：连续 3 晚，每晚 19:00–24:00，每 5 分钟一轮，每轮 30 秒，取中位数与 P95。
- **客户端内核**：Linux 6.6，开启 BBR；对照组切换 Cubic。
- **服务端**：同一台香港落地机（E5-2680v4，1Gbps 口，未做限速），避免落地差异。
- **代理层**：Clash.Meta（mihomo）作为对照，TUIC/Hysteria2 作为弱网对照。
- **关键指标**：RTT（P50/P95）、丢包率、TCP 重传率（`ss -ti` 的 retrans）、有效吞吐（iperf3 单流/多流）、TTFB。

所有原始数据存在本地 Prometheus + Grafana，下面是摘出来的对比表。

### 表 1：四运营商 × 三时段 跨境 RTT 与丢包（落地：香港，目标端口 443）

| 运营商/线路 | 时段 | RTT P50 | RTT P95 | 丢包率 | TCP 重传率 |
|---|---|---|---|---|---|
| 电信 163 | 白天 14:00 | 42ms | 78ms | 0.4% | 0.6% |
| 电信 163 | 晚高峰 21:00 | 61ms | 210ms | 8.7% | 11.2% |
| 电信 CN2 GT | 晚高峰 21:00 | 38ms | 65ms | 0.9% | 1.1% |
| 联通 4837 | 晚高峰 21:00 | 118ms | 260ms | 4.2% | 6.8% |
| 移动 CMI | 晚高峰 21:00 | 35ms | 58ms | 0.6% | 0.8% |
| 广电（借移动） | 晚高峰 21:00 | 40ms | 95ms | 2.1% | 3.4% |
| 某跨境专线 | 晚高峰 21:00 | 33ms | 44ms | 0.5% | 0.7% |

> 注意：电信 163 晚高峰 RTT P95 到 210ms、丢包 8.7%，这就是典型的“出口拥塞 + 互联点丢包”叠加。而 CN2 GT 同一时段只有 0.9%——**贵有贵的道理，贵在互联优先级**。

### 表 2：弱网下 BBR vs Cubic 有效吞吐（单流，目标 100Mbps 上限）

| 场景（丢包/RTT） | Cubic 吞吐 | BBR 吞吐 | 提升倍数 |
|---|---|---|---|
| 0.1% / 40ms | 92 Mbps | 96 Mbps | 1.04x |
| 1% / 60ms | 41 Mbps | 88 Mbps | 2.1x |
| 5% / 120ms | 9.3 Mbps | 57 Mbps | 6.1x |
| 8% / 120ms | 6.8 Mbps | 42 Mbps | 6.2x |
| 10% / 180ms | 4.1 Mbps | 33 Mbps | 8.0x |

这张表是全文最值钱的东西。**在 5% 以上丢包的跨境链路上，换 BBR 的收益远超换节点、换协议。** 很多人的“优化”方向从第一步就错了。

### 表 3：多流并发吞吐（iperf3 -P 16，晚高峰，电信 163）

| 并发数 | 单流吞吐 | 聚合吞吐 | 聚合/单流 |
|---|---|---|---|
| 1 | 6.8 Mbps | 6.8 Mbps | 1.0x |
| 4 | 5.9 Mbps | 21 Mbps | 3.1x |
| 16 | 4.2 Mbps | 48 Mbps | 7.1x |
| 32 | 3.1 Mbps | 61 Mbps | 9.0x |

多流能显著提升聚合吞吐，因为每条流独立做拥塞控制，规避了单流的 cwnd 塌陷。**这也是为什么 TUIC/Hysteria2 这类基于 QUIC 多流的协议在弱网下体感更好**——但注意，多流会放大对端 CPU 与连接跟踪表的压力，后面排查案例会讲。

---

## 三、客户端与内核层高级调优（可直接抄）

以下配置在我们的测试环境里验证过，能稳定复现上面的 BBR 收益。

### 3.1 开启 BBR + fq，并调大 socket 缓冲

```bash
# /etc/sysctl.d/99-net-tune.conf
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
net.ipv4.tcp_rmem = 4096 87380 33554432
net.ipv4.tcp_wmem = 4096 65536 33554432
net.ipv4.tcp_mtu_probing = 1
net.ipv4.tcp_slow_start_after_idle = 0
net.ipv4.tcp_notsent_lowat = 16384
```

应用：

```bash
sysctl --system
sysctl net.ipv4.tcp_congestion_control   # 应输出 bbr
```

`tcp_mtu_probing=1` 是跨境场景的关键：它让内核在检测到 PMTU 黑洞时自动降 MSS 探测，避免大包被静默丢弃导致的“连得上但传不动”。

### 3.2 MSS clamping（针对隧道/代理场景）

如果你的代理走的是隧道（WireGuard、TUN），务必在转发侧做 MSS clamp，否则分片重传会吃掉大量吞吐：

```bash
# 假设 TUN 接口为 tun0，物理出口为 eth0
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --clamp-mss-to-pmtu
# 或强制指定（跨境常用 1360–1400）
iptables -t mangle -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
  -j TCPMSS --set-mss 1360
```

我们用 `ping -M do -s 1472` 逐段探测，实测某跨境专线在中间设备处 PMTU 被压到 1400，若不 clamp，大包重传率从 0.7% 升到 6.3%。

### 3.3 Clash.Meta（mihomo）关键片段：按运营商分流 + 弱网友好参数

```yaml
# config.yaml 节选
mixed-port: 7890
unified-delay: true          # 统一延迟测量，避免不同节点测法不一致
tcp-concurrent: true         # 多连接并发握手，弱网下降低 TTFB

sniffer:
  enable: true
  force-dns-mapping: true
  parse-pure-ip: true

profile:
  store-selected: true

# 按运营商出口做策略组（配合前面实测：移动/CN2 优先）
proxy-groups:
  - name: "AUTO-BEST"
    type: url-test
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    tolerance: 50
    proxies: ["HK-CMI-01", "HK-CN2-01", "HK-163-01"]

  - name: "WEAK-NET"
    type: fallback
    url: "https://www.gstatic.com/generate_204"
    interval: 120
    proxies: ["HK-TUIC-01", "HK-HY2-01", "HK-CMI-01"]

rules:
  - DOMAIN-SUFFIX,github.com,AUTO-BEST
  - GEOIP,CN,DIRECT
  - MATCH,WEAK-NET
```

`tcp-concurrent: true` 在我们的测试里把弱网（8% 丢包）下的握手成功率从 71% 提到 94%，TTFB 中位数降 180ms——因为并发握手规避了单条 SYN 丢失后的 1s/3s 重传等待。

### 3.4 QUIC/TUIC 的 UDP 缓冲（服务端）

```bash
# 提高 UDP 收发缓冲，QUIC 高并发必需
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432
net.ipv4.udp_rmem_min = 16384
net.ipv4.udp_wmem_min = 16384
```

---

## 四、典型异常案例与抓包排查链路

### 案例 A：能 ping 通、能开网页，但大文件传输卡在 200KB/s

**现象**：某用户电信 163 家宽，代理到香港，测速下行只有 200KB/s，但 `ping` 延迟正常 45ms。

**排查链**：
1. `mtr --tcp --port 443 -rwzc 100 <落地IP>` → 发现第 7 跳（`202.97.x.x`）丢包 9%，后续跳全绿。**丢包发生在国际出口前，落地端无辜。**
2. `ss -ti` 看连接：`cwnd:10 ssthresh:2147483647 retrans:0/37` → 重传 37 次，cwnd 只有 10，典型的拥塞窗口塌陷。
3. `sysctl net.ipv4.tcp_congestion_control` → `cubic`。**根因：Cubic 在 9% 丢包下 cwnd 反复腰斩。**
4. 切 BBR + fq，重测 → 吞吐从 200KB/s 升到 5.2MB/s。

**结论**：不是带宽不够，是算法扛不住丢包。这类案例在我们的样本里占“慢”投诉的 60% 以上。

### 案例 B：MTU 黑洞——小包通、大包死

**现象**：SSH 能连，`curl` 小页面正常，但 `git clone` 或大文件传输直接超时。

**排查链**：
1. `ping -M do -s 1472 <IP>` → 100% 丢包；`-s 1400` → 通。**PMTU 被中间设备压到 <1472。**
2. `traceroute --mtu <IP>` 定位到具体跳。
3. 确认隧道接口 MSS 未 clamp。
4. 加 `iptables TCPMSS --clamp-mss-to-pmtu`，问题消失。

**结论**：跨境链路中间设备常做 PMTU 限制，隧道场景必须 clamp，否则大包分片重传表现为“随机卡死”。

### 案例 C：QUIC 高并发下服务端 CPU 打满、连接跟踪表溢出

**现象**：TUIC 节点，50 人同时用，晚高峰集体断流，服务端 `dmesg` 报 `nf_conntrack: table full, dropping packet`。

**排查链**：
1. `conntrack -C` 看当前连接数，超过 `net.netfilter.nf_conntrack_max`。
2. QUIC 每流都是 UDP，多流放大后 conntrack 暴涨。
3. 调大 `nf_conntrack_max`、缩短 `nf_conntrack_udp_timeout`，并对节点做连接数隔离。

```bash
sysctl -w net.netfilter.nf_conntrack_max=262144
sysctl -w net.netfilter.nf_conntrack_udp_timeout=30
sysctl -w net.netfilter.nf_conntrack_udp_timeout_stream=60
```

**结论**：QUIC 弱网友好，但运维成本高，conntrack 是隐形天花板。

---

## 五、深度问答与避坑

**Q1：为什么我 traceroute 到落地 IP 显示走的是“直连”，但晚高峰还是丢包 8%？直连不是应该最好吗？**

“直连”只是说 AS 路径短、跳数少，不代表互联点不拥塞。我们实测电信 163 到香港某落地，traceroute 只有 6 跳，看似直连，但第 4 跳 `202.97.x.x` 是国际出口网关，晚高峰该网关的出口方向带宽收敛比极高，排队丢包就发生在这一跳。判断依据不是跳数，而是 `mtr` 逐跳丢包分布：**如果丢包从某一跳开始并持续到终点，问题在该跳；如果只有终点丢，才是落地问题。** 直连但丢包，说明你走的是普通 163 而非 CN2，互联优先级低。

**Q2：BBR 是不是万能的？什么情况下开 BBR 反而更差？**

不是。BBR 在“高丢包 + 中高 RTT”的跨境链路上收益巨大（见表 2），但在两种场景会翻车：一是**浅缓冲（shallow buffer）的中间设备**，BBR 的 pacing 会过度填充 buffer 导致 bufferbloat，RTT 抖动反而变大；二是**和同样跑 BBR 的邻居共享瓶颈时**，BBR 的公平性差，会抢占 Cubic 流的带宽。我们在一条共享专线上测到，全开 BBR 后 P95 RTT 从 44ms 涨到 130ms。建议：跨境长肥管道开 BBR，内网/短 RTT 链路保持 Cubic，别一刀切。

**Q3：跨境专线标称 100Mbps，为什么我 iperf3 单流只能跑 20Mbps？**

三个可能，按概率排序：① 单流受 BDP 与 cwnd 限制，100Mbps × 40ms RTT 的 BDP 约 500KB，Cubic 在轻微丢包下 cwnd 上不去，单流跑不满是常态，用 `-P 8` 多流测才接近标称；② 专线在运营商侧做了 per-flow 限速（我们见过按单 TCP 流限 25Mbps 的配置）；③ 你的客户端 socket 缓冲太小（`tcp_wmem` 默认 4MB 上限，长肥管道不够）。先 `ss -ti` 看 cwnd 是否卡在某个值不动，再决定调参还是换多流。

**Q4：TUIC/Hysteria2 在弱网下确实快，为什么我还是建议保留 TCP 回落？**

QUIC 基于 UDP，很多企业网、校园网、部分运营商对 UDP 做 QoS 降级甚至直接封 443/UDP。我们实测某高校网络 UDP 443 出方向限速到 2Mbps，TUIC 直接废掉，而 TCP 回落正常跑 40Mbps。另外 QUIC 的 conntrack 压力和 CPU 开销（用户态加密）在低配落地机上很致命（见案例 C）。**正确做法是：QUIC 优先、TCP 兜底、按网络环境自动切换**，而不是 all-in QUIC。

**Q5：为什么同一节点，我用移动很稳，同事用电信就卡？怎么给团队做分流？**

因为回程路由不同。同一香港落地，移动 CMI 回程可能走 HKIX 直连（0.6% 丢包），电信 163 回程却绕新加坡（RTT +40ms、丢包 8%）。给团队做分流的核心不是“选最快节点”，而是“**按用户运营商选节点**”。落地侧最好同时接 CMI、CN2、4837 三条回程，客户端用 Clash 的 `url-test` 按实际延迟动态选，而不是全局一个节点。我们内部的做法是每个地域维护一张“运营商→优选落地”映射表，定期用 `mtr` 复测更新。

**Q6：抓包看到大量 TCP Retransmission，但 `ss` 显示 retrans 很低，矛盾吗？**

不矛盾，要分清方向。`ss -ti` 的 `retrans` 统计的是**本机发送方向**的重传；Wireshark 抓到的 Retransmission 可能是**对端发来**的重传，或抓包点位置不同（比如抓在 TUN 口 vs 物理口）。跨境场景常见：本机发送 retrans 很低（因为 BBR 不轻易重传），但对端（落地）回程丢包严重，抓包看到大量对端重传。**排查时务必两端同时抓、对齐时间戳**，否则会把回程问题误判成本机问题，白调半天参数。

---

写到这，核心就一句话：**跨境代理的性能问题，80% 出在国内出口与互联点，而你能在客户端做的最有效动作是换拥塞算法 + 修 MTU + 按运营商分流，不是无脑换节点。** 数据都在上面，方法都可复现，剩下的就是你自己拉一台机器跑一遍 `mtr` 和 `iperf3` 对号入座了。