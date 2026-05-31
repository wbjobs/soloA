import os
import gradio as gr
from typing import List, Dict, Any, Optional
from qa_engine import QAEngine
from config import get_config, get_supported_extensions


UPLOAD_DIR = get_config("upload_dir")
os.makedirs(UPLOAD_DIR, exist_ok=True)

qa_engine = None
current_conversation_id = None


def get_engine():
    global qa_engine
    if qa_engine is None:
        qa_engine = QAEngine()
    return qa_engine


def format_sources(sources: List[Dict[str, Any]]) -> str:
    if not sources:
        return "无相关代码片段"

    parts = []
    for i, src in enumerate(sources, 1):
        metadata = src["metadata"]
        file_path = metadata.get("file_path", "unknown")
        language = metadata.get("language", "text")
        similarity = src.get("combined_score", src.get("similarity", 0))
        chunk_idx = metadata.get("chunk_index", 0)

        header = f"### 相关片段 {i}\n"
        header += f"- 文件: {file_path}\n"
        header += f"- 语言: {language}\n"
        header += f"- 相关性: {similarity:.3f}\n"
        header += f"- 块索引: {chunk_idx}\n\n"
        header += f"```\n{src['content']}\n```\n"
        parts.append(header)

    return "\n" + "\n".join(parts)


def format_modification_suggestion(suggestion: Optional[Dict[str, Any]]) -> str:
    if not suggestion:
        return ""

    markdown_parts = []

    if suggestion.get("analysis"):
        markdown_parts.append("### 代码分析\n")
        markdown_parts.append(suggestion["analysis"] + "\n")

    modifications = suggestion.get("modifications", [])
    if modifications:
        markdown_parts.append("### 修改建议\n")

        for i, mod in enumerate(modifications, 1):
            file_path = mod.get("file_path", "未知文件")
            explanation = mod.get("explanation", "")

            markdown_parts.append(f"---\n")
            markdown_parts.append(f"**修改 {i}: {file_path}**\n")

            if explanation:
                markdown_parts.append(f"*说明: {explanation}*\n\n")

            if mod.get("highlighted_original"):
                markdown_parts.append(f"**原始代码:**\n")
                markdown_parts.append(f"```diff\n{mod['highlighted_original']}\n```\n\n")

            if mod.get("highlighted_modified"):
                markdown_parts.append(f"**修改后代码:**\n")
                markdown_parts.append(f"```diff\n{mod['highlighted_modified']}\n```\n\n")
            elif mod.get("modified_code"):
                language = mod.get("language", "")
                markdown_parts.append(f"**修改后代码:**\n")
                markdown_parts.append(f"```{language}\n{mod['modified_code']}\n```\n\n")

    if suggestion.get("summary"):
        markdown_parts.append("### 修改总结\n")
        markdown_parts.append(suggestion["summary"] + "\n")

    return "\n".join(markdown_parts)


def update_status():
    engine = get_engine()
    stats = engine.get_index_status()
    files = engine.get_indexed_files()
    status_text = (
        f"向量数据库: {stats['db_path']}\n"
        f"文档数量: {stats['document_count']}\n"
        f"索引文件数: {len(files)}"
    )
    return status_text, "\n".join(files)


def update_conversation_list():
    engine = get_engine()
    conversations = engine.list_conversations()

    if not conversations:
        return gr.Dropdown(choices=[], value=None)

    choices = []
    for conv in conversations:
        title = conv.get("title", "无标题")
        turn_count = conv.get("turn_count", 0)
        display_text = f"{title} ({turn_count} 条消息)"
        choices.append((display_text, conv["conversation_id"]))

    return gr.Dropdown(choices=choices, value=current_conversation_id)


def create_new_conversation():
    global current_conversation_id
    engine = get_engine()
    result = engine.create_new_conversation()
    current_conversation_id = result["conversation_id"]
    return (
        "",
        "",
        "",
        "",
        "",
        gr.Dropdown(value=current_conversation_id),
        update_conversation_list()
    )


def load_conversation(conversation_id: str):
    global current_conversation_id
    if not conversation_id:
        return "", "", "", "", ""

    current_conversation_id = conversation_id
    engine = get_engine()
    conversation = engine.load_conversation(conversation_id)

    if not conversation:
        return "", "", "", "", ""

    history_text = ""
    turns = conversation.get("turns", [])
    for turn in turns:
        history_text += f"---\n**用户:** {turn.get('question', '')}\n\n"
        history_text += f"**助手:** {turn.get('answer', '')}\n\n"

    return history_text, "", "", "", ""


def delete_conversation(conversation_id: str):
    global current_conversation_id
    engine = get_engine()
    result = engine.delete_conversation(conversation_id)

    if result["success"] and conversation_id == current_conversation_id:
        current_conversation_id = None
        return "", "", "", "", "", update_conversation_list()

    return update_conversation_list()


def index_directory(file_paths: List[str], clear_existing: bool):
    if not file_paths:
        return "请选择代码库目录或上传文件", ""

    engine = get_engine()

    uploaded_dir = None
    for file_path in file_paths:
        if os.path.isdir(file_path):
            uploaded_dir = file_path
            break

    if not uploaded_dir:
        common_parent = os.path.commonpath(file_paths)
        if os.path.isdir(common_parent):
            uploaded_dir = common_parent
        else:
            uploaded_dir = os.path.dirname(common_parent)

    result = engine.index_codebase(uploaded_dir, clear_existing=clear_existing)

    status_text, files_list = update_status()

    if result["success"]:
        message = (
            f"索引成功!\n"
            f"处理文件数: {result['files_processed']}\n"
            f"索引块数: {result['chunks_indexed']}"
        )
    else:
        message = f"索引失败: {result['message']}"

    return message, files_list


def get_or_create_conversation():
    global current_conversation_id
    engine = get_engine()

    if current_conversation_id:
        conversation = engine.load_conversation(current_conversation_id)
        if conversation:
            return current_conversation_id

    result = engine.create_new_conversation()
    current_conversation_id = result["conversation_id"]
    return current_conversation_id


def answer_question(
    question: str,
    top_k: int,
    min_similarity: float,
    use_streaming: bool,
    history_text: str
):
    if not question.strip():
        return history_text, "请输入问题", "", "", ""

    engine = get_engine()
    conversation_id = get_or_create_conversation()

    if use_streaming:
        sources_text = ""
        context_text = ""
        full_answer = ""
        suggestion_text = ""
        current_history = history_text

        for event in engine.answer_stream(
            question,
            top_k=top_k,
            min_similarity=min_similarity,
            conversation_id=conversation_id
        ):
            if event["type"] == "status":
                yield current_history, event["content"], sources_text, context_text, suggestion_text
            elif event["type"] == "sources":
                sources = event["content"]
                context_text = event["context"]
                sources_text = format_sources(sources)
                yield current_history, "正在生成回答...", sources_text, context_text, suggestion_text
            elif event["type"] == "token":
                full_answer = event["full_answer"]
                yield current_history, full_answer, sources_text, context_text, suggestion_text
            elif event["type"] == "suggestion":
                suggestion = event["content"]
                suggestion_text = format_modification_suggestion(suggestion)
                yield current_history, full_answer, sources_text, context_text, suggestion_text
            elif event["type"] == "error":
                yield current_history, event["content"], sources_text, context_text, suggestion_text
            elif event["type"] == "warning":
                yield current_history, f"{full_answer}\n\n⚠️ {event['content']}", sources_text, context_text, suggestion_text
            elif event["type"] == "done":
                new_history = f"{current_history}\n---\n**用户:** {question}\n\n**助手:** {event['content']}\n\n"
                yield new_history, event["content"], sources_text, context_text, suggestion_text
    else:
        result = engine.answer(
            question,
            top_k=top_k,
            min_similarity=min_similarity,
            conversation_id=conversation_id
        )

        sources_text = format_sources(result.get("sources", []))
        context_text = result.get("context", "")
        answer_text = result.get("answer", "")

        suggestion = result.get("suggestion")
        suggestion_text = format_modification_suggestion(suggestion) if suggestion else ""

        new_history = f"{history_text}\n---\n**用户:** {question}\n\n**助手:** {answer_text}\n\n"

        return new_history, answer_text, sources_text, context_text, suggestion_text


def create_app():
    with gr.Blocks(title="代码库上下文感知问答助手") as app:
        gr.Markdown(
            """
            # 代码库上下文感知问答助手

            基于本地 LLaMA 模型和 Chroma 向量数据库的代码库智能问答系统。支持对话历史管理和代码修改建议。
            """
        )

        with gr.Row():
            with gr.Column(scale=1):
                with gr.Tab("代码库索引"):
                    gr.Markdown("### 代码库索引")

                    file_input = gr.File(
                        label="上传代码文件/目录",
                        file_count="multiple",
                        height=150
                    )

                    clear_checkbox = gr.Checkbox(
                        label="清除现有索引",
                        value=False,
                        info="勾选后将在索引前清空当前数据库"
                    )

                    index_btn = gr.Button("索引代码库", variant="primary")

                    index_result = gr.Textbox(
                        label="索引结果",
                        lines=3,
                        interactive=False
                    )

                    with gr.Accordion("索引状态", open=True):
                        status_text = gr.Textbox(
                            label="数据库状态",
                            lines=3,
                            interactive=False,
                            value=update_status()[0]
                        )
                        indexed_files = gr.Textbox(
                            label="已索引文件",
                            lines=8,
                            interactive=False,
                            value=update_status()[1]
                        )

                with gr.Tab("对话历史"):
                    gr.Markdown("### 对话历史")

                    with gr.Row():
                        new_conv_btn = gr.Button("新建对话", variant="primary")
                        refresh_btn = gr.Button("刷新列表")

                    conversation_dropdown = gr.Dropdown(
                        label="选择对话",
                        choices=[],
                        value=None,
                        interactive=True
                    )

                    with gr.Row():
                        load_conv_btn = gr.Button("加载对话")
                        delete_conv_btn = gr.Button("删除对话", variant="stop")

                    history_display = gr.Textbox(
                        label="对话历史",
                        lines=15,
                        interactive=False,
                        placeholder="选择或创建对话后，历史消息将显示在这里"
                    )

            with gr.Column(scale=2):
                gr.Markdown("### 智能问答")

                question_input = gr.Textbox(
                    label="输入问题",
                    placeholder="例如：这个项目的入口函数在哪里？如何修改这个函数？",
                    lines=3
                )

                with gr.Row():
                    top_k_slider = gr.Slider(
                        minimum=1, maximum=20, value=5, step=1,
                        label="检索结果数 (top_k)",
                        info="返回最相关的代码片段数量"
                    )
                    similarity_slider = gr.Slider(
                        minimum=0.0, maximum=1.0, value=0.0, step=0.05,
                        label="最小相似度",
                        info="过滤低于此相似度的结果"
                    )
                    stream_checkbox = gr.Checkbox(
                        label="流式输出",
                        value=True,
                        info="实时显示生成的回答"
                    )

                answer_btn = gr.Button("获取回答", variant="primary")

                answer_output = gr.Textbox(
                    label="回答",
                    lines=8,
                    interactive=False
                )

                with gr.Accordion("修改建议", open=True):
                    suggestion_output = gr.Markdown(
                        label="代码修改建议",
                        value="输入包含'修改'、'优化'、'重构'等关键词的问题，将自动生成修改建议。"
                    )

                with gr.Accordion("相关代码片段", open=False):
                    sources_output = gr.Markdown(label="相关代码")

                with gr.Accordion("完整上下文", open=False):
                    context_output = gr.Textbox(
                        label="发送给 LLM 的上下文",
                        lines=15,
                        interactive=False
                    )

        index_btn.click(
            fn=index_directory,
            inputs=[file_input, clear_checkbox],
            outputs=[index_result, indexed_files]
        ).then(
            fn=update_status,
            outputs=[status_text, indexed_files]
        )

        answer_btn.click(
            fn=answer_question,
            inputs=[question_input, top_k_slider, similarity_slider, stream_checkbox, history_display],
            outputs=[history_display, answer_output, sources_output, context_output, suggestion_output]
        )

        new_conv_btn.click(
            fn=create_new_conversation,
            outputs=[
                history_display,
                question_input,
                answer_output,
                sources_output,
                context_output,
                conversation_dropdown
            ]
        ).then(
            fn=update_conversation_list,
            outputs=[conversation_dropdown]
        )

        refresh_btn.click(
            fn=update_conversation_list,
            outputs=[conversation_dropdown]
        )

        load_conv_btn.click(
            fn=load_conversation,
            inputs=[conversation_dropdown],
            outputs=[history_display, answer_output, sources_output, context_output, suggestion_output]
        )

        delete_conv_btn.click(
            fn=delete_conversation,
            inputs=[conversation_dropdown],
            outputs=[conversation_dropdown]
        )

        gr.Markdown(
            """
            ---

            ### 支持的文件类型
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

            ### 提示
            - 输入包含"修改"、"优化"、"重构"、"如何改"等关键词的问题，将自动生成代码修改建议
            - 对话历史会自动保存，可以在左侧标签页管理
            - 新建对话将开始一个全新的问答会话
            """
        )

    return app


if __name__ == "__main__":
    app = create_app()
    app.queue()
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False
    )
