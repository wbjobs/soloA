import { useState, useEffect, useCallback } from "react";
import Timer from "./components/Timer";
import Statistics from "./components/Statistics";
import { useTimerStore } from "./store/timerStore";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";

type Tab = "timer" | "stats";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("timer");
  const {
    status,
    decrementSecond,
    nextMode,
    savePomodoro,
    setStatus,
    remainingSeconds,
    mode,
    currentTag,
    loadSavedTags,
  } = useTimerStore();

  useEffect(() => {
    loadSavedTags();
  }, [loadSavedTags]);

  const handleTimerComplete = useCallback(async () => {
    try {
      await invoke("timer_complete", {
        duration: mode === "work" ? 25 * 60 : 5 * 60,
        mode: mode,
        tag: currentTag,
      });
    } catch (e) {
      console.error("Timer complete error:", e);
    }
  }, [mode, currentTag]);

  useEffect(() => {
    if (status === "completed") {
      if (mode === "work") {
        savePomodoro();
      }
      handleTimerComplete();
      nextMode();
    }
  }, [status, mode, savePomodoro, nextMode, handleTimerComplete]);

  useEffect(() => {
    let interval: number | null = null;
    if (status === "running") {
      interval = window.setInterval(() => {
        decrementSecond();
      }, 1000);
    }
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status, decrementSecond]);

  useEffect(() => {
    const unlistenPause = listen("timer-pause", () => setStatus("paused"));
    const unlistenStart = listen("timer-start", () => {
      setStatus("running");
    });
    const unlistenReset = listen("timer-reset", () => {
      setStatus("idle");
    });
    return () => {
      unlistenPause.then((f) => f());
      unlistenStart.then((f) => f());
      unlistenReset.then((f) => f());
    };
  }, [setStatus]);

  useEffect(() => {
    invoke("update_tray_timer", {
      remaining: remainingSeconds,
      status,
    }).catch(console.error);
  }, [remainingSeconds, status]);

  useEffect(() => {
    const updateFloating = async () => {
      try {
        await emit("floating-update", {
          remaining: remainingSeconds,
          status,
        });
      } catch (e) {
        // Ignore errors
      }
    };
    updateFloating();
  }, [remainingSeconds, status]);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#f8fafc" }}>
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          background: "white",
        }}
      >
        <button
          onClick={() => setActiveTab("timer")}
          style={{
            flex: 1,
            padding: "16px",
            border: "none",
            background: activeTab === "timer" ? "#ef4444" : "transparent",
            color: activeTab === "timer" ? "white" : "#64748b",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          计时器
        </button>
        <button
          onClick={() => setActiveTab("stats")}
          style={{
            flex: 1,
            padding: "16px",
            border: "none",
            background: activeTab === "stats" ? "#ef4444" : "transparent",
            color: activeTab === "stats" ? "white" : "#64748b",
            fontSize: "16px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          统计
        </button>
      </div>
      <div style={{ padding: "24px" }}>
        {activeTab === "timer" ? <Timer /> : <Statistics />}
      </div>
    </div>
  );
}

export default App;
