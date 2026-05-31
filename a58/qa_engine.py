import re
from typing import List, Dict, Any, Optional, Generator, Tuple
from retrieval import Retriever
from llm_model import LLaMAModel
from code_processor import CodeProcessor
from vector_db import VectorDatabase
from history_manager import HistoryManager


SYSTEM_PROMPT = """你是一个专业的代码助手，擅长理解、解释和编写代码。请基于提供的上下文信息回答用户的问题。

请遵循以下规则：
1. 如果问题的答案在上下文中，请基于上下文进行回答。
2. 如果上下文中没有足够的信息来回答问题，请诚实地说"我在提供的代码上下文中找不到足够的信息来回答这个问题。"
3. 回答时要清晰、准确、有帮助。
4. 如果用户要求生成代码，请确保代码质量高、有良好的注释，并遵循最佳实践。
5. 如果你引用了特定的代码片段，请注明来源文件。

你的回答应该用中文。"""

MODIFICATION_PROMPT = """你是一个专业的代码修改助手。请根据用户的修改需求，分析提供的代码片段并生成修改建议。

用户修改需求: {modification_request}

请仔细分析以下相关代码，然后进行修改。修改时请：
1. 保持原有代码的风格和规范
2. 只修改与需求相关的部分
3. 确保代码逻辑正确
4. 保持代码的可读性和可维护性

请以 JSON 格式输出修改建议，格式如下：
{{
  "analysis": "对代码的分析和修改思路说明",
  "modifications": [
    {{
      "file_path": "文件路径",
      "original_code": "原始代码片段",
      "modified_code": "修改后的代码片段",
      "explanation": "修改说明"
    }}
  ],
  "summary": "修改总结"
}}

相关代码：
"""


class QAEngine:
    def __init__(self):
        self.retriever = Retriever()
        self.llm = LLaMAModel()
        self.code_processor = CodeProcessor()
        self.vector_db = VectorDatabase()
        self.history_manager = HistoryManager()
        self.current_conversation = None

    def index_codebase(self, directory_path: str, clear_existing: bool = False) -> Dict[str, Any]:
        if clear_existing:
            self.vector_db.delete_collection()

        chunks = self.code_processor.process_directory(directory_path)
        if not chunks:
            return {
                "success": False,
                "message": "No supported files found in the directory."
            }

        count = self.vector_db.add_documents(chunks)

        return {
            "success": True,
            "files_processed": len(set([c["metadata"]["file_path"] for c in chunks])),
            "chunks_indexed": count,
            "message": f"Successfully indexed {count} chunks from {len(set([c['metadata']['file_path'] for c in chunks]))} files."
        }

    def _build_context_with_truncation(
        self,
        search_results: List[Dict[str, Any]],
        max_context_chars: int
    ) -> str:
        if not search_results:
            return ""

        context_parts = []
        total_chars = 0

        for i, result in enumerate(search_results):
            metadata = result["metadata"]
            file_path = metadata.get("file_path", "unknown")
            language = metadata.get("language", "text")
            similarity = result.get("combined_score", result.get("similarity", 0))

            header = f"--- 相关代码片段 {i+1} (相关性: {similarity:.3f}, 文件: {file_path}) ---\n"
            code_block = f"```{language}\n{result['content']}\n```\n"

            part = header + code_block
            part_chars = len(part)

            if total_chars + part_chars <= max_context_chars:
                context_parts.append(part)
                total_chars += part_chars
            else:
                remaining_chars = max_context_chars - total_chars
                if remaining_chars > len(header) + 50:
                    max_code_chars = remaining_chars - len(header) - 10
                    truncated_content = result["content"][:max_code_chars] + "\n...(已截断)"
                    truncated_block = f"```{language}\n{truncated_content}\n```\n"
                    context_parts.append(header + truncated_block)
                break

        return "\n".join(context_parts)

    def _detect_modification_request(self, question: str) -> bool:
        modification_keywords = [
            "修改", "更改", "更新", "重构", "优化", "改进",
            "怎么改", "如何改", "请修改", "帮我改", "改成",
            "modify", "change", "update", "refactor", "optimize",
            "fix", "repair", "improve"
        ]

        question_lower = question.lower()

        for keyword in modification_keywords:
            if keyword in question_lower:
                return True

        return False

    def _generate_modification_suggestion(
        self,
        question: str,
        search_results: List[Dict[str, Any]],
        max_context_chars: int
    ) -> Dict[str, Any]:
        if not search_results:
            return {
                "success": False,
                "message": "未找到相关代码片段，无法生成修改建议。",
                "suggestion": None
            }

        context = self._build_context_with_truncation(search_results, max_context_chars)

        modification_prompt = MODIFICATION_PROMPT.format(
            modification_request=question
        ) + context

        try:
            response = self.llm.generate(modification_prompt, temperature=0.2)
            suggestion = self._parse_modification_response(response)

            if suggestion and "modifications" in suggestion and suggestion["modifications"]:
                suggestion = self._highlight_modifications(suggestion)

            return {
                "success": True,
                "message": "修改建议已生成。",
                "suggestion": suggestion
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"生成修改建议时出错: {str(e)}",
                "suggestion": None
            }

    def _parse_modification_response(self, response: str) -> Optional[Dict[str, Any]]:
        json_pattern = r'\{[\s\S]*\}'
        matches = re.findall(json_pattern, response)

        if matches:
            try:
                import json
                for match in reversed(matches):
                    try:
                        parsed = json.loads(match)
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        continue
            except ImportError:
                pass

        lines = response.strip().split('\n')
        suggestion = {
            "analysis": "",
            "modifications": [],
            "summary": response
        }

        current_section = None
        current_mod = None
        in_code_block = False
        code_content = []

        for line in lines:
            if "分析" in line or "analysis" in line.lower():
                current_section = "analysis"
                continue
            elif "修改" in line and "说明" not in line:
                current_section = "modifications"
                current_mod = {"file_path": "", "original_code": "", "modified_code": "", "explanation": ""}
                continue
            elif "总结" in line or "summary" in line.lower():
                current_section = "summary"
                continue

            if line.strip().startswith("```"):
                in_code_block = not in_code_block
                if not in_code_block and code_content:
                    if current_mod:
                        if "原始" in line.lower() or "original" in line.lower():
                            current_mod["original_code"] = "\n".join(code_content)
                        else:
                            current_mod["modified_code"] = "\n".join(code_content)
                    code_content = []
                continue

            if in_code_block:
                code_content.append(line)
                continue

            if current_section == "analysis":
                suggestion["analysis"] += line + "\n"
            elif current_section == "summary":
                suggestion["summary"] += line + "\n"
            elif current_mod:
                if "文件" in line or "file" in line.lower():
                    current_mod["file_path"] = line.split(":", 1)[1].strip() if ":" in line else line.strip()
                elif "说明" in line or "explanation" in line.lower():
                    current_mod["explanation"] = line.split(":", 1)[1].strip() if ":" in line else line.strip()
                elif line.strip():
                    if current_mod["explanation"]:
                        current_mod["explanation"] += " " + line.strip()

        if current_mod and (current_mod["original_code"] or current_mod["modified_code"]):
            suggestion["modifications"].append(current_mod)

        return suggestion if suggestion["modifications"] or suggestion["analysis"] else None

    def _highlight_modifications(self, suggestion: Dict[str, Any]) -> Dict[str, Any]:
        for mod in suggestion.get("modifications", []):
            original = mod.get("original_code", "")
            modified = mod.get("modified_code", "")

            if original and modified:
                mod["highlighted_original"] = self._highlight_diffs(original, modified, is_original=True)
                mod["highlighted_modified"] = self._highlight_diffs(original, modified, is_original=False)

        return suggestion

    def _highlight_diffs(self, original: str, modified: str, is_original: bool) -> str:
        original_lines = original.strip().split('\n')
        modified_lines = modified.strip().split('\n')

        if is_original:
            return self._format_code_with_line_numbers(original, is_removed=True)
        else:
            return self._format_code_with_line_numbers(modified, is_removed=False)

    def _format_code_with_line_numbers(self, code: str, is_removed: bool = False) -> str:
        lines = code.strip().split('\n')
        prefix = "- " if is_removed else "+ "
        formatted_lines = [f"{prefix}{i+1:3d} | {line}" for i, line in enumerate(lines)]
        return "\n".join(formatted_lines)

    def _build_prompt_with_history(
        self,
        question: str,
        system_message: str,
        context: str,
        conversation_id: Optional[str] = None,
        max_history_tokens: int = 500
    ) -> Tuple[str, bool]:
        history_context = ""

        if conversation_id:
            conversation = self.history_manager.load_conversation(conversation_id)
            if conversation:
                history_context = self.history_manager.format_history_context(
                    conversation,
                    max_tokens=max_history_tokens
                )

        if history_context:
            full_context = history_context + "\n\n" + context
        else:
            full_context = context

        prompt, truncated = self.llm.build_safe_prompt(
            system_message=system_message,
            user_message=question,
            context=full_context
        )

        return prompt, truncated

    def answer(
        self,
        question: str,
        top_k: int = 5,
        min_similarity: float = None,
        file_filter: Optional[List[str]] = None,
        conversation_id: Optional[str] = None,
        generate_modification: Optional[bool] = None,
    ) -> Dict[str, Any]:
        if not self.retriever.has_index():
            return {
                "success": False,
                "answer": "代码库尚未索引。请先上传并索引代码库。",
                "sources": [],
                "context": "",
                "context_truncated": False,
                "suggestion": None,
            }

        search_results = self.retriever.search(
            query=question,
            top_k=top_k,
            min_similarity=min_similarity,
            file_filter=file_filter
        )

        is_modification_request = (
            generate_modification if generate_modification is not None
            else self._detect_modification_request(question)
        )

        if not self.llm.is_available():
            context = self.retriever.format_context(search_results)
            return {
                "success": False,
                "answer": "LLaMA 模型不可用。请确保模型文件存在并且 llama-cpp-python 已正确安装。",
                "sources": search_results,
                "context": context,
                "context_truncated": False,
                "suggestion": None,
            }

        max_context_tokens = self.llm._get_available_context(
            self.llm._calculate_prompt_tokens(SYSTEM_PROMPT, question),
            self.llm.max_tokens
        )
        max_context_chars = max_context_tokens * 4

        suggestion = None
        if is_modification_request and search_results:
            modification_result = self._generate_modification_suggestion(
                question,
                search_results,
                max_context_chars // 2
            )
            if modification_result["success"]:
                suggestion = modification_result["suggestion"]

        context = self._build_context_with_truncation(
            search_results,
            max_context_chars
        )

        prompt, context_was_truncated = self._build_prompt_with_history(
            question=question,
            system_message=SYSTEM_PROMPT,
            context=context,
            conversation_id=conversation_id
        )

        try:
            answer = self.llm.generate(prompt)
        except Exception as e:
            return {
                "success": False,
                "answer": f"生成答案时出错: {str(e)}",
                "sources": search_results,
                "context": context,
                "context_truncated": context_was_truncated,
                "suggestion": suggestion,
            }

        if conversation_id:
            self.history_manager.add_turn_to_conversation(
                conversation_id=conversation_id,
                question=question,
                answer=answer,
                sources=search_results,
                suggestion=suggestion,
                context_truncated=context_was_truncated,
            )

        return {
            "success": True,
            "answer": answer,
            "sources": search_results,
            "context": context,
            "context_truncated": context_was_truncated,
            "suggestion": suggestion,
            "is_modification_request": is_modification_request,
        }

    def answer_stream(
        self,
        question: str,
        top_k: int = 5,
        min_similarity: float = None,
        file_filter: Optional[List[str]] = None,
        conversation_id: Optional[str] = None,
        generate_modification: Optional[bool] = None,
    ) -> Generator[Dict[str, Any], None, None]:
        if not self.retriever.has_index():
            yield {
                "type": "error",
                "content": "代码库尚未索引。请先上传并索引代码库。"
            }
            return

        search_results = self.retriever.search(
            query=question,
            top_k=top_k,
            min_similarity=min_similarity,
            file_filter=file_filter
        )

        is_modification_request = (
            generate_modification if generate_modification is not None
            else self._detect_modification_request(question)
        )

        if not self.llm.is_available():
            context = self.retriever.format_context(search_results)
            yield {
                "type": "sources",
                "content": search_results,
                "context": context
            }
            yield {
                "type": "error",
                "content": "LLaMA 模型不可用。请确保模型文件存在并且 llama-cpp-python 已正确安装。"
            }
            return

        max_context_tokens = self.llm._get_available_context(
            self.llm._calculate_prompt_tokens(SYSTEM_PROMPT, question),
            self.llm.max_tokens
        )
        max_context_chars = max_context_tokens * 4

        suggestion = None
        if is_modification_request and search_results:
            yield {
                "type": "status",
                "content": "正在分析代码并生成修改建议..."
            }
            modification_result = self._generate_modification_suggestion(
                question,
                search_results,
                max_context_chars // 2
            )
            if modification_result["success"]:
                suggestion = modification_result["suggestion"]
                yield {
                    "type": "suggestion",
                    "content": suggestion
                }

        context = self._build_context_with_truncation(
            search_results,
            max_context_chars
        )

        yield {
            "type": "sources",
            "content": search_results,
            "context": context
        }

        prompt, context_was_truncated = self._build_prompt_with_history(
            question=question,
            system_message=SYSTEM_PROMPT,
            context=context,
            conversation_id=conversation_id
        )

        if context_was_truncated:
            yield {
                "type": "warning",
                "content": "上下文过长，已自动截断部分代码片段以适应模型限制。"
            }

        full_answer = ""
        try:
            for token in self.llm.generate_stream(prompt):
                full_answer += token
                yield {
                    "type": "token",
                    "content": token,
                    "full_answer": full_answer
                }
        except Exception as e:
            yield {
                "type": "error",
                "content": f"生成答案时出错: {str(e)}"
            }
            return

        if conversation_id:
            self.history_manager.add_turn_to_conversation(
                conversation_id=conversation_id,
                question=question,
                answer=full_answer,
                sources=search_results,
                suggestion=suggestion,
                context_truncated=context_was_truncated,
            )

        yield {
            "type": "done",
            "content": full_answer,
            "context_truncated": context_was_truncated,
            "suggestion": suggestion,
            "is_modification_request": is_modification_request,
        }

    def create_new_conversation(self, title: Optional[str] = None) -> Dict[str, Any]:
        conversation = self.history_manager.create_conversation(title)
        self.current_conversation = conversation
        return {
            "conversation_id": conversation.conversation_id,
            "title": conversation.title,
            "created_at": conversation.created_at,
        }

    def list_conversations(self) -> List[Dict[str, Any]]:
        return self.history_manager.list_conversations()

    def load_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        conversation = self.history_manager.load_conversation(conversation_id)
        if conversation:
            self.current_conversation = conversation
            return conversation.to_dict()
        return None

    def delete_conversation(self, conversation_id: str) -> Dict[str, Any]:
        success = self.history_manager.delete_conversation(conversation_id)
        if self.current_conversation and self.current_conversation.conversation_id == conversation_id:
            self.current_conversation = None
        return {
            "success": success,
            "message": "对话已删除" if success else "对话不存在"
        }

    def get_index_status(self) -> Dict[str, Any]:
        return self.retriever.get_index_stats()

    def get_indexed_files(self) -> List[str]:
        return self.retriever.get_indexed_files()
