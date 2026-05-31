import { useTimerStore, TimerMode } from "../store/timerStore";

function Timer() {
  const {
    status,
    mode,
    remainingSeconds,
    toggle,
    reset,
    setMode,
    savedTags,
    currentTag,
    setCurrentTag,
  } = useTimerStore();

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const modeLabels: Record<TimerMode, string> = {
    work: "工作",
    shortBreak: "短休息",
    longBreak: "长休息",
  };

  const modeColors: Record<TimerMode, { bg: string; text: string }> = {
    work: { bg: "#ef4444", text: "white" },
    shortBreak: { bg: "#22c55e", text: "white" },
    longBreak: { bg: "#3b82f6", text: "white" },
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          marginBottom: "16px",
          display: "flex",
          gap: "8px",
          justifyContent: "center",
        }}
      >
        {(["work", "shortBreak", "longBreak"] as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              background: mode === m ? modeColors[m].bg : "#e2e8f0",
              color: mode === m ? modeColors[m].text : "#475569",
            }}
          >
            {modeLabels[m]}
          </button>
        ))}
      </div>

      {mode === "work" && savedTags.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              fontSize: "14px",
              color: "#64748b",
              marginBottom: "8px",
              fontWeight: 500,
            }}
          >
            选择专注标签
          </div>
          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {savedTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setCurrentTag(tag.name)}
                style={{
                  padding: "8px 16px",
                  border: currentTag === tag.name ? `2px solid ${tag.color}` : "2px solid #e2e8f0",
                  borderRadius: "20px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  background: currentTag === tag.name ? tag.color : "white",
                  color: currentTag === tag.name ? "white" : "#475569",
                  transition: "all 0.2s",
                }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          fontSize: "80px",
          fontWeight: 700,
          color: modeColors[mode].bg,
          marginBottom: "24px",
          fontFamily: "monospace",
        }}
      >
        {formatTime(remainingSeconds)}
      </div>

      <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
        <button
          onClick={toggle}
          style={{
            padding: "16px 48px",
            border: "none",
            borderRadius: "12px",
            fontSize: "20px",
            fontWeight: 600,
            cursor: "pointer",
            background: modeColors[mode].bg,
            color: "white",
          }}
        >
          {status === "running" ? "暂停" : "开始"}
        </button>
        <button
          onClick={reset}
          style={{
            padding: "16px 32px",
            border: "2px solid #e2e8f0",
            borderRadius: "12px",
            fontSize: "20px",
            fontWeight: 600,
            cursor: "pointer",
            background: "white",
            color: "#64748b",
          }}
        >
          重置
        </button>
      </div>
    </div>
  );
}

export default Timer;
