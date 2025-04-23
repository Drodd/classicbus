# 3D 巴士场景

使用Three.js实现的3D分层场景，展示了一个在田野和山脉背景下行驶的巴士。

## 项目结构

- `index.html` - 主HTML文件
- `style.css` - 样式文件
- `main.js` - 主JavaScript文件，包含Three.js代码
- `img/` - 包含所有图层图像

## 如何运行

1. 确保您的图像都在`img`文件夹中
2. 使用本地服务器运行此项目（由于浏览器的CORS政策，直接打开HTML文件可能无法加载纹理）

### 使用Python设置简单的本地服务器

```bash
# Python 3
python -m http.server

# Python 2
python -m SimpleHTTPServer
```

然后在浏览器中访问 `http://localhost:8000`

## 交互

- 使用鼠标拖动旋转场景
- 滚轮缩放
- 按住右键并拖动平移场景 