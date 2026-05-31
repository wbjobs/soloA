# 代码库上下文感知问答助手

基于本地 LLaMA 模型和 Chroma 向量数据库的代码库智能问答系统，实现代码库的上下文感知问答功能。

## 功能特性

- **代码索引**：支持多语言代码库的自动扫描、分块和向量化
- **语义检索**：根据用户问题检索最相关的代码片段
- **智能问答**：结合检索结果，使用本地 LLaMA 模型生成回答
- **流式输出**：支持实时显示生成的回答
- **本地部署**：完全离线运行，不依赖外部 API
- **多语言支持**：支持 Python、JavaScript、Java、C++、Go、Rust 等多种编程语言

## 项目结构

```
.
├── config.py              # 配置模块
├── code_processor.py      # 代码分块与向量化模块
├── vector_db.py           # 向量数据库操作模块
├── llm_model.py           # LLaMA 模型调用模块
├── retrieval.py           # 语义检索模块
├── qa_engine.py           # 问答生成模块
├── app.py                 # Gradio Web 界面
├── requirements.txt       # 项目依赖
├── chroma_db/             # 向量数据库存储目录（运行时创建）
├── uploads/               # 上传文件目录（运行时创建）
└── models/                # LLaMA 模型目录（需手动创建）
    └── llama-2-7b-chat.gguf
```

## 安装步骤

### 1. 创建虚拟环境（推荐）

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 安装 llama-cpp-python（可选，用于 LLaMA 模型）

如果需要使用本地 LLaMA 模型，需要安装 llama-cpp-python：

```bash
# 基础安装
pip install llama-cpp-python

# Windows 用户可能需要先安装 Visual Studio Build Tools
# 或者使用预编译的 wheel
```

### 4. 下载 LLaMA 模型

1. 创建 `models` 目录
2. 下载 LLaMA 2 GGUF 格式模型（推荐 7B 或 13B 参数的 chat 版本）
3. 放置模型到 `models/` 目录下，或修改 `config.py` 中的 `llm_model_path` 配置

推荐模型来源：
- [Hugging Face - TheBloke](https://huggingface.co/TheBloke)

### 5. 运行应用

```bash
python app.py
```

应用启动后，访问 http://localhost:7860 即可使用。

## 使用方法

### 1. 索引代码库

1. 在 Web 界面左侧点击上传区域
2. 选择代码库所在的目录或直接拖放文件夹
3. 勾选是否"清除现有索引"
4. 点击"索引代码库"按钮

等待索引完成后，会显示处理的文件数和索引块数。

### 2. 提问

1. 在右侧输入框中输入问题
2. 调整参数（可选）：
   - 检索结果数 (top_k)：返回多少个相关代码片段
   - 最小相似度：过滤低相似度的结果
   - 流式输出：是否实时显示生成过程
3. 点击"获取回答"

### 3. 查看结果

- **回答**：LLaMA 模型生成的回答
- **相关代码片段**：检索到的相关代码及其元数据
- **完整上下文**：发送给 LLaMA 的完整提示词（用于调试）

## 配置说明

修改 `config.py` 可以调整以下参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| db_path | chroma_db | 向量数据库存储路径 |
| upload_dir | uploads | 上传文件目录 |
| embedding_model | all-MiniLM-L6-v2 | 嵌入模型名称 |
| chunk_size | 1000 | 代码块最大字符数 |
| chunk_overlap | 200 | 代码块重叠字符数 |
| top_k | 5 | 默认检索结果数 |
| llm_model_path | models/llama-2-7b-chat.gguf | LLaMA 模型路径 |
| llm_n_ctx | 4096 | 模型上下文窗口大小 |
| llm_n_threads | 4 | 推理线程数 |
| llm_temperature | 0.1 | 采样温度（越低越确定） |
| llm_max_tokens | 1024 | 生成最大 token 数 |

## 支持的文件类型

- Python (.py)
- JavaScript/TypeScript (.js, .jsx, .ts, .tsx)
- Java (.java)
- C/C++ (.c, .cpp, .h, .hpp)
- Go (.go), Rust (.rs), Swift (.swift), Kotlin (.kt)
- C# (.cs), PHP (.php), Ruby (.rb)
- Shell (.sh, .bash), SQL (.sql)
- HTML/CSS (.html, .css, .scss)
- 配置文件 (.xml, .json, .yaml, .yml)
- 文档 (.md, .txt, .rst)

## 示例问题

- "这个项目的入口函数在哪里？"
- "解释一下 UserService 类的功能"
- "找出所有与数据库连接相关的代码"
- "如何使用这个 API 接口？"
- "这个循环的逻辑是什么？"
- "帮我重构这个函数，提高性能"

## 技术栈

- **Gradio**: Web 界面框架
- **ChromaDB**: 向量数据库
- **Sentence-Transformers**: 文本向量化
- **llama-cpp-python**: LLaMA 模型推理
- **LangChain**: 文本处理工具
- **Python 3.8+**: 开发语言

## 注意事项

1. **模型性能**：7B 模型需要至少 8GB 内存，13B 模型需要至少 16GB 内存
2. **首次运行**：首次使用嵌入模型时会自动下载，需要联网
3. **大代码库**：大型项目索引可能需要较长时间，请耐心等待
4. **GPU 加速**：如果有 NVIDIA GPU，建议安装 CUDA 版本的 llama-cpp-python 以获得更好的性能

## 许可证

MIT License
