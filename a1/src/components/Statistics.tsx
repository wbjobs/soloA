import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DailyStats, TagStats, SavedTag } from "../types/stats";

function Statistics() {
  const [stats, setStats] = useState<DailyStats>({ count: 0, total_seconds: 0 });
  const [todayTagStats, setTodayTagStats] = useState<TagStats[]>([]);
  const [allTagStats, setAllTagStats] = useState<TagStats[]>([]);
  const [savedTags, setSavedTags] = useState<SavedTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatsType, setActiveStatsType] = useState<"today" | "all">("today");

  useEffect(() => {
    loadAllStats();
    const interval = setInterval(loadAllStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAllStats = async () => {
    try {
      const [dailyResult, todayTagsResult, allTagsResult, savedTagsResult] = await Promise.all([
        invoke<DailyStats>("get_today_stats_data"),
        invoke<TagStats[]>("get_today_tag_stats_data"),
        invoke<TagStats[]>("get_all_tag_stats_data"),
        invoke<SavedTag[]>("get_saved_tags_data"),
      ]);
      setStats(dailyResult);
      setTodayTagStats(todayTagsResult);
      setAllTagStats(allTagsResult);
      setSavedTags(savedTagsResult);
    } catch (e) {
      console.error("Failed to load stats:", e);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}小时${mins}分钟`;
    }
    return `${mins}分钟`;
  };

  const getTagColor = (tagName: string): string => {
    const tag = savedTags.find((t) => t.name === tagName);
    if (tag) return tag.color;
    const colors = [
      "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", 
      "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"
    ];
    const index = tagName.length % colors.length;
    return colors[index];
  };

  const currentTagStats = activeStatsType === "today" ? todayTagStats : allTagStats;
  const maxSeconds = currentTagStats.length > 0 
    ? Math.max(...currentTagStats.map((s) => s.total_seconds)) 
    : 1;

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
        加载中...
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          textAlign: "center",
          fontSize: "24px",
          fontWeight: 700,
          marginBottom: "24px",
          color: "#1e293b",
        }}
      >
        今日统计
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "4px",
              fontWeight: 500,
            }}
          >
            完成番茄钟
          </div>
          <div
            style={{
              fontSize: "40px",
              fontWeight: 700,
              color: "#ef4444",
            }}
          >
            {stats.count}
          </div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>个</div>
        </div>

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: "#94a3b8",
              marginBottom: "4px",
              fontWeight: 500,
            }}
          >
            总专注时长
          </div>
          <div
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: "#3b82f6",
            }}
          >
            {formatDuration(stats.total_seconds)}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <button
            onClick={() => setActiveStatsType("today")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              background: activeStatsType === "today" ? "#ef4444" : "#e2e8f0",
              color: activeStatsType === "today" ? "white" : "#475569",
            }}
          >
            今日标签分布
          </button>
          <button
            onClick={() => setActiveStatsType("all")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              background: activeStatsType === "all" ? "#ef4444" : "#e2e8f0",
              color: activeStatsType === "all" ? "white" : "#475569",
            }}
          >
            累计标签分布
          </button>
        </div>
      </div>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "16px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          marginBottom: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "#1e293b",
            marginBottom: "16px",
          }}
        >
          {activeStatsType === "today" ? "今日" : "累计"}专注时长分布
        </h3>

        {currentTagStats.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              color: "#94a3b8",
              fontSize: "14px",
            }}
          >
            暂无数据，开始你的第一个番茄钟吧！
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {currentTagStats.map((tagStat) => {
              const percentage = maxSeconds > 0 ? (tagStat.total_seconds / maxSeconds) * 100 : 0;
              const color = getTagColor(tagStat.tag);
              
              return (
                <div key={tagStat.tag}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          background: color,
                        }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#475569" }}>
                        {tagStat.tag}
                      </span>
                    </div>
                    <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                      {tagStat.count}个 · {formatDuration(tagStat.total_seconds)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "12px",
                      background: "#f1f5f9",
                      borderRadius: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        background: color,
                        borderRadius: "6px",
                        width: `${percentage}%`,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: "16px",
          textAlign: "center",
          padding: "16px",
          background: "#fef3c7",
          borderRadius: "12px",
        }}
      >
        <div style={{ fontSize: "14px", color: "#92400e", fontWeight: 500 }}>
          坚持专注，你做得很棒！
        </div>
      </div>
    </div>
  );
}

export default Statistics;
