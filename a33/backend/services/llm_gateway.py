from typing import List, Dict, Any, Optional, Callable
import json
import time

from shared.config import settings


class LLMProvider:
    OPENAI = "openai"
    CLAUDE = "claude"
    LOCAL = "local"


class LLMGateway:
    def __init__(self):
        self.providers = {
            LLMProvider.OPENAI: self._call_openai,
            LLMProvider.CLAUDE: self._call_claude,
            LLMProvider.LOCAL: self._call_local
        }
        self._clients = {}

    def _get_provider_order(self) -> List[str]:
        order = [settings.DEFAULT_LLM_PROVIDER]
        for provider in [LLMProvider.OPENAI, LLMProvider.CLAUDE, LLMProvider.LOCAL]:
            if provider not in order:
                order.append(provider)
        return order

    def _is_provider_available(self, provider: str) -> bool:
        if provider == LLMProvider.OPENAI:
            return bool(settings.OPENAI_API_KEY)
        elif provider == LLMProvider.CLAUDE:
            return bool(settings.CLAUDE_API_KEY)
        elif provider == LLMProvider.LOCAL:
            return True
        return False

    def generate(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        provider: Optional[str] = None,
        max_tokens: int = 1000,
        temperature: float = 0.7,
        stream: bool = False
    ) -> str:
        if provider:
            providers = [provider]
        else:
            providers = self._get_provider_order()

        for prov in providers:
            if not self._is_provider_available(prov):
                continue
            try:
                return self.providers[prov](
                    messages=messages,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=stream
                )
            except Exception as e:
                print(f"Provider {prov} failed: {e}")
                continue

        raise RuntimeError("No available LLM provider could process the request")

    def _call_openai(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str],
        max_tokens: int,
        temperature: float,
        stream: bool
    ) -> str:
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai not installed")

        if settings.DEFAULT_LLM_PROVIDER != LLMProvider.OPENAI and not settings.OPENAI_API_KEY:
            raise RuntimeError("OpenAI API key not configured")

        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=full_messages,
            max_tokens=max_tokens,
            temperature=temperature
        )

        return response.choices[0].message.content or ""

    def _call_claude(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str],
        max_tokens: int,
        temperature: float,
        stream: bool
    ) -> str:
        try:
            import anthropic
        except ImportError:
            raise ImportError("anthropic not installed")

        if not settings.CLAUDE_API_KEY:
            raise RuntimeError("Claude API key not configured")

        client = anthropic.Anthropic(api_key=settings.CLAUDE_API_KEY)

        response = client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt or "",
            messages=messages
        )

        if response.content:
            return response.content[0].text
        return ""

    def _call_local(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str],
        max_tokens: int,
        temperature: float,
        stream: bool
    ) -> str:
        import httpx

        full_prompt = ""
        if system_prompt:
            full_prompt += f"System: {system_prompt}\n\n"
        for msg in messages:
            role = msg["role"].capitalize()
            full_prompt += f"{role}: {msg['content']}\n"
        full_prompt += "\nAssistant:"

        try:
            response = httpx.post(
                f"{settings.LOCAL_LLM_URL}/api/generate",
                json={
                    "model": settings.LOCAL_LLM_MODEL,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": temperature
                    }
                },
                timeout=120.0
            )
            response.raise_for_status()
            data = response.json()
            return data.get("response", "")
        except Exception:
            try:
                response = httpx.post(
                    f"{settings.LOCAL_LLM_URL}/v1/chat/completions",
                    json={
                        "model": settings.LOCAL_LLM_MODEL,
                        "messages": messages,
                        "max_tokens": max_tokens,
                        "temperature": temperature
                    },
                    timeout=120.0
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
            except Exception:
                raise RuntimeError("Local LLM not available")

    def generate_json(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        messages = [{"role": "user", "content": prompt + "\n\nReturn valid JSON."}]
        
        result = self.generate(
            messages=messages,
            system_prompt=system_prompt,
            max_tokens=2000,
            temperature=0.1
        )

        try:
            json_str = result
            if "```json" in json_str:
                match = __import__('re').search(r'```json\s*([\s\S]*?)\s*```', json_str)
                if match:
                    json_str = match.group(1)
            elif "```" in json_str:
                match = __import__('re').search(r'```\s*([\s\S]*?)\s*```', json_str)
                if match:
                    json_str = match.group(1)

            return json.loads(json_str)
        except json.JSONDecodeError:
            return {"raw_text": result}

    def summarize(self, text: str, max_length: int = 200) -> str:
        prompt = f"Please summarize the following text in {max_length} words or less:\n\n{text}"
        return self.generate(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_length + 50,
            temperature=0.3
        )

    def extract_keywords(self, text: str, count: int = 10) -> List[str]:
        prompt = f"Extract {count} key concepts or keywords from the following text. Return as a JSON array of strings:\n\n{text}"
        result = self.generate_json(prompt)
        if isinstance(result, dict) and "raw_text" in result:
            return []
        if isinstance(result, list):
            return result[:count]
        return []
