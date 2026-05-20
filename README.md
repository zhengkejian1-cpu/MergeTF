# 合成士兵·城堡防御

HTML5 + Canvas + Matter.js 竖屏塔防合成游戏（540×960）。

## 技术栈

- HTML5 / CSS3 / JavaScript (ES Modules)
- [Matter.js 0.19.0](https://brm.io/matter-js/) — 全场球体物理
- Canvas 2D — 球体、敌人、UI 特效

## 快速运行

需要本地 HTTP 服务（ES Module 不支持 `file://` 直接打开）：

```bash
npx --yes serve .
```

浏览器访问终端提示的地址（`serve` 默认多为 `http://localhost:3000`）。

## 项目结构

```
mergePK/
├── index.html
├── css/style.css
├── js/
│   ├── main.js              # 入口、循环、投放输入
│   ├── config.js            # 数值与 interaction.gap
│   ├── physics.js           # Matter 世界、球-球接触解析
│   ├── synthesis.js         # 投放、合成、绘制球体
│   ├── soldier.js           # 球体 meta、战斗视图
│   ├── enemy.js             # 敌人
│   ├── defenseLane.js       # 波次战斗、城堡、刷怪区绘制
│   ├── waveManager.js       # 波次
│   ├── uiManager.js         # UI、教程、调试
│   ├── interactionResolve.js  # 感应圈接触判定
│   ├── mergeUtils.js
│   ├── drawUtils.js
│   ├── dropQueue.js
│   ├── debug.js
│   └── utils.js
└── NUMBERS.md               # gap 数值说明
```

## 玩法概要

- **全场 Matter 球**：顶栏投放 → 重力堆叠 → 同级进圈合成（1–6 级）
- **感应圈统一**：`interaction.gap` 同时管碰撞、合成、攻击、外圈绘制
- **仅顶部可投放**：状态栏下方窄带内拖放，12 金/次，队列随机 1–4 级
- **敌人**：右侧传送门刷怪，1v1 接战或攻城堡；击杀得赏金

## 操作

- 顶部瞄准线左右移动，松手垂直落下
- 「调换」切换下一个掉落等级
- ⚙️ 设置 / 调试 / 暂停

## 数值

见 [NUMBERS.md](NUMBERS.md) 与 `js/config.js` 顶部注释。

## 部署到 Vercel

与 [SSxyx](../SSxyx) 相同：**push 到 GitHub → Vercel 自动部署**（本项目为静态 HTML，无需 build）。

1. 首次：GitHub 仓库为 [`zhengkejian1-cpu/MergeTF`](https://github.com/zhengkejian1-cpu/MergeTF)，Vercel Import 该仓库；线上地址以 Vercel 项目为准（见 `scripts/deploy.config.json`）。
2. 初始化 git（若尚未）：

```bash
git init -b main
git add .
git commit -m "init: mergePK web"
```

3. 日常发布：双击或命令行运行：

```bat
mergepk.bat          REM 菜单
mergepk.bat deploy   REM 提交并推送
mergepk.bat dev      REM 本地 npx serve
mergepk.bat redeploy REM 空提交触发重建
```

Unity 目录（`Assets/` 等）已在 `.gitignore` 中，不会上传。
