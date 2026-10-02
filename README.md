# 糖心图谱

糖心图谱是一个面向 `tangxinvlog.app` 的目录分析与视频归档工具。它会读取站点公开的 HTML 页面，展示站点路由、首页栏目、演员云和标签云，并支持按演员、标签或搜索结果归档作品，生成按演员编号整理的 `m3u8` 播放列表目录。

> [!WARNING]
> 本项目依赖目标站点和媒体 CDN 的网络可达性，使用时需搭配中国大陆以外的网络环境。项目不提供代理、翻墙或绕过访问控制的功能；请遵守所在地法律法规、服务条款、版权和隐私要求，只处理你有权访问、保存和使用的公开内容。

网页端还可以调用本机 Chrome，把单个 HLS 作品交给已安装的猫抓 M3U8 解析器；也可以由项目自身并发下载、解密和排序 HLS 分片，再调用本机 `ffmpeg` 以 `-c copy` 无损转封装为可播放的 `mp4`，默认保存到 `C:\Users\Public\Videos\Tangxin\<演员>`。常用流程不再需要手动打开 Python 终端。

项目同时提供：

- 基于 React、TanStack Start 和 Vite 的网页操作界面
- Windows 双击启动脚本
- 可单独运行的 Python 命令行爬取脚本
- 默认 8 路分片并发下载，并使用 `ffmpeg` 无损转封装生成本地 `mp4`

> **合规提示**：请只在你拥有授权或明确允许的范围内使用本项目。使用前请遵守内容来源的服务条款、版权和隐私要求，合理控制请求频率，不要绕过访问控制，也不要未经授权下载、传播或公开存储受限制内容。内容源可能包含成人或其他受年龄限制的内容，请遵守所在地法律法规。

## 功能概览

### 结构

- 查看站点主要路由和页面结构
- 查看首页栏目及部分作品卡片
- 查看演员云、标签云和作品数量
- 查看封面、HLS 播放列表、密钥和分片的 URL 约定

### 设置与关于

- 在“设置”中自定义网页端 MP4 的保存目录，并在本机持久保存配置
- 在“关于”中查看项目实现方式、MP4 下载链路和技术栈

### 爬取

- 按演员名称或 slug 筛选演员
- 一键选择作品数最多的前 3 位或前 8 位演员
- 设置每位演员最多抓取的页数
- 逐页显示抓取进度和结果日志
- 自动去重视频 ID

### 发现与归档

- 按标签分页读取作品，并支持一次选择多个分页结果
- 使用源站 Pagefind 索引搜索标题、演员或其他关键词
- 对标签结果或搜索结果勾选后，直接加入现有演员目录并批量下载 MP4
- 归档时沿用已有演员编号，新作品从下一个可用编号开始，避免覆盖目录结构
- 标签和搜索归档复用同一套下载进度、并发分片、ffmpeg 转封装和自定义保存目录

### 结果

- 按演员生成 `1.m3u8`、`2.m3u8` 等编号文件名
- 下载 `catalog.txt` 文本目录
- 下载 `catalog.json` 结构化目录
- 单独下载某个作品的改写后 HLS 播放列表
- 单独打开 Chrome 猫抓 M3U8 解析器，并自动带入作品地址、标题、演员编号和 Referer
- 检测本机 `ffmpeg` 是否可用
- 单个下载 MP4、下载某位演员的全部 MP4，或下载当前结果的全部 MP4
- 网页端默认 8 路并发下载 HLS 分片，支持 AES-128 解密；复杂播放列表自动回退到 ffmpeg 兼容模式
- 按演员自动创建子文件夹并保存完整 MP4
- 显示按视频完成数统计的 MP4 进度条、正在下载列表、排队/完成/失败状态，并可清除已完成记录

### 脚本

- 在网页中查看 `public/tangxin_crawl.py`
- 下载 Python 脚本到本地
- 查看 Windows、Python 和 `ffmpeg` 的准备步骤

## 快速开始

### 环境要求

- Node.js 20 或更高版本
- npm
- 可访问项目配置的内容源站点

Python 只在使用独立 CLI 脚本时需要。网页端的 MP4 功能会优先使用项目依赖中的 Windows `ffmpeg`；也支持使用系统 PATH 中的 `ffmpeg` 或 `FFMPEG_PATH` 指定的路径。分片并发数默认为 8，可在启动前通过 `TX_HLS_CONCURRENCY` 调整为 1–16；并发越高不一定越快，通常建议保持 8。

### 安装依赖

在项目根目录执行：

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

开发服务器默认监听 `0.0.0.0:8080`，本机可访问：

```text
http://localhost:8080/
```

### Windows 一键启动

在 Windows 中双击项目根目录的 `start.bat` 即可：

1. 检查 Node.js 是否已安装
2. 首次运行时自动执行 `npm install`
3. 构建并启动本地桌面服务
4. 自动打开独立的“糖心图谱”图形化窗口，不需要手动打开浏览器

黑色命令窗口需要保持打开。关闭它会同时停止桌面程序的本地服务。

### Windows 独立封装版

如果不希望安装 Node.js 或通过 `start.bat` 启动，可在开发机执行：

```bash
npm run desktop:package
```

生成的便携版程序位于：

```text
release\Tangxin-0.3.4-x64-portable.exe
```

把这个 `.exe` 复制到 Windows 电脑后直接双击即可打开图形化窗口。它会在程序内部启动本地服务，爬取、MP4 并发下载、按演员归档等功能保持不变；不需要另外安装 Node.js，也不需要先打开 Chrome。

如果需要正式安装到 Windows，可以执行：

```bash
npm run desktop:installer
```

生成的安装包位于：

```text
release\Tangxin-0.3.4-Setup-x64.exe
```

安装包支持选择安装目录，并默认创建开始菜单和桌面快捷方式。安装后的程序包含本地服务和 `ffmpeg`，目标电脑不需要另装 Node.js；卸载时默认不会删除用户数据目录。安装包和便携版使用同一套完整功能，区别只是安装方式不同。

已经构建好的 Windows x64 安装版和便携版（包括历史版本）统一放在 [GitHub Releases](https://github.com/chenhanzhang214/tangxin-spider/releases)。下载和使用这些程序时，同样需要搭配中国大陆以外的网络环境，并遵守适用的法律法规、服务条款、版权和隐私要求。

各版本的功能变化、修复内容及升级说明见 [更新日志](CHANGELOG.md)。

“猫抓解析”仍是例外：只有点击该按钮时，程序才会调用电脑上已安装的 Chrome 猫抓扩展；MP4 下载不依赖 Chrome。

开发机也可以用下面的命令直接验证桌面窗口：

```bash
npm run desktop:dev
```

## 网页端使用

### 1. 结构

打开程序后默认进入“概览”页。这里可以查看站点路由、媒体 URL 约定、首页栏目以及演员/标签统计。左侧导航还提供“爬取”“发现”“归档”“工具”“设置”和“关于”工作区。

### 2. 爬取

1. 切换到“爬取”。
2. 搜索并选择一个或多个演员，也可以使用“选前 3”或“选前 8”。
3. 设置每位演员最多抓取的页数。
4. 点击“开始爬取”。
5. 任务结束后，页面会自动切换到“归档”。

页面会在每页请求之间加入短暂间隔，并且每个视频只保留一个视频 ID，减少重复请求和重复归档。

### 3. 发现

“发现”页提供两条归档入口：

- 在“标签归档”中选择标签，设置要读取的页数，读取后勾选作品。
- 在“搜索作品”中输入标题、演员或关键词，使用源站 Pagefind 索引检索并勾选结果。

点击“归档并下载 MP4”后，程序会按作品所属演员合并到现有目录，继续使用下一个可用编号，并把任务送入与“归档”页相同的 MP4 队列。这样标签或搜索结果不会覆盖已有文件，也不需要先手动建立演员文件夹。

### 4. 归档

结果页可以：

- 下载完整的 `catalog.txt`
- 下载完整的 `catalog.json`
- 查看每位演员的作品数量和源站数量
- 为单个作品下载改写后的播放列表
- 点击作品右侧的“猫抓解析”，由本机 Chrome 打开 `chrome-extension://jfedfbgedapdagkghmgibemcoggfppbb/m3u8.html`，并带入该作品的 HLS 地址、Referer、标题和演员编号
- 查看 `ffmpeg` 状态。状态可用后，点击作品右侧的 `MP4`，或点击“此演员 MP4”“全部下载 MP4”。
- 结果页会显示 MP4 综合进度和任务列表；每个作品都有独立百分比，并显示 HLS 分片数量、合并、ffmpeg 转封装与完整性检查阶段，可随时清除已完成或失败记录。
- 网页端会先以默认 8 路并发下载分片，处理 AES-128 解密并按播放顺序合并；随后使用 `-c copy` 转封装，不重新编码，也不降低画质。
- 程序会检查完整 MP4 后再保存到“设置”页指定目录下的 `<演员>\<视频标题>.mp4`；标题会按 Windows 文件名规则清理，失败时清理临时文件，不依赖浏览器默认下载目录。

猫抓解析器和本机 MP4 是两个独立通道：猫抓由 Chrome 扩展负责解析、重试和浏览器下载；本机 MP4 使用项目内置的并发分片流程，并在遇到 `BYTERANGE`、fMP4、分片不连续或不支持的加密方式时自动回退到 ffmpeg 直读兼容模式。演员编号会作为 `演员名/编号` 传给猫抓，但猫抓最终根目录仍遵循 Chrome 下载设置。若必须固定保存到 `C:\Users\Public\Videos\Tangxin\<演员>`，请使用旁边的本机 `MP4` 按钮。

### 5. 工具与设置

“工具”页提供 Python CLI 的下载入口和常用命令示例。“设置”页可以填写绝对路径，例如 `E:\Videos\spider`，保存后对之后的单个和批量 MP4 下载生效；程序仍会自动创建演员子文件夹。设置只改变新任务的保存位置，不会搬移已经下载的文件。

“关于”页集中说明 Electron、演员目录抓取、HLS 分片并发、ffmpeg 转封装和文件校验等实现细节。

## Python 命令行脚本

脚本位置：

```text
public/tangxin_crawl.py
```

### 安装 Python

建议使用 Python 3.11 或更高版本，并确认以下命令可以正常执行：

```bash
python --version
```

### 基本用法

抓取作品数最多的前 3 位演员，每位最多抓取 2 页：

```bash
python tangxin_crawl.py --top 3 --max-pages 2
```

指定演员：

```bash
python tangxin_crawl.py --actors 演员slug1 演员slug2 --max-pages 1
```

指定输出目录：

```bash
python tangxin_crawl.py --top 3 --out D:\tx-out
```

调整请求间隔：

```bash
python tangxin_crawl.py --top 3 --delay 0.8
```

### 导出 MP4

`--mp4` 会调用本机的 `ffmpeg`，将 HLS 播放列表转封装为可播放的 MP4，默认不重新编码，并按演员写入 `C:\Users\Public\Videos\Tangxin`。独立 Python CLI 目前仍采用 ffmpeg 直读兼容流程；上述 8 路分片并发优化用于网页端本机 MP4：

```bash
python tangxin_crawl.py --top 3 --max-pages 2 --mp4
```

确认 `ffmpeg` 已加入 PATH：

```bash
ffmpeg -version
```

Windows 可使用以下方式之一安装 `ffmpeg`：

```powershell
winget install Gyan.FFmpeg
```

或者从可信来源下载并将 `ffmpeg.exe` 所在的 `bin` 目录加入系统 PATH。

### 完整参数

| 参数          | 默认值                      | 说明                                |
| ------------- | --------------------------- | ----------------------------------- |
| `--out`       | `C:\Users\Public\Videos\Tangxin` | 输出目录，可覆盖默认位置            |
| `--actors`    | 未指定                      | 指定一个或多个演员 slug             |
| `--top`       | `3`                         | 未指定 `--actors` 时抓取前 N 位演员 |
| `--max-pages` | `2`                         | 每位演员最多抓取页数                |
| `--delay`     | `0.4`                       | 请求之间的间隔，单位为秒            |
| `--mp4`       | 关闭                        | 调用 `ffmpeg` 生成 MP4              |
| `--ext`       | `m3u8`                      | 编号目录文件使用的扩展名            |

## 输出结构

默认输出到 `C:\Users\Public\Videos\Tangxin`，每位演员一个子文件夹：

```text
C:\Users\Public\Videos\Tangxin/
├── catalog.txt
├── catalog.json
└── 演员名称/
    ├── 1.m3u8
    ├── 2.m3u8
    └── manifest.json
```

使用 `--mp4` 后，每位演员目录会按作品标题保存 MP4；网页端 MP4 也使用同样的目录规则：

```text
C:\Users\Public\Videos\Tangxin/
└── 演员名称/
    ├── 1.m3u8
    ├── 视频标题.mp4
    ├── 2.m3u8
    ├── 另一个视频标题.mp4
    └── manifest.json
```

其中：

- `catalog.txt`：适合人工查看的演员和作品目录
- `catalog.json`：按演员名称组织的完整作品数据
- `manifest.json`：单个演员的作品清单和本地文件信息
- `*.m3u8`：已将相对媒体地址改写为绝对地址的 HLS 播放列表
- `*.mp4`：使用 `ffmpeg` 转封装并检查完成后的本地视频文件

网页端默认目录为 `C:\Users\Public\Videos\Tangxin`。运行时可以在“设置”页改成其他绝对路径，配置保存在本机浏览器存储中，之后的单个和批量 MP4 请求会携带该目录；`TX_DOWNLOAD_DIR` 仍可作为服务端没有请求级目录时的环境变量回退，`--out` 可单独覆盖 Python CLI 的输出目录。

## 项目结构

```text
.
├── src/
│   ├── routes/index.tsx       # 主界面、导航、设置和关于工作区
│   ├── lib/tx/types.ts        # 站点、视频和归档数据类型
│   ├── lib/tx/parse.ts        # HTML、视频卡片和播放列表解析
│   ├── lib/tx/fns.ts          # TanStack Server Functions
│   ├── lib/tx/crawl.server.ts # 服务端抓取逻辑
│   └── lib/tx/store.ts        # 浏览器端状态管理
├── public/
│   └── tangxin_crawl.py       # 独立 Python CLI 脚本
├── scripts/
│   └── windows-start.mjs      # Windows 启动器
├── start.bat                  # Windows 双击入口
├── startup.sh                 # 预览环境启动入口
├── package.json               # npm 脚本与依赖
└── vite.config.ts             # Vite、TanStack Start 和 Nitro 配置
```

## 数据流与媒体约定

网页端通过服务端函数读取源站 HTML，再在本地解析目录数据，避免把跨域抓取逻辑直接放在浏览器中。关键地址规则集中定义在 `src/lib/tx/types.ts`：

```text
站点首页       https://tangxinvlog.app/
演员目录       https://tangxinvlog.app/a/
标签目录       https://tangxinvlog.app/tag/
视频详情       https://tangxinvlog.app/v/{id}/
封面           https://t.5gcdn.xyz/videos/{id}/cover.jpg
HLS 播放列表   https://t.5gcdn.xyz/videos/{id}/index.m3u8
```

源站页面结构或媒体 CDN 规则发生变化时，通常需要同步检查以下文件：

- `src/lib/tx/parse.ts`
- `src/lib/tx/crawl.server.ts`
- `src/lib/tx/types.ts`
- `public/tangxin_crawl.py`

## 常用开发命令

| 命令                        | 作用                             |
| --------------------------- | -------------------------------- |
| `npm run dev`               | 启动开发服务器                   |
| `npm run build`             | 构建生产版本并执行数据库迁移脚本 |
| `npm run preview:restart`   | 重启生产构建预览                 |
| `npm run typecheck`         | 执行 TypeScript 类型检查         |
| `npm run lint`              | 执行 ESLint 检查                 |
| `npm test`                  | 运行项目测试                     |
| `npm run desktop:package`   | 生成 Windows 便携版              |
| `npm run desktop:installer` | 生成 Windows 安装包              |
| `npm run check:auth`        | 检查认证相关不变量               |
| `npm run format`            | 使用 Prettier 格式化项目         |

提交改动前建议至少执行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 故障排查

### 页面提示请求失败

可能是源站不可访问、网络超时或源站返回了非 2xx 状态。请先确认网络和源站状态，并适当增大请求间隔；不要通过连续重试对源站施加压力。

### 演员列表为空或作品解析异常

项目依赖源站的 HTML class、链接路径和分页标记。如果源站改版，需要更新解析器中的选择规则。

### 网页端提示 `ffmpeg` 未就绪

先点击结果页的“刷新”。项目通过 `npm install` 安装的 Windows 版 `ffmpeg` 会优先使用；如果仍未就绪，可安装系统版并将其加入 PATH，或设置 `FFMPEG_PATH` 为 `ffmpeg.exe` 的完整路径后重启 `start.bat`。Python CLI 的 `--mp4` 遵循系统 PATH。

### MP4 没有保存或目标目录不可用

网页端和 Python CLI 都会先写入同一演员目录下的临时文件，转换成功并检查 MP4 索引后才替换为最终文件。若目标磁盘不可用、没有写权限，或源站返回的 HLS 不完整，会提示失败且不会留下半成品 MP4。网页端请在“设置”中填写绝对路径后重试；也可以使用 `TX_DOWNLOAD_DIR`，Python CLI 使用 `--out`。

### 部署后为什么不能调用我的电脑 ffmpeg

MP4 转换是在启动图形界面的那台本机上执行的。部署到 Vercel 等云端后，服务端无法访问访问者电脑上的 `ffmpeg`，因此应使用本地 Windows 启动模式完成转换下载。

### 双击 `start.bat` 后窗口立即退出

查看项目根目录的 `start-error.log`。常见原因包括 Node.js 未安装、Node.js 版本低于 20、依赖安装失败，或启动脚本不是从项目根目录运行。

如果提示 `8080` 已被其他程序占用，桌面程序不会误打开那个程序的页面（例如 `llama-ui`）。请先关闭占用 `8080` 的程序，再重新双击 `start.bat`；如果糖心图谱已经在运行，重复启动只会聚焦现有窗口，不会重复启动服务。

## 许可证

当前仓库未提供 `LICENSE` 文件，因此没有声明默认的开源授权。除非项目维护者另行授予许可，请将代码仅用于内部评估、学习或已获授权的场景，并自行确认第三方内容和服务的使用权。
