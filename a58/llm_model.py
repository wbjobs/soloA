import os
from typing import Optional, Generator, List, Tuple
from config import get_config


class LLaMAModel:
    def __init__(self, model_path: Optional[str] = None):
        self.model_path = model_path or get_config("llm_model_path")
        self.n_ctx = get_config("llm_n_ctx", 4096)
        self.n_threads = get_config("llm_n_threads", 4)
        self.temperature = get_config("llm_temperature", 0.1)
        self.max_tokens = get_config("llm_max_tokens", 1024)
        self.context_buffer_ratio = get_config("context_buffer_ratio", 0.5)

        self.model = None
        self._model_loaded = False

    def load_model(self):
        if self._model_loaded:
            return

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Model file not found: {self.model_path}. "
                "Please download a LLaMA GGUF model or update the config."
            )

        try:
            from llama_cpp import Llama
            self.model = Llama(
                model_path=self.model_path,
                n_ctx=self.n_ctx,
                n_threads=self.n_threads,
                verbose=False,
            )
            self._model_loaded = True
        except ImportError:
            raise ImportError(
                "llama-cpp-python is not installed. "
                "Run `pip install llama-cpp-python` to install it."
            )

    def unload_model(self):
        if self.model is not None:
            del self.model
            self.model = None
            self._model_loaded = False

    def _estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        return len(text) // 4

    def _count_tokens_with_model(self, text: str) -> int:
        if self._model_loaded and self.model is not None:
            try:
                return len(self.model.tokenize(text.encode("utf-8")))
            except Exception:
                pass
        return self._estimate_tokens(text)

    def _get_available_context(
        self,
        base_prompt_tokens: int,
        max_tokens: int
    ) -> int:
        total_available = self.n_ctx - max_tokens - 100
        total_available = max(total_available, 0)

        available_for_context = total_available - base_prompt_tokens
        available_for_context = max(available_for_context, 0)

        return available_for_context

    def _truncate_context(
        self,
        context: str,
        max_tokens: int
    ) -> str:
        if not context:
            return ""

        estimated_tokens = self._estimate_tokens(context)

        if estimated_tokens <= max_tokens:
            return context

        lines = context.split("\n")

        if len(lines) > 1:
            half_lines = len(lines) // 2
            first_half = "\n".join(lines[:half_lines])
            last_half = "\n".join(lines[half_lines:])

            first_tokens = self._estimate_tokens(first_half)
            last_tokens = self._estimate_tokens(last_half)

            if first_tokens > last_tokens:
                target = max_tokens
                current = first_half
            else:
                target = max_tokens
                current = last_half

            if self._estimate_tokens(current) <= target:
                return current

        ratio = max_tokens / max(estimated_tokens, 1)
        new_length = int(len(context) * ratio * 0.95)
        return context[:new_length] + "\n...(上下文已截断)"

    def _calculate_prompt_tokens(
        self,
        system_message: str,
        user_message: str
    ) -> int:
        template = "[INST] <<SYS>>\n<</SYS>>\n\n用户问题:  [/INST]"
        template_tokens = self._estimate_tokens(template)

        system_tokens = self._estimate_tokens(system_message)
        user_tokens = self._estimate_tokens(user_message)

        return template_tokens + system_tokens + user_tokens

    def build_safe_prompt(
        self,
        system_message: str,
        user_message: str,
        context: str = "",
        max_tokens: Optional[int] = None
    ) -> Tuple[str, bool]:
        actual_max_tokens = max_tokens or self.max_tokens

        base_prompt_tokens = self._calculate_prompt_tokens(
            system_message,
            user_message
        )

        available_context = self._get_available_context(
            base_prompt_tokens,
            actual_max_tokens
        )

        if not context:
            prompt = (
                f"[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n"
                f"{user_message} [/INST]"
            )
            return prompt, False

        context_tokens = self._estimate_tokens(context)
        context_was_truncated = False

        if context_tokens > available_context:
            context = self._truncate_context(context, available_context)
            context_was_truncated = True

        if context:
            prompt = (
                f"[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n"
                f"相关上下文:\n{context}\n\n"
                f"用户问题: {user_message} [/INST]"
            )
        else:
            prompt = (
                f"[INST] <<SYS>>\n{system_message}\n<</SYS>>\n\n"
                f"{user_message} [/INST]"
            )

        return prompt, context_was_truncated

    def generate(self, prompt: str, **kwargs) -> str:
        self.load_model()

        temperature = kwargs.get("temperature", self.temperature)
        max_tokens = kwargs.get("max_tokens", self.max_tokens)
        stop = kwargs.get("stop", None)

        output = self.model(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop,
            echo=False,
        )

        return output["choices"][0]["text"].strip()

    def generate_stream(self, prompt: str, **kwargs) -> Generator[str, None, None]:
        self.load_model()

        temperature = kwargs.get("temperature", self.temperature)
        max_tokens = kwargs.get("max_tokens", self.max_tokens)
        stop = kwargs.get("stop", None)

        stream = self.model(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=stop,
            echo=False,
            stream=True,
        )

        for output in stream:
            if "choices" in output and len(output["choices"]) > 0:
                text = output["choices"][0].get("text", "")
                if text:
                    yield text

    def create_chat_prompt(self, system_message: str, user_message: str, context: str = "") -> str:
        prompt, _ = self.build_safe_prompt(
            system_message,
            user_message,
            context,
            self.max_tokens
        )
        return prompt

    def is_available(self) -> bool:
        try:
            from llama_cpp import Llama
            llama_available = True
        except ImportError:
            llama_available = False

        model_exists = os.path.exists(self.model_path)

        return llama_available and model_exists

    def get_context_stats(
        self,
        system_message: str,
        user_message: str,
        context: str = ""
    ) -> dict:
        base_tokens = self._calculate_prompt_tokens(
            system_message,
            user_message
        )
        context_tokens = self._estimate_tokens(context)
        total_estimated = base_tokens + context_tokens

        available = self._get_available_context(
            base_tokens,
            self.max_tokens
        )

        return {
            "base_prompt_tokens": base_tokens,
            "context_tokens": context_tokens,
            "total_estimated_tokens": total_estimated,
            "max_context_available": available,
            "context_exceeds_limit": context_tokens > available,
            "model_n_ctx": self.n_ctx,
            "max_output_tokens": self.max_tokens,
        }
