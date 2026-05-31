import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Square, Loader2 } from 'lucide-react';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  onTranscript,
  disabled = false,
  placeholder = '点击开始语音输入...',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');

  const isSupported = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器');
      return;
    }

    setError(null);
    finalTranscriptRef.current = '';
    setInterimTranscript('');

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        finalTranscriptRef.current += final;
        setInterimTranscript('');
        onTranscript(finalTranscriptRef.current);
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setError('麦克风权限被拒绝，请允许访问麦克风');
      } else if (event.error === 'no-speech') {
        setError('未检测到语音，请靠近麦克风说话');
      } else {
        setError(`语音识别错误: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start();
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, onTranscript]);

  const stopListening = useCallback(() => {
    setIsListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (finalTranscriptRef.current) {
      onTranscript(finalTranscriptRef.current);
    }
    setInterimTranscript('');
  }, [onTranscript]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-xs text-yellow-500">
        <MicOff className="w-4 h-4" />
        <span>浏览器不支持语音识别</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleListening}
          disabled={disabled}
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            isListening
              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              : 'bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {isListening ? (
            <>
              <Square className="w-4 h-4" />
              <span className="text-sm">停止</span>
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" />
              <span className="text-sm">语音输入</span>
            </>
          )}
        </button>

        {isListening && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
            <span className="text-xs text-red-400">正在聆听...</span>
          </div>
        )}
      </div>

      {isListening && interimTranscript && (
        <div className="mt-2 px-3 py-2 bg-slate-800/50 rounded text-sm text-slate-400 italic">
          {interimTranscript}
        </div>
      )}

      {error && (
        <div className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <MicOff className="w-3 h-3" />
          {error}
        </div>
      )}

      {!isListening && !error && (
        <div className="mt-1 text-xs text-slate-500">
          {placeholder}
        </div>
      )}
    </div>
  );
};

export default VoiceInput;
