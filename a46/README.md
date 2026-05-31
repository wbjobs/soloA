# 网络流量协议分析器

一个基于 Tauri（Rust + React）构建的本地网络流量协议分析器，功能类似简化版 Wireshark。

## 功能特性

### 网络抓包
- 网卡接口选择（支持 WinPcap/Npcap 和 libpcap）
- 开始/停止抓包
- 混杂模式切换
- BPF（Berkeley Packet Filter）表达式过滤

### 协议解析
- **链路层**: Ethernet II
- **网络层**: IPv4、IPv6、ARP、ICMP
- **传输层**: TCP、UDP
- **应用层**: HTTP/1.1、DNS

### 界面展示
- **包列表面板**: 实时显示捕获的数据包列表
- **协议解析树**: 分层显示每个字段的原始值和解析值
- **十六进制数据**: 原始数据包的十六进制转储
- **协议分布饼图**: ECharts 协议统计饼图
- **流量时序图**: 实时流量监控折线图
- **Top Talkers**: 按包数统计的通信主机柱状图

### 数据包过滤
- 按协议过滤（IP、TCP、UDP、HTTP、DNS 等）
- 按源/目的 IP 过滤
- 按源/目的端口过滤
- 按信息字段搜索

### 存储
- SQLite 存储捕获会话和包元数据
- 内存数据库（可扩展为文件数据库）

### TCP 流重组
- 将同一四元组的 TCP 段按序列号重组
- 区分客户端和服务器方向数据

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **构建工具**: Vite 5
- **图表库**: ECharts (echarts-for-react)
- **样式**: 纯 CSS 暗色主题

### 后端
- **语言**: Rust
- **框架**: Tauri 1.5
- **抓包库**: pcap (libpcap/Npcap 绑定)
- **数据库**: rusqlite (bundled SQLite)
- **序列化**: serde + serde_json
- **并发**: parking_lot + once_cell

## 项目结构

```
a46/
├── src/                          # React 前端
│   ├── components/               # UI 组件
│   │   ├── Toolbar.tsx           # 工具栏（网卡选择、开始/停止）
│   │   ├── FilterBar.tsx         # 过滤栏
│   │   ├── PacketList.tsx        # 包列表
│   │   ├── ProtocolTree.tsx      # 协议解析树
│   │   ├── HexDump.tsx           # 十六进制转储
│   │   └── Charts.tsx            # ECharts 图表
│   ├── App.tsx                   # 主应用组件
│   ├── main.tsx                  # 入口文件
│   ├── types.ts                  # TypeScript 类型定义
│   ├── tauriApi.ts               # Tauri API 封装
│   └── styles.css                # 全局样式
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── types.rs              # Rust 类型定义
│   │   ├── errors.rs             # 错误定义
│   │   ├── parser.rs             # 协议解析引擎
│   │   ├── capture.rs            # 网络抓包管理
│   │   ├── database.rs           # SQLite 存储
│   │   ├── lib.rs                # Tauri commands
│   │   └── main.rs               # 入口
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/                    # 应用图标
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 前置要求

### 系统依赖
- **Windows**: 安装 Npcap（推荐）或 WinPcap
  - 下载: https://npcap.com/
  - 安装时勾选 "Install Npcap in WinPcap API-compatible Mode"
- **Linux**: 安装 libpcap-dev
  ```bash
  sudo apt-get install libpcap-dev
  ```
- **macOS**: 安装 libpcap（通常已预装）

### Rust 工具链
```bash
rustup install stable
rustup default stable
```

### Node.js
- Node.js 18+
- npm 9+

## 安装与运行

### 1. 安装依赖
```bash
# 安装前端依赖
npm install
```

### 2. 开发模式
```bash
# 使用管理员/root 权限运行（抓包需要特权）
npm run tauri dev
```

**注意**: 抓包操作需要管理员权限：
- **Windows**: 以管理员身份运行终端
- **Linux/macOS**: 使用 `sudo npm run tauri dev`

### 3. 构建生产版本
```bash
npm run tauri build
```

## 使用说明

### 开始抓包
1. 启动应用
2. 在工具栏的下拉菜单中选择网卡接口
3. （可选）勾选"混杂模式"以捕获所有经过网卡的数据包
4. （可选）在 BPF 过滤框中输入过滤表达式，例如：
   - `tcp port 80` - 只捕获 HTTP 流量
   - `host 192.168.1.1` - 只捕获与指定主机的通信
   - `tcp port 80 and host 192.168.1.1` - 组合条件
5. 点击"开始"按钮开始抓包

### 查看数据包
- **包列表**: 显示捕获的所有数据包，点击选择
- **协议解析树**: 左侧显示分层协议解析结果，可展开查看各字段
- **十六进制数据**: 右侧显示原始数据包的十六进制和 ASCII 表示

### 过滤数据包
使用过滤栏快速筛选：
- 按协议：选择 TCP/UDP/HTTP/DNS 等
- 按 IP：输入源/目的 IP 地址
- 按端口：输入源/目的端口
- 搜索：在信息字段中搜索关键字

### 查看统计
底部三个图表面板：
- **流量时序图**: 每秒流量变化趋势
- **协议分布**: 各协议占比饼图
- **Top Talkers**: 通信最活跃的主机

## BPF 过滤器语法

常用表达式示例：

```
# 只捕获 TCP 流量
tcp

# 只捕获 UDP 流量
udp

# 指定端口
tcp port 80
udp port 53
port 443

# 指定 IP 地址
host 192.168.1.1
src host 192.168.1.1
dst host 192.168.1.1

# 网络范围
net 192.168.1.0/24

# 组合条件
tcp port 80 and host 192.168.1.1
port 80 or port 443
not port 22

# ICMP
icmp
icmp[0] == 8  # 仅 echo 请求
```

## 支持的协议

| 协议层 | 支持的协议 |
|--------|-----------|
| 数据链路层 | Ethernet II |
| 网络层 | IPv4, IPv6, ARP, ICMP |
| 传输层 | TCP, UDP |
| 应用层 | HTTP/1.1, DNS |

## 常见问题

### Q: 为什么启动后找不到网卡？
A: 确保已安装 Npcap（Windows）或 libpcap（Linux/macOS）。Windows 上需要重启系统使 Npcap 生效。

### Q: 为什么抓不到包？
A: 
1. 检查是否以管理员/root 权限运行
2. 确认网卡处于活动状态
3. 尝试勾选"混杂模式"
4. 检查是否有防火墙阻止

### Q: BPF 过滤器不起作用？
A: BPF 过滤器必须在抓包开始前设置，开始后无法动态修改。

## 开发说明

### 添加新协议解析
在 `src-tauri/src/parser.rs` 中：
1. 添加协议数据结构
2. 实现 `parse_xxx()` 函数
3. 在 `parse_packet()` 中调用
4. 添加 `build_xxx_node()` 用于协议树显示

### 修改界面
前端代码在 `src/` 目录下，React 组件热更新实时生效。

## License

MIT
